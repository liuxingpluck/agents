// 用显卡(WebGPU)批量计算神经网络,并和 CPU 对比速度。
//
// 目前训练并不使用显卡——训练时间主要花在跑游戏模拟上,而且网络很小。
// 这个文件的作用是把「显卡到底有没有用」变成可以实测的事实:
// 训练页的「显卡测试」会先核对显卡算出的结果与 CPU 一致,再比较不同批量下谁更快。
// 以后模型变大、需要成批推理时,可以直接复用这里的 GpuMlp。
//
// WebGPU 的类型定义没有装,这里统一用 any;逻辑都很直白。
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Layout, Mlp, paramCount } from './mlp';

/** 计算着色器:算一层全连接。每个线程负责「第 b 个样本的第 j 个输出」。 */
const SHADER = /* wgsl */ `
struct U { nIn: u32, nOut: u32, batch: u32, wOff: u32, last: u32 };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read> params: array<f32>;
@group(0) @binding(2) var<storage, read> inp: array<f32>;
@group(0) @binding(3) var<storage, read_write> outp: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let idx = id.x;
  if (idx >= u.batch * u.nOut) { return; }
  let b = idx / u.nOut;
  let j = idx % u.nOut;
  // 参数排列与 CPU 版(mlp.ts)一致:先是权重(按输出神经元分行),再是偏置
  var sum = params[u.wOff + u.nIn * u.nOut + j];
  for (var i = 0u; i < u.nIn; i++) {
    sum += params[u.wOff + j * u.nIn + i] * inp[b * u.nIn + i];
  }
  if (u.last == 0u) { sum = tanh(sum); }
  outp[idx] = sum;
}`;

/** 浏览器是否支持 WebGPU */
export function gpuSupported(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as any).gpu;
}

/** 在显卡上批量跑前向计算的网络 */
export class GpuMlp {
  private constructor(
    private device: any, private pipeline: any, private layout: Layout, private maxBatch: number,
    private paramBuf: any, private bufs: any[], private uniforms: any[], private groups: any[], private readBuf: any,
    /** 显卡名称(界面显示用) */
    readonly adapterName: string,
  ) {}

  /**
   * 申请显卡并准备好缓冲区。
   * @param maxBatch 一次最多算多少个样本
   * @returns 不支持 WebGPU 或申请失败时返回 null
   */
  static async create(layout: Layout, maxBatch: number): Promise<GpuMlp | null> {
    const gpu = (navigator as any).gpu;
    if (!gpu) return null;
    const adapter = await gpu.requestAdapter();
    if (!adapter) return null;
    const device = await adapter.requestDevice();
    const G = (globalThis as any).GPUBufferUsage;
    const module = device.createShaderModule({ code: SHADER });
    const pipeline = await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'main' } });
    const paramBuf = device.createBuffer({ size: paramCount(layout) * 4, usage: G.STORAGE | G.COPY_DST });
    // 每层一块缓冲区:第 0 块放输入,之后每块放一层的输出,上一层的输出就是下一层的输入
    const bufs = layout.map(n => device.createBuffer({ size: n * maxBatch * 4, usage: G.STORAGE | G.COPY_DST | G.COPY_SRC }));
    const uniforms: any[] = [], groups: any[] = [];
    for (let l = 0; l < layout.length - 1; l++) {
      const ub = device.createBuffer({ size: 32, usage: G.UNIFORM | G.COPY_DST });
      uniforms.push(ub);
      groups.push(device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: ub } }, { binding: 1, resource: { buffer: paramBuf } },
          { binding: 2, resource: { buffer: bufs[l] } }, { binding: 3, resource: { buffer: bufs[l + 1] } },
        ],
      }));
    }
    const readBuf = device.createBuffer({ size: layout[layout.length - 1] * maxBatch * 4, usage: G.MAP_READ | G.COPY_DST });
    const info = adapter.info ?? {};
    return new GpuMlp(device, pipeline, layout, maxBatch, paramBuf, bufs, uniforms, groups, readBuf, info.description || info.vendor || '未知显卡');
  }

  /** 上传网络参数(换模型时调用一次) */
  setParams(params: Float32Array) {
    this.device.queue.writeBuffer(this.paramBuf, 0, params);
  }

  /**
   * 批量前向计算。
   * @param inputs 连续排放的 batch 个输入向量
   * @returns 连续排放的 batch 个输出向量
   */
  async forward(inputs: Float32Array, batch: number): Promise<Float32Array> {
    const L = this.layout, dev = this.device;
    if (batch > this.maxBatch) throw new Error('批量超过了创建时的上限');
    dev.queue.writeBuffer(this.bufs[0], 0, inputs, 0, batch * L[0]);
    const enc = dev.createCommandEncoder();
    let wOff = 0;
    for (let l = 0; l < L.length - 1; l++) {
      dev.queue.writeBuffer(this.uniforms[l], 0, new Uint32Array([L[l], L[l + 1], batch, wOff, l === L.length - 2 ? 1 : 0, 0, 0, 0]));
      const pass = enc.beginComputePass();
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.groups[l]);
      pass.dispatchWorkgroups(Math.ceil((batch * L[l + 1]) / 64));
      pass.end();
      wOff += (L[l] + 1) * L[l + 1];
    }
    const outN = batch * L[L.length - 1];
    enc.copyBufferToBuffer(this.bufs[L.length - 1], 0, this.readBuf, 0, outN * 4);
    dev.queue.submit([enc.finish()]);
    // 把结果从显卡读回来(这一步是异步的,也是小批量时显卡反而更慢的主要原因)
    await this.readBuf.mapAsync((globalThis as any).GPUMapMode.READ, 0, outN * 4);
    const out = new Float32Array(this.readBuf.getMappedRange(0, outN * 4).slice(0));
    this.readBuf.unmap();
    return out;
  }

  dispose() { this.device.destroy?.(); }
}

/** 一种批量大小下的测速结果 */
export interface GpuBenchRow { batch: number; cpuPerSec: number; gpuPerSec: number }
export interface GpuBenchResult {
  adapter: string;
  /** 显卡与 CPU 结果的最大差值(应当接近 0) */
  maxDiff: number;
  rows: GpuBenchRow[];
}

/**
 * 显卡测试:先核对正确性,再在几种批量大小下比较 CPU 与显卡每秒能算多少个样本。
 * @param rand 返回 [0,1) 的随机函数
 */
export async function benchmarkGpu(layout: Layout, params: Float32Array, rand: () => number, batches = [64, 1024, 16384]): Promise<GpuBenchResult | null> {
  const maxBatch = Math.max(...batches);
  const g = await GpuMlp.create(layout, maxBatch);
  if (!g) return null;
  g.setParams(params);
  const nIn = layout[0], nOut = layout[layout.length - 1];
  const inputs = new Float32Array(maxBatch * nIn);
  for (let i = 0; i < inputs.length; i++) inputs[i] = rand() * 2 - 1;
  const cpu = new Mlp(layout);

  // 正确性:取前 256 个样本,逐个与 CPU 的结果比较
  const check = Math.min(256, maxBatch);
  const gOut = await g.forward(inputs, check);
  let maxDiff = 0;
  for (let b = 0; b < check; b++) {
    const c = cpu.forward(params, inputs.subarray(b * nIn, (b + 1) * nIn));
    for (let j = 0; j < nOut; j++) maxDiff = Math.max(maxDiff, Math.abs(c[j] - gOut[b * nOut + j]));
  }

  const rows: GpuBenchRow[] = [];
  for (const batch of batches) {
    // CPU:重复若干轮,凑够一段可测量的时间
    let t0 = performance.now(), n = 0;
    do { for (let b = 0; b < batch; b++) cpu.forward(params, inputs.subarray(b * nIn, (b + 1) * nIn)); n += batch; } while (performance.now() - t0 < 150);
    const cpuPerSec = n / ((performance.now() - t0) / 1000);
    // 显卡:同样的批量,包含上传输入与读回结果的时间
    await g.forward(inputs, batch); // 预热一次
    t0 = performance.now(); n = 0;
    do { await g.forward(inputs, batch); n += batch; } while (performance.now() - t0 < 150);
    const gpuPerSec = n / ((performance.now() - t0) / 1000);
    rows.push({ batch, cpuPerSec, gpuPerSec });
  }
  const adapter = g.adapterName;
  g.dispose();
  return { adapter, maxDiff, rows };
}
