// 极简多层感知机(MLP):所有权重放在一个扁平的 Float32Array 里。
// 这样进化策略可以把整个网络当成一个向量来加噪声、求和、在 Worker 之间传递。

/** 网络结构:各层的神经元数,例如 [44, 48, 48, 22] */
export type Layout = number[];

/** 给定结构需要多少个参数(权重 + 偏置) */
export function paramCount(layout: Layout): number {
  let n = 0;
  for (let i = 0; i < layout.length - 1; i++) n += (layout[i] + 1) * layout[i + 1];
  return n;
}

/**
 * 前向计算器。构造时预先分配好每层的缓冲区,forward 过程零内存分配,
 * 以保证训练时每秒能跑几十万次。
 */
export class Mlp {
  /** 每层神经元的当前取值(复用,避免反复分配内存) */
  private bufs: Float32Array[];
  constructor(public layout: Layout) {
    this.bufs = layout.map(n => new Float32Array(n));
  }

  /**
   * 前向传播。隐藏层用 tanh,输出层是线性的(由调用方做 argmax)。
   * @param params 扁平参数向量,排列方式:逐层 [权重(按输出神经元分行) , 偏置]
   * @param input  输入向量,长度须等于 layout[0]
   * @returns 输出层缓冲区(下次调用会被覆盖,需要保留请自行拷贝)
   */
  forward(params: Float32Array, input: Float32Array): Float32Array {
    const L = this.layout;
    this.bufs[0].set(input);
    let p = 0;
    for (let l = 0; l < L.length - 1; l++) {
      const a = this.bufs[l], b = this.bufs[l + 1];
      const nIn = L[l], nOut = L[l + 1];
      // 最后一层不做 tanh,输出原始分数
      const last = l === L.length - 2;
      // 先算加权和
      for (let j = 0; j < nOut; j++) {
        let sum = 0;
        for (let i = 0; i < nIn; i++) sum += params[p++] * a[i];
        b[j] = sum;
      }
      // 再加偏置并过激活函数 tanh(把值压到 -1..1)
      for (let j = 0; j < nOut; j++) {
        const v = b[j] + params[p++];
        b[j] = last ? v : Math.tanh(v);
      }
    }
    return this.bufs[L.length - 1];
  }
}

/**
 * 生成初始参数:按 1/sqrt(输入数) 缩放的随机值,偏置为 0。
 * @param rand 返回 [0,1) 的随机函数(传入确定性随机源以便复现)
 */
export function initParams(layout: Layout, rand: () => number): Float32Array {
  const out = new Float32Array(paramCount(layout));
  let p = 0;
  for (let l = 0; l < layout.length - 1; l++) {
    const nIn = layout[l], nOut = layout[l + 1];
    const scale = 1 / Math.sqrt(nIn);
    for (let k = 0; k < nIn * nOut; k++) out[p++] = (rand() * 2 - 1) * scale;
    p += nOut; // 偏置保持 0
  }
  return out;
}
