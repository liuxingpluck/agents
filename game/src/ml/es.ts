// 进化策略(OpenAI-ES):不需要反向传播,只需要「试一试、打个分」。
//
// 每一代:
//   1. 以当前参数 θ 为中心,生成 N 对方向相反的噪声 ±ε(镜像采样)
//   2. 让 θ+σε 和 θ−σε 各打几局,得到分数
//   3. 分数高的噪声方向权重大,加权求和得到「往哪边改更好」的估计
//   4. 用 Adam 沿这个方向更新 θ
// 噪声由种子重新生成,所以 Worker 之间只需要传种子和分数,不用传整份噪声。

/**
 * 带种子的高斯(正态分布)随机数发生器:同一个种子永远生成同一串数。
 * 内部先用 mulberry32 造均匀随机数,再用 Box-Muller 变成正态分布。
 */
export function makeGauss(seed: number): () => number {
  let s = seed >>> 0 || 1;
  const u = () => {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Box-Muller 一次算出两个数,多出来的存这里下次用
  let spare: number | null = null;
  return () => {
    if (spare !== null) { const v = spare; spare = null; return v; }
    let a = 0;
    while (a === 0) a = u();
    const r = Math.sqrt(-2 * Math.log(a)), th = 2 * Math.PI * u();
    spare = r * Math.sin(th);
    return r * Math.cos(th);
  };
}

/**
 * 生成加了噪声的参数副本:out = θ + sign·σ·ε(seed)。
 * sign 为 1 / -1,对应一对「镜像」噪声的两个方向。
 */
export function perturb(theta: Float32Array, seed: number, sigma: number, sign: 1 | -1, out: Float32Array) {
  const g = makeGauss(seed);
  for (let i = 0; i < theta.length; i++) out[i] = theta[i] + sign * sigma * g();
}

/**
 * 中心化排名变换:把原始分数换成 [-0.5, 0.5] 的名次分。
 * 这样个别极端分数不会主导更新方向,训练更稳。
 */
export function centeredRanks(scores: number[]): number[] {
  const idx = scores.map((_, i) => i).sort((a, b) => scores[a] - scores[b]);
  const out = new Array<number>(scores.length);
  const n = scores.length;
  idx.forEach((id, rank) => { out[id] = n > 1 ? rank / (n - 1) - 0.5 : 0; });
  return out;
}

export interface EsConfig {
  /** 镜像噪声的对数;种群大小 = pairs × 2 */
  pairs: number;
  /** 噪声标准差 */
  sigma: number;
  /** 学习率 */
  lr: number;
  /** 权重衰减(防止参数无限增大) */
  weightDecay: number;
}

/** 默认超参数(训练界面没改时用这组) */
export const DEFAULT_ES: EsConfig = { pairs: 24, sigma: 0.08, lr: 0.03, weightDecay: 0.002 };

/** 训练器的可持久化状态 */
export interface EsState {
  theta: Float32Array;
  /** Adam 的一阶 / 二阶动量 */
  m: Float32Array;
  v: Float32Array;
  generation: number;
}

/** 用初始参数建立一个全新的训练状态(动量清零、第 0 代) */
export function newEsState(theta: Float32Array): EsState {
  return { theta, m: new Float32Array(theta.length), v: new Float32Array(theta.length), generation: 0 };
}

/**
 * 用一代的评估结果更新参数。
 * @param seeds     每对噪声的种子
 * @param fitPos    θ+σε 的分数(与 seeds 一一对应)
 * @param fitNeg    θ−σε 的分数
 */
export function esUpdate(st: EsState, cfg: EsConfig, seeds: number[], fitPos: number[], fitNeg: number[]) {
  const n = seeds.length, dim = st.theta.length;
  // 正、负方向的分数放一起排名,前 n 个是正方向,后 n 个是负方向
  const ranks = centeredRanks([...fitPos, ...fitNeg]);
  const grad = new Float32Array(dim);
  for (let k = 0; k < n; k++) {
    const wgt = ranks[k] - ranks[n + k]; // 正方向比负方向好多少
    if (wgt === 0) continue;
    const g = makeGauss(seeds[k]);
    for (let i = 0; i < dim; i++) grad[i] += wgt * g();
  }
  // 把累加结果换算成梯度估计的比例系数
  const scale = 1 / (2 * n * cfg.sigma);
  st.generation++;
  // Adam:给每个参数各自调节步长的更新法;c1/c2 是开局阶段的偏差修正
  const b1 = 0.9, b2 = 0.999, t = st.generation;
  const c1 = 1 - Math.pow(b1, t), c2 = 1 - Math.pow(b2, t);
  for (let i = 0; i < dim; i++) {
    const g = grad[i] * scale - cfg.weightDecay * st.theta[i]; // 梯度上升方向
    st.m[i] = b1 * st.m[i] + (1 - b1) * g;
    st.v[i] = b2 * st.v[i] + (1 - b2) * g * g;
    st.theta[i] += cfg.lr * (st.m[i] / c1) / (Math.sqrt(st.v[i] / c2) + 1e-8);
  }
}
