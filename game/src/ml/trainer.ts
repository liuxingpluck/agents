// 训练调度器(主线程):管理一组 Worker,循环执行「分发评估 → 汇总分数 → 更新参数」,
// 并负责考试、对手池(自博弈:让 AI 和自己过去的版本对打)和存档。
// 它只在主线程做调度和汇总,真正耗时的对战模拟都在 worker.ts 里跑。
import { Rng } from '../sim/world';
import { DEFAULT_ES, EsConfig, EsState, esUpdate, newEsState } from './es';
import { EvalSpec } from './evaluate';
import { EPISODE_FRAMES } from './env';
import { initParams, Layout } from './mlp';
import { OBS_VERSION } from './obs';
import { DEFAULT_LAYOUT } from './policy';
import type { WorkerRequest, WorkerResponse } from './worker';

/** 一次考试的记录(用来画曲线) */
export interface ExamPoint { generation: number; winRate: number; lossRate: number; dealt: number; taken: number; maxCombo: number }

/** 每代结束后通知界面的进度信息 */
export interface Progress {
  generation: number;
  /** 本代种群的平均 / 最高适应度 */
  meanFitness: number; bestFitness: number;
  /** 估算的模拟速度(步 / 秒,所有 Worker 合计) */
  stepsPerSec: number;
  /** 最近一代耗时(毫秒) */
  genMs: number;
  history: ExamPoint[];
  poolSize: number;
}

/** 创建训练器时的设置 */
export interface TrainerOptions {
  /** 被训练的角色 id / 对手角色 id */
  hero: string; foe: string;
  /** 同时开几个后台 Worker(一般按 CPU 核数) */
  workers: number;
  /** 是否启用自博弈(把历史快照放进对手池) */
  selfPlay: boolean;
  /** 覆盖默认的进化策略超参数 */
  es?: Partial<EsConfig>;
  /** 自定义网络结构,不填用默认 */
  layout?: Layout;
}

/** Float32Array ↔ base64,用于存进 localStorage / 导出 JSON */
export function f32ToB64(a: Float32Array): string {
  const u8 = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
/** base64 还原成 Float32Array(f32ToB64 的反操作) */
export function b64ToF32(b: string): Float32Array {
  const s = atob(b), u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return new Float32Array(u8.buffer);
}

/** 存档格式 */
export interface SavedModel {
  // format / obsVersion 用来识别文件、避免加载不兼容的旧存档
  format: 'ashen-abyss-ai'; obsVersion: number; hero: string; foe: string; layout: Layout;
  // theta = 网络参数;m、v = Adam 优化器的动量(续训时要一起恢复);都转成 base64 文本
  generation: number; theta: string; m: string; v: string; history: ExamPoint[];
}

/** 浏览器本地存储里,每个角色各存一份模型的键名 */
export const storageKey = (hero: string) => `ashen-abyss.ai.v${OBS_VERSION}.${hero}`;

/** 读取某个角色已保存的模型;没有或版本不符时返回 null */
export function loadModel(hero: string): SavedModel | null {
  try {
    const raw = localStorage.getItem(storageKey(hero));
    if (!raw) return null;
    const m = JSON.parse(raw) as SavedModel;
    return m.format === 'ashen-abyss-ai' && m.obsVersion === OBS_VERSION ? m : null;
  } catch { return null; }
}

/** 训练调度器:开 Worker、循环训练、考试、存档 */
export class Trainer {
  readonly cfg: EsConfig;
  readonly layout: Layout;
  /** 当前的网络参数与优化器状态 */
  state: EsState;
  /** 每次考试的成绩,界面用来画进步曲线 */
  history: ExamPoint[] = [];
  /** 自博弈对手池:过去若干代的参数快照 */
  pool: Float32Array[] = [];
  /** 为 false 时训练循环在当前这一代结束后停下 */
  running = false;
  /** 每代结束后的回调,界面通过它刷新 */
  onProgress: ((p: Progress) => void) | null = null;
  private workers: Worker[] = [];
  /** 已发出、还在等回复的请求,按 id 对应各自的回调 */
  private pending = new Map<number, (r: WorkerResponse) => void>();
  private nextId = 1;
  private rng = new Rng((Date.now() & 0x7fffffff) | 1);

  constructor(public opts: TrainerOptions) {
    this.cfg = { ...DEFAULT_ES, ...opts.es };
    this.layout = opts.layout ?? DEFAULT_LAYOUT;
    // 有存档且网络结构一致就接着练,否则随机初始化重新开始
    const saved = loadModel(opts.hero);
    if (saved && saved.layout.join() === this.layout.join()) {
      this.state = { theta: b64ToF32(saved.theta), m: b64ToF32(saved.m), v: b64ToF32(saved.v), generation: saved.generation };
      this.history = saved.history ?? [];
    } else {
      this.state = newEsState(initParams(this.layout, () => this.rng.next()));
    }
    for (let i = 0; i < Math.max(1, opts.workers); i++) {
      const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
        const cb = this.pending.get(ev.data.id);
        if (cb) { this.pending.delete(ev.data.id); cb(ev.data); }
      };
      this.workers.push(w);
    }
  }

  /** 向指定 Worker 发请求并等待回应 */
  private call(wi: number, req: WorkerRequest): Promise<WorkerResponse> {
    return new Promise(resolve => {
      this.pending.set(req.id, resolve);
      this.workers[wi].postMessage(req);
    });
  }

  /** 组装本次评估任务的说明(自博弈关闭时对手池为空) */
  private spec(seed: number): EvalSpec {
    return { hero: this.opts.hero, foe: this.opts.foe, layout: this.layout, seed, scriptAggression: 0.6, pool: this.opts.selfPlay ? this.pool : [] };
  }

  /** 开始(或继续)训练,直到调用 stop() */
  async start() {
    if (this.running) return;
    this.running = true;
    if (this.history.length === 0) await this.runExam();
    while (this.running) await this.generation();
  }

  /** 请求停止(当前这一代跑完后生效) */
  stop() { this.running = false; }

  /** 跑一代 */
  private async generation() {
    const t0 = performance.now();
    const { pairs, sigma } = this.cfg;
    const seeds = Array.from({ length: pairs }, () => 1 + this.rng.int(2 ** 31 - 2));
    const spec = this.spec(1 + this.rng.int(1e9));
    // 把种子平均分给各个 Worker
    const n = this.workers.length;
    const chunks: number[][] = Array.from({ length: n }, () => []);
    seeds.forEach((s, i) => chunks[i % n].push(s));
    const results = await Promise.all(chunks.map((c, wi) =>
      c.length ? this.call(wi, { type: 'eval', id: this.nextId++, theta: this.state.theta, sigma, seeds: c, spec }) : Promise.resolve(null)));
    const allSeeds: number[] = [], pos: number[] = [], neg: number[] = [];
    results.forEach((r, wi) => {
      if (!r || r.type !== 'eval') return;
      allSeeds.push(...chunks[wi]); pos.push(...r.pos); neg.push(...r.neg);
    });
    esUpdate(this.state, this.cfg, allSeeds, pos, neg);
    const g = this.state.generation;

    // 每 5 代考一次试并存档;自博弈时每 10 代把当前版本存进对手池,池最多保留 6 个
    if (g % 5 === 0) await this.runExam();
    if (this.opts.selfPlay && g % 10 === 0) {
      this.pool.push(this.state.theta.slice());
      if (this.pool.length > 6) this.pool.shift();
    }
    if (g % 5 === 0) this.save();

    const genMs = performance.now() - t0;
    const all = [...pos, ...neg];
    const episodes = all.length * (spec.pool.length ? 4 : 2);
    this.onProgress?.({
      generation: g,
      meanFitness: all.reduce((a, b) => a + b, 0) / all.length,
      bestFitness: Math.max(...all),
      // 每局最多 EPISODE_FRAMES 步,提前分出胜负会更少,所以这是上限估计
      stepsPerSec: Math.round((episodes * EPISODE_FRAMES) / (genMs / 1000)),
      genMs, history: this.history, poolSize: this.pool.length,
    });
  }

  /** 考试:固定题目对战脚本 AI,记录到 history */
  private async runExam() {
    const r = await this.call(0, { type: 'exam', id: this.nextId++, theta: this.state.theta, spec: this.spec(0), games: 10 });
    if (r.type === 'exam') this.history.push({ generation: this.state.generation, ...r.result });
  }

  /** 导出为可保存 / 分享的对象 */
  export(): SavedModel {
    return {
      format: 'ashen-abyss-ai', obsVersion: OBS_VERSION, hero: this.opts.hero, foe: this.opts.foe, layout: this.layout,
      generation: this.state.generation, theta: f32ToB64(this.state.theta), m: f32ToB64(this.state.m), v: f32ToB64(this.state.v),
      history: this.history,
    };
  }

  /** 存到浏览器本地(下次打开页面自动接着练) */
  save() {
    try { localStorage.setItem(storageKey(this.opts.hero), JSON.stringify(this.export())); } catch { /* 存储不可用时忽略 */ }
  }

  /** 丢弃当前模型,从随机参数重新开始 */
  reset() {
    this.state = newEsState(initParams(this.layout, () => this.rng.next()));
    this.history = []; this.pool = [];
    try { localStorage.removeItem(storageKey(this.opts.hero)); } catch { /* ignore */ }
  }

  /** 载入外部模型(导入文件时用) */
  import(m: SavedModel) {
    if (m.format !== 'ashen-abyss-ai' || m.obsVersion !== OBS_VERSION) throw new Error('模型版本不兼容');
    if (m.layout.join() !== this.layout.join()) throw new Error('网络结构不一致');
    this.state = { theta: b64ToF32(m.theta), m: b64ToF32(m.m), v: b64ToF32(m.v), generation: m.generation };
    this.history = m.history ?? [];
    this.save();
  }

  /** 关闭训练器:停止并销毁所有 Worker */
  dispose() { this.stop(); for (const w of this.workers) w.terminate(); this.workers = []; }
}
