# 浏览器内训练 "System 1" 快速决策模型调研

调研日期:2026-11-12。方法:Web search(搜索工具返回的是摘要,多数细节未能打开原文核对;标注"未核实"的结论请在落地前再确认)。

## 0. 结论先行

- **Phase 1**:手写 MLP(Float32Array,40→64→64→N)+ **OpenAI-ES(带 mirrored sampling + rank 归一化 + common random numbers)**,多 Worker 并行评估,自博弈 + 对手池。无需任何 ML 库、无需 autodiff、无需 SharedArrayBuffer。约 300-500 行 TS。
- **Phase 2**:需要更强样本效率时,上 **PPO/DQN + WebGPU compute**(手写 WGSL,或使用 jax-js 获得 autodiff);sim 仍在 Worker CPU 跑,GPU 只做批量推理 / 训练。
- 不推荐把 TF.js / ONNX Runtime Web 作为主线:对 2x64 MLP 来说体积和调度开销都远大于收益。
- 名称 "jev"/"JEV":**未找到**任何以此命名的浏览器端快速模型(见 §5)。最接近的是 **JEPA**(Joint-Embedding Predictive Architecture),它是 world model / 表征学习方法,不是现成的"快速决策模型",也不适合作为本项目 phase 1。

## 1. 库对比

| 方案 | 浏览器训练 | Worker 内可用 | 体积 | 适合度 |
|---|---|---|---|---|
| TF.js (webgl/webgpu/wasm) | 支持(layers/ops + autodiff,tf.train) | 见下 | 大(core 数百 KB 级 + backend,未核实具体数字) | 低-中 |
| ONNX Runtime Web | 推理为主;training for web 有但很窄 | 可(自带 proxy worker) | wasm 数 MB 级(未核实) | 低 |
| 手写 TS MLP | 完全自己控制 | 完全可以 | 0 依赖,几 KB | **高(phase 1)** |
| jax-js | 有 autodiff / JIT,WebGPU + Wasm | 未核实 | 小-中(未核实) | 中(phase 2 候选) |
| Burn / Candle (Rust→WASM) | 推理有示例,浏览器训练处于 R&D | 可 | wasm 数百 KB-MB | 低(工具链成本) |
| WebNN | 仅推理 API,仍实验 | -- | 浏览器内置 | 不可用于训练 |
| brain.js / ConvNetJS / REINFORCEjs | 小库可训练,基本无人维护(未核实) | 可 | 小 | 参考实现,不建议依赖 |
| transformers.js | 仅推理(基于 ORT Web) | 可 | 大 | 无关 |

### 1.1 TensorFlow.js
- backends:webgl(成熟)、webgpu(Chrome 文档称"支持大部分算子的 WebGPU 优化版本",官方 README 称仍在 Canary 上测试,生产成熟度未核实)、wasm(CPU,可 SIMD/多线程,多线程需 cross-origin isolation)、cpu。
- 训练:tfjs 的 `tf.train.*` + `tf.variableGrads` 在各 backend 上原则上都能做反向传播,但 webgpu backend 的训练算子完整度未核实。
- Worker:wasm / cpu backend 可在 Worker 跑;webgl 需要 OffscreenCanvas(浏览器相关,未核实);webgpu 在 Worker 中理论上可用(WebGPU 本身支持 worker),tfjs 具体支持未核实。
- 项目维护状态:搜索只看到 core TensorFlow 社区对更新缓慢的抱怨,tfjs 自身 2025-2026 的发布节奏**未核实**;选它有"被弃坑"风险。
- 小网络问题:2x64 MLP、batch 小时,GPU 调度 / readback 延迟(每次 `dataSync`)远大于计算本身,比手写 JS 还慢是常见现象(经验判断,未核实具体 benchmark)。
- 来源:
  - https://www.npmjs.com/package/@tensorflow/tfjs-backend-webgpu
  - https://developer.chrome.com/docs/web-platform/webgpu/overview
  - https://discuss.ai.google.dev/t/is-tensorflow-dead/113640

### 1.2 ONNX Runtime Web
- 推理:wasm(CPU,SIMD/threads)、WebGL、WebGPU(1.17 起正式)、WebNN EP。
- 训练:2024 年 2 月微软发布 "On-Device Training: training a model in browser"。流程需要**离线**(Python)生成 training artifacts(training/eval/optimizer graph),再在浏览器加载;web 训练包只有 CPU EP(2024 资料,2025-2026 是否扩展 GPU **未核实**)。对 RL 自博弈(需要自定义 loss / 动态数据)非常不方便。
- 结论:适合"离线训练好 → 浏览器推理",不适合本项目的"浏览器内自博弈训练"。
- 来源:
  - https://opensource.microsoft.com/blog/2024/02/06/on-device-training-training-a-model-in-browser
  - https://onnxruntime.ai/docs/get-started/training-on-device.html
  - https://onnxruntime.ai/blogs/ort-1-17-release

### 1.3 手写 MLP(Float32Array)
- 40×64 + 64×64 + 64×N(N≈30)≈ 2560+4096+1920 + biases ≈ **8.7k 参数**。一次前向 ≈ 8.7k MAC ≈ 17k FLOP。
- 现代 JS 引擎(V8 JIT)对紧凑 Float32Array 循环约 0.5-2 GFLOP/s(经验估计,未核实)→ 单核约 **3-10 万次推理/秒**。若 sim 每帧每个 agent 推理,一般不是瓶颈;sim 本身才是。
- 可选 WGSL compute:批量(数千 agent 同时)前向时才划算;单 agent 不要上 GPU。
- 优势:零依赖,确定性(固定求值顺序),权重就是一个 `Float32Array`,Worker 间传输简单,序列化存 IndexedDB 简单。

### 1.4 jax-js(ekzhang)
- JAX 的纯 JS 实现,有 autodiff、JIT、vmap;WebGPU + Wasm 后端;MIT;有 MNIST 训练 demo。相对新(2026 年初前后发布,v0.1.x),API 可能变动。
- 适合作为 phase 2 想要 autodiff(PPO/DQN)而不想手写反向传播时的候选。Worker 支持、WebGPU 小 batch 性能、体积均**未核实**。
- 来源:
  - https://ekzhang.substack.com/p/jax-js-an-ml-library-for-the-web
  - https://cdn.jsdelivr.net/npm/@jax-js/jax@0.1.11/README.md

### 1.5 Burn / Candle / WebNN
- Burn:WebGPU(burn-wgpu)与 Wasm CPU(ndarray/candle)后端有浏览器推理示例;浏览器内训练在 issue 中被标为 R&D,未见已发布的证据。需要 Rust 工具链 + wasm-bindgen,与 TS/Vite 工程集成成本高。
- WebNN:2026 年 W3C Candidate Recommendation Draft,Chrome 以 origin trial/flag 提供(搜索结果称 Chrome 147-149 origin trial,未核实),只是推理 API,**不能用于训练**。
- 来源:
  - https://docs.rs/crate/burn/0.19.1/source/README.md
  - https://github.com/Tracel-AI/burn/issues/1254
  - https://xenospectrum.com/en/google-litert-js-browser-ai-webgpu-wasm-webnn/

### 1.6 其它
- brain.js / ConvNetJS / REINFORCEjs:教学级,代码量小,可作为阅读参考(REINFORCEjs 含 DQN/PG 的简洁 JS 实现);维护状态未核实,不建议作依赖。
- transformers.js:基于 ORT Web 的推理库,与本需求无关。

## 2. 关于 "jev" / "JEV" / JEPA

- 搜索 "JEV" + browser model:**没有找到**对应名字的浏览器模型或库。可能是口误/语音转写(JEPA?)或用户自己的内部名词;请用户确认。
- JEPA 相关浏览器项目(都是 demo 级,非游戏 AI 框架):
  - latent-lab:Two Rooms 导航环境的 action-conditioned JEPA world models,导出 ONNX 用 onnxruntime-web 推理 — https://huggingface.co/adimunot/latent-lab
  - DVD-JEPA:弹跳 logo 的小 world model,作者称 CPU 训练约 10 秒、可在浏览器运行 — https://mandarwagh-dvd-jepa.static.hf.space/index.html
  - nano-JEPA(~200M 参数检查点,不适合浏览器)— https://huggingface.co/sanju-1007/nano-JEPA
- 判断:JEPA 是"预测潜空间表征"的自监督方法,可用于 world model / 规划(System 2 方向),并不直接给出"状态→动作"策略。对 fully observable 的 40 维向量状态,没有表征学习的必要。**phase 1 不用**;若将来想做"预测对手下一步"的辅助头,可作为辅助任务考虑(未核实收益)。

## 3. RL 算法选择

观测 ~40 维,动作 20-50 个离散,网络 2x64。

| 算法 | 手写难度(无 autodiff) | 多 Worker 并行 | 稳健性 | 评价 |
|---|---|---|---|---|
| OpenAI-ES | 极低(无反向传播) | 天然并行,只传 seed+reward | 高,超参少 | **首选** |
| 简单 GA 神经进化 | 极低 | 天然并行 | 中,可能收敛慢 | 可作备选 / 基线 |
| CMA-ES | 中(协方差 O(n²)),n≈8.7k 时 full CMA 太重,需用 sep-CMA | 并行 | 高但实现复杂 | 参数多时不推荐 |
| PPO | 高(手写 backprop + GAE + 多 epoch) | 并行采样,学习集中 | 高但调参多 | phase 2 |
| DQN | 中-高(backprop + replay + target net) | 并行采样 | 对超参敏感,自博弈非平稳 | 不推荐用于自博弈 |

### 3.1 为什么选 ES
- 论文:Salimans et al. 2017 "Evolution Strategies as a Scalable Alternative to RL" — 并行只需交换标量 reward 与随机 seed,线性扩展;不需要反向传播。https://arxiv.org/abs/1703.03864 、https://openai.com/index/evolution-strategies
- 适合格斗游戏:episode 短、reward 稀疏(胜负、HP 差)、sim 确定性,fitness 评估干净。
- 缺点:样本效率比 PPO 低(通常 3-10 倍,经验判断未核实);适合"sim 很便宜"的场景——本项目正是。

### 3.2 ES 实现要点(几十行)
1. 参数 θ (Float32Array, ~8.7k)。每代 population = 2K(mirrored/antithetic:ε 与 -ε),K≈32-64。
2. 每个 Worker 用 seed 重建 ε(不传大数组),`θ ± σε` 做对局,返回 fitness。σ≈0.05-0.1(未核实,需调)。
3. fitness 做 centered rank 变换,更新 `θ += α/(Kσ) Σ rank_i · ε_i`;配 Adam 或带动量更稳;可加权重衰减。
4. **Common random numbers**:同一代内所有个体使用同一组对手 + 同一 sim seed 集合,降低方差。
5. 动作选择:argmax(确定性,利于 ES);加少量 epsilon 或对 logits 加噪声仅用于对局多样性。
6. 观测归一化(固定缩放常数,先不要用在线统计,避免确定性/同步问题)。
7. 输出 mask:非法动作(冷却中、硬直)在 argmax 前置 -∞,明显降低学习难度。

### 3.3 自博弈与对手池
- 对手池(league 简化版):保存历史 checkpoints(每 N 代一个)+ 几个手写规则 bot(防止 cycling,也给出稳定的 baseline)。
- 每个个体对:最新 θ 镜像对手(self)、随机 1-2 个池内旧版本、1 个规则 bot。fitness = 胜率 + 小的 HP 差 shaping + 少量"主动攻击"奖励(防止龟缩,系数需调)。
- 对称性:交换 P1/P2 侧各打一局,消除位置偏置。
- 评估:固定一组 "exam" 对局(固定 seed + 规则 bot)每若干代跑一次,画胜率曲线,UI 上显示——这是"肉眼可见变强"的关键。
- 参考:AlphaStar league / fictitious self-play 概念(未逐项核实具体论文,可后续补充)。

## 4. 吞吐量估计(未核实,需要实测)

- 瓶颈在 sim,而非 MLP。一个确定性 2D/2.5D 格斗 sim(无渲染,几个实体,碰撞盒检测),若写得好(避免每帧分配对象、用 typed arrays/struct-of-arrays),单核可达约 **10 万-100 万 sim step/秒**(量级估计)。含 MLP 推理(~2 万 FLOP/step)后大致 **5 万-30 万 step/秒/核**。
- 一场 60 秒 @60Hz = 3600 step;若决策每 4 帧一次 ≈ 900 次推理/场。
- 假设 8 个 Worker × 10 万 step/s = 80 万 step/s ≈ 220 场/秒/全局。一代 population 64 × 对手 6 场 = 384 场 ≈ 2 秒/代 → **一分钟约 30 代**,几分钟内应可见行为变化(例如学会靠近、出拳、防御)。这是估算,以实测为准。
- 提示:`navigator.hardwareConcurrency - 1` 个 Worker;UI 线程不跑 sim;节流避免桌面风扇狂转(提供 "训练强度" 滑块)。
- 在 Worker 里跑 sim 要求 sim 层 render-free,这一点本项目已具备。

## 5. GPU/WebGPU 在此场景的位置

- 状态:WebGPU 2026 年初已在主流浏览器(Chrome/Edge、Firefox、Safari 26)基本可用(来源:Chrome 文档与 web.dev,具体版本覆盖未逐一核实)。https://web.dev/blog/webgpu-supported-major-browsers 、https://github.com/gpuweb/gpuweb/wiki/implementation-status
- Worker 中可用 WebGPU(规范支持,各浏览器细节未核实)。
- 对 8.7k 参数的 MLP,单次推理放 GPU 毫无意义(调度+readback 延迟)。GPU 只在以下情形有价值:
  1. 批量推理:sim 并行成千上万场(sim 也需要在 GPU 或 CPU 批处理)——sim 在 CPU 时,把 observation 批量上传、logits 批量读回,延迟 ~1ms 级,每帧同步一次,需要 sim 以"批量步进"方式组织。
  2. PPO/大 batch 训练:minibatch 2048+ 时 matmul 才吃满 GPU。
- 手写 WGSL 的 MLP forward/backward:几个 kernel(matmul+bias+activation、softmax-CE 梯度、matmul 转置),约 300-500 行 WGSL+TS,可行但调试成本不低;或用 jax-js 省略这部分(其成熟度未核实)。

## 6. 工程实务

### 6.1 SharedArrayBuffer / COOP+COEP / GitHub Pages
- GitHub Pages 不能设置响应头(社区长期 feature request:https://github.com/orgs/community/discussions/13309),所以没有原生 cross-origin isolation。
- 解决:`coi-serviceworker`(gzuidhof/coi-serviceworker):把脚本放站点根目录,首次访问注册 Service Worker 并重新加载一次,由 SW 注入 COOP/COEP 头。https://github.com/gzuidhof/coi-serviceworker (链接来自常识+搜索间接结果,未直接打开核实)。注意事项(来自搜索摘要):需 HTTPS;脚本需与页面同级或更高目录,否则可能无限 reload;COEP 会影响第三方跨域资源(需要 CORS/CORP)。参考:
  - https://engineered.at/articles/setting-the-coop-and-coep-headers-on-static-hosting-like-github-pages
  - https://web.dev/cross-origin-isolation-guide/
  - https://dev.to/stefnotch/enabling-coop-coep-without-touching-the-server-2d3n
- **Phase 1 设计为不依赖 SAB**:ES 每代只传 seed 和标量 fitness,θ 约 35KB(8.7k×4B),`postMessage` 传输(structured clone 或 transfer ArrayBuffer)的开销可忽略。因此不需要 coi-serviceworker——省掉一整类部署风险。
- 若 phase 2 想让多 Worker 共享权重 / 经验回放缓冲,再引入 SAB + coi-serviceworker,并做特性检测 (`crossOriginIsolated`) 回退到消息传递。
- 备选:部署到可设头的主机(Cloudflare Pages `_headers`、Netlify、Vercel)。

### 6.2 Worker 间权重传输
- 主线程持有 θ;每代 `postMessage({theta: buf}, [buf])`(给每个 Worker 一份拷贝,因为 transfer 会让发送方失效,所以先 `slice()`)。
- Worker 返回 `Float32Array` fitness 片段。用 `Transferable` 或小数组直接 clone 即可。
- 用 Vite 的 `new Worker(new URL('./worker.ts', import.meta.url), {type:'module'})`。

### 6.3 IndexedDB 持久化
- 存:当前 θ、Adam 状态、代数、对手池 checkpoints(每个 35KB,100 个仅 3.5MB)、训练配置、sim 版本号/观测 schema 版本。
- 观测/动作空间或 sim 规则改变 → 版本号不匹配时丢弃或提示重训。
- 导出/导入:同时提供 JSON/二进制下载,方便把训练好的权重作为静态资源随游戏发布(发布版只需加载权重 + 推理,约 35KB)。
- 请求 `navigator.storage.persist()` 减少被清理(行为随浏览器,未核实)。

### 6.4 确定性与 seeding
- sim 必须只用注入的 PRNG(如 mulberry32 / xoshiro128**,纯整数运算),不得使用 `Math.random()`、`Date.now()`。
- MLP 前向的浮点求和顺序固定;同一浏览器/同一机器上 JS 浮点是确定性的(IEEE-754 double,`Math.fround` 做 Float32 舍入);**跨浏览器/CPU 对 `Math.exp/tanh` 等超越函数可能有 ulp 级差异**(V8 与 SpiderMonkey 实现不同,未核实具体差异)。→ 激活函数用 ReLU 或自实现的 tanh 近似(只用 +−×÷),可保证可重复。
- seed 派生:`seed(gen, individual, opponent, side)` 通过哈希函数生成,保证任意 Worker 数量下结果一致(Worker 数不影响训练结果,便于调试 / 回放)。
- 禁止 `-ffast-math` 式的 WASM SIMD 重排(如将来用 WASM 优化),保持固定归约顺序。

## 7. 推荐方案

### Phase 1(几百行,几分钟内可见变强)
文件拆分建议(仅规划,不是代码):
- `mlp.ts`:Float32Array 权重布局、forward(ReLU、动作 mask、argmax),~60 行。
- `obs.ts`:状态→40 维向量(相对位置、速度、双方 HP、阶段/冷却/帧数据 one-hot、距离、朝向),固定缩放常数,~60 行。
- `rollout.ts`:给定 θ_a, θ_b/规则 bot, seed → 跑 headless sim,返回 fitness,~80 行。
- `worker.ts`:收到 {theta, seeds, opponents} → 返回 fitness,~40 行。
- `es.ts`:mirrored sampling、centered rank、Adam、对手池与 curriculum,~120 行。
- `store.ts`:IndexedDB 存取,~50 行。
- UI:训练开关、代数、对规则 bot 胜率曲线、"观看最新 AI vs 旧 AI",~100 行。

关键设计决策:
1. ES (OpenAI-ES, mirrored, rank-shaping, CRN),population 64-128,σ≈0.05。
2. 动作决策频率 4-6 帧一次(action repeat/hold),大幅减少步数并稳定 ES。
3. 对手:规则 bot(课程:先弱后强)+ 最新自己 + 历史池;fitness 含胜率为主、HP 差与"接近/出手"小 shaping。
4. 动作 mask,观测相对化(以自身朝向镜像,让左右对称,减少学习量)。
5. 不依赖 SAB;Worker 数 = `hardwareConcurrency-1`。
6. 评估曲线可视化是验收标准:几分钟内对规则 bot 胜率应从随机水平明显上升(目标判断,需实测)。

风险:reward hacking(龟缩、卡角落)、ES 对 reward 尺度敏感(用 rank 变换缓解)、自博弈 cycling(对手池缓解)。

### Phase 2(WebGPU / 更强算法)
- 路线 A:保持 ES,但把"批量推理"搬 GPU——适用于需要极大 population(数千)的场景;sim 需批量化。收益有限。
- 路线 B(推荐):切换到 PPO(或 PPO + 自博弈 league),Worker 并行采样 → 主线程/Worker 内 WebGPU 训练。实现上选其一:
  - jax-js(autodiff + WebGPU/Wasm,省去手写反向传播;成熟度/体积未核实,需 spike);
  - 手写 WGSL(matmul forward/backward + Adam),完全可控。
- 路线 C:phase 1 训练出 ES 策略后,用其对局数据做 **behavior cloning / 蒸馏** 作为 PPO 的初始化。
- 若有 world model / "预测对手"需求,再评估 JEPA 风格辅助任务(未核实收益)。
- 先在 phase 1 里预留:权重格式版本号、observation schema 版本、`Policy` 接口(`act(obs, mask) -> action`),使 phase 2 可替换而不改 sim/游戏代码。

## 8. 来源汇总
- TF.js WebGPU backend: https://www.npmjs.com/package/@tensorflow/tfjs-backend-webgpu
- Chrome WebGPU overview: https://developer.chrome.com/docs/web-platform/webgpu/overview
- WebGPU 浏览器支持: https://web.dev/blog/webgpu-supported-major-browsers ; https://github.com/gpuweb/gpuweb/wiki/implementation-status
- ORT on-device training: https://opensource.microsoft.com/blog/2024/02/06/on-device-training-training-a-model-in-browser ; https://onnxruntime.ai/docs/get-started/training-on-device.html ; https://onnxruntime.ai/blogs/ort-1-17-release
- jax-js: https://ekzhang.substack.com/p/jax-js-an-ml-library-for-the-web ; https://cdn.jsdelivr.net/npm/@jax-js/jax@0.1.11/README.md
- Burn: https://docs.rs/crate/burn/0.19.1/source/README.md ; https://github.com/Tracel-AI/burn/issues/1254
- WebNN/LiteRT.js: https://xenospectrum.com/en/google-litert-js-browser-ai-webgpu-wasm-webnn/
- JEPA 浏览器 demo: https://huggingface.co/adimunot/latent-lab ; https://mandarwagh-dvd-jepa.static.hf.space/index.html ; https://huggingface.co/sanju-1007/nano-JEPA
- OpenAI-ES: https://arxiv.org/abs/1703.03864 ; https://openai.com/index/evolution-strategies ; https://github.com/openai/evolution-strategies-starter
- COOP/COEP on GitHub Pages: https://github.com/orgs/community/discussions/13309 ; https://engineered.at/articles/setting-the-coop-and-coep-headers-on-static-hosting-like-github-pages ; https://dev.to/stefnotch/enabling-coop-coep-without-touching-the-server-2d3n ; https://web.dev/cross-origin-isolation-guide/

## 9. 未核实清单(落地前复查)
- TF.js 各 backend 的训练完整度、体积、Worker 支持、2025-2026 维护状态。
- ORT Web training 是否已有 GPU EP。
- jax-js 的 Worker 支持、体积、小 batch 性能、API 稳定性。
- 所有吞吐量数字(JS sim step/s、MLP FLOP/s)——需用本项目 sim 做 micro-benchmark。
- 跨浏览器 `Math.tanh/exp` 差异。
- coi-serviceworker 仓库的当前维护状态与最新用法。
- "JEV" 到底指什么——请用户确认。
