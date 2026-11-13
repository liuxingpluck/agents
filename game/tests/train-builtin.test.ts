// 离线训练内置模型:给每个主角练一个神经网络,存到 public/models/<角色>.json,随游戏一起发布。
// 平时跑测试不会执行(需要设置环境变量 TRAIN_HEROES)。用法(在 game/ 下):
//   TRAIN_HEROES=kael,sera TRAIN_GENS=150 npx vitest run tests/train-builtin.test.ts --disable-console-intercept
// 可选:TRAIN_CONTINUE=1 接着已有模型继续练;TRAIN_LEAGUE=1 把其他角色已有的模型当作对手(联赛)。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HEROES, ROSTER } from '../src/data/characters';
import { DEFAULT_ES, esUpdate, newEsState, perturb } from '../src/ml/es';
import { evaluate, EvalSpec, exam } from '../src/ml/evaluate';
import { initParams } from '../src/ml/mlp';
import { OBS_VERSION } from '../src/ml/obs';
import { DEFAULT_LAYOUT } from '../src/ml/policy';
import { Rng } from '../src/sim/world';

const heroes = (process.env.TRAIN_HEROES ?? '').split(',').filter(id => ROSTER[id]);
const GENS = Number(process.env.TRAIN_GENS ?? 150);
const file = (id: string) => new URL(`../public/models/${id}.json`, import.meta.url);
const toB64 = (a: Float32Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
const fromB64 = (b: string) => { const buf = Buffer.from(b, 'base64'); return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)); };

/** 读取某个角色已有的内置模型(没有则返回 null) */
function load(id: string): { theta: Float32Array; generation: number } | null {
  if (!existsSync(file(id))) return null;
  const m = JSON.parse(readFileSync(file(id), 'utf8'));
  return m.obsVersion === OBS_VERSION ? { theta: fromB64(m.theta), generation: m.generation } : null;
}

describe.skipIf(heroes.length === 0)('离线训练内置模型', () => {
  for (const hero of heroes) {
    it(`训练 ${hero}`, () => {
      const rng = new Rng(hero.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0);
      const prev = process.env.TRAIN_CONTINUE ? load(hero) : null;
      const st = newEsState(prev?.theta ?? initParams(DEFAULT_LAYOUT, () => rng.next()));
      const startGen = prev?.generation ?? 0;
      const league = process.env.TRAIN_LEAGUE
        ? HEROES.filter(h => h.id !== hero).map(h => ({ hero: h.id, m: load(h.id) })).filter(x => x.m).map(x => ({ hero: x.hero, theta: x.m!.theta }))
        : [];
      const cfg = { ...DEFAULT_ES, pairs: 20 };
      const pool: Float32Array[] = [];
      const tmp = new Float32Array(st.theta.length);
      const t0 = Date.now();
      for (let g = 0; g < GENS; g++) {
        // 每一代换一个对手角色,逼着模型学会应付各种打法;脚本 AI 的凶猛程度也来回变
        const spec: EvalSpec = {
          hero, foe: HEROES[(g * 7 + 3) % HEROES.length].id, layout: DEFAULT_LAYOUT,
          seed: 1 + rng.int(1e9), scriptAggression: g % 2 ? 0.9 : 0.6, pool, league,
        };
        const seeds: number[] = [], pos: number[] = [], neg: number[] = [];
        for (let k = 0; k < cfg.pairs; k++) {
          const s = 1 + rng.int(2 ** 31 - 2);
          seeds.push(s);
          perturb(st.theta, s, cfg.sigma, 1, tmp); pos.push(evaluate(ROSTER, tmp, spec));
          perturb(st.theta, s, cfg.sigma, -1, tmp); neg.push(evaluate(ROSTER, tmp, spec));
        }
        esUpdate(st, cfg, seeds, pos, neg);
        if ((g + 1) % 10 === 0) { pool.push(st.theta.slice()); if (pool.length > 6) pool.shift(); }
      }
      // 考试:对三个不同的对手角色各打 6 局,取平均
      const foes = [hero, HEROES[0].id, HEROES[4].id];
      const ex = foes.map(foe => exam(ROSTER, st.theta, { hero, foe, layout: DEFAULT_LAYOUT, seed: 0, scriptAggression: 0.6, pool: [] }, 6));
      const avg = (k: 'winRate' | 'winRateHard' | 'dealt' | 'taken') => ex.reduce((a, e) => a + e[k], 0) / ex.length;
      const summary = { winRate: +avg('winRate').toFixed(2), winRateHard: +avg('winRateHard').toFixed(2), dealt: +avg('dealt').toFixed(2), taken: +avg('taken').toFixed(2) };
      writeFileSync(file(hero), JSON.stringify({
        format: 'ashen-abyss-ai', obsVersion: OBS_VERSION, hero, foe: hero, layout: DEFAULT_LAYOUT,
        generation: startGen + GENS, theta: toB64(st.theta), history: [], summary,
      }));
      console.log(`${hero} 第 ${startGen + GENS} 代 用时 ${Math.round((Date.now() - t0) / 1000)}s ${JSON.stringify(summary)}`);
      expect(st.generation).toBe(GENS);
    }, 3600_000);
  }
});
