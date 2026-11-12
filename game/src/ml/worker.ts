// 训练 Worker:在后台线程里空跑对战,不阻塞页面。
// 主线程发来「当前参数 + 一批噪声种子」,这里把每个种子的正负两个个体各评估一次,把分数发回去。
import { ROSTER } from '../data/characters';
import { perturb } from './es';
import { evaluate, EvalSpec, exam } from './evaluate';

/** 主线程 → Worker 的消息 */
export type WorkerRequest =
  | { type: 'eval'; id: number; theta: Float32Array; sigma: number; seeds: number[]; spec: EvalSpec }
  | { type: 'exam'; id: number; theta: Float32Array; spec: EvalSpec; games: number };

/** Worker → 主线程的消息 */
export type WorkerResponse =
  | { type: 'eval'; id: number; pos: number[]; neg: number[]; ms: number }
  | { type: 'exam'; id: number; result: ReturnType<typeof exam> };

let tmp = new Float32Array(0);

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  if (msg.type === 'eval') {
    if (tmp.length !== msg.theta.length) tmp = new Float32Array(msg.theta.length);
    const t0 = performance.now();
    const pos: number[] = [], neg: number[] = [];
    for (const s of msg.seeds) {
      perturb(msg.theta, s, msg.sigma, 1, tmp); pos.push(evaluate(ROSTER, tmp, msg.spec));
      perturb(msg.theta, s, msg.sigma, -1, tmp); neg.push(evaluate(ROSTER, tmp, msg.spec));
    }
    const res: WorkerResponse = { type: 'eval', id: msg.id, pos, neg, ms: performance.now() - t0 };
    (self as unknown as Worker).postMessage(res);
  } else if (msg.type === 'exam') {
    const res: WorkerResponse = { type: 'exam', id: msg.id, result: exam(ROSTER, msg.theta, msg.spec, msg.games) };
    (self as unknown as Worker).postMessage(res);
  }
};
