// 背景音乐:和音效一样用 WebAudio 实时合成,不需要音频文件。
// 做法是一个很小的「音序器」:把一小节切成 16 格,每格决定要不要敲鼓、弹哪个音,循环播放。
// 三种氛围:calm 菜单与过场(低沉长音 + 稀疏钟声)/ battle 战斗(鼓点 + 低音)/ boss 首领战(更快更重)。

export type Mood = 'off' | 'calm' | 'battle' | 'boss';

/** 一种氛围的配置 */
interface Track {
  /** 速度:每分钟多少拍 */
  bpm: number;
  /** 以下每个数组长 16,对应一小节的 16 格。数字是音量(0 表示这一格不响) */
  kick: number[];
  hat: number[];
  /** 低音与钟声:每格一个音高(半音数,相对根音 D;null 表示不弹) */
  bass: Array<number | null>;
  bell: Array<number | null>;
}

const _ = null;
const TRACKS: Record<Exclude<Mood, 'off'>, Track> = {
  calm: {
    bpm: 66,
    kick: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    hat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    bass: [0, _, _, _, _, _, _, _, -2, _, _, _, _, _, _, _],
    bell: [_, _, _, _, 12, _, _, _, _, _, 15, _, _, _, 10, _],
  },
  battle: {
    bpm: 112,
    kick: [1, 0, 0, 0, 0, 0, 0.7, 0, 1, 0, 0, 0, 0, 0, 0, 0.5],
    hat: [0, 0, 0.5, 0, 0.8, 0, 0.5, 0, 0, 0, 0.5, 0, 0.8, 0, 0.5, 0.3],
    bass: [0, _, 0, _, _, 0, _, 3, 0, _, 0, _, _, 5, _, 3],
    bell: [_, _, _, _, _, _, _, _, 12, _, _, 10, _, _, _, _],
  },
  boss: {
    bpm: 132,
    kick: [1, 0, 0.6, 0, 1, 0, 0, 0.6, 1, 0, 0.6, 0, 1, 0, 0.8, 0.8],
    hat: [0.4, 0, 0.6, 0.3, 0.9, 0, 0.6, 0.3, 0.4, 0, 0.6, 0.3, 0.9, 0, 0.6, 0.6],
    bass: [0, 0, _, 0, 3, _, 0, _, 0, 0, _, 0, 6, _, 5, 3],
    bell: [12, _, _, _, _, _, 15, _, _, _, 13, _, _, _, 12, _],
  },
};

/** 根音 D1 的频率;其他音按半音往上推 */
const ROOT = 36.71;
const freq = (semi: number) => ROOT * Math.pow(2, semi / 12);

export class Music {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private mood: Mood = 'off';
  /** 下一格该在什么时刻响(音频时钟),以及现在排到第几格 */
  private nextTime = 0;
  private stepIndex = 0;
  private timer = 0;
  /** 持续的低沉长音(两个略微错开音高的振荡器,听起来有厚度) */
  private drone: OscillatorNode[] = [];
  private droneGain: GainNode | null = null;
  volume = 0.35;
  /** 已排出的音符数量(测试用) */
  notes = 0;

  /**
   * 接到音效模块建好的音频环境上。浏览器要求用户有过操作才允许出声,所以在第一次按键后调用。
   */
  attach(ctx: AudioContext) {
    if (this.ctx) return;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.volume;
    this.out.connect(ctx.destination);
    const len = ctx.sampleRate / 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let s = 777;
    for (let i = 0; i < len; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; }
    // 长音:一直响着,靠音量渐变来开关
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    this.droneGain.connect(lp).connect(this.out);
    for (const detune of [-7, 7]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq(12); o.detune.value = detune;
      o.connect(this.droneGain); o.start();
      this.drone.push(o);
    }
    this.timer = window.setInterval(() => this.schedule(), 50);
    if (this.mood !== 'off') this.apply();
  }

  setVolume(v: number) { this.volume = v; if (this.out) this.out.gain.value = v; }

  /** 切换氛围(相同则不动) */
  setMood(m: Mood) {
    if (m === this.mood) return;
    this.mood = m;
    this.apply();
  }

  /** 让长音的音量跟上当前氛围,并从小节开头重新排音符 */
  private apply() {
    if (!this.ctx || !this.droneGain) return;
    const t = this.ctx.currentTime;
    const level = this.mood === 'off' ? 0 : this.mood === 'calm' ? 0.5 : 0.28;
    this.droneGain.gain.cancelScheduledValues(t);
    this.droneGain.gain.linearRampToValueAtTime(level, t + 1.2);
    this.nextTime = t + 0.1;
    this.stepIndex = 0;
  }

  /** 每 50 毫秒检查一次:把未来 0.2 秒内该响的音符提前排好(这样节奏不受画面卡顿影响) */
  private schedule() {
    const c = this.ctx;
    if (!c || this.mood === 'off' || c.state !== 'running') return;
    const tr = TRACKS[this.mood];
    const stepDur = 60 / tr.bpm / 4;
    if (this.nextTime < c.currentTime) this.nextTime = c.currentTime + 0.05; // 标签页切走再回来时追上时钟
    while (this.nextTime < c.currentTime + 0.2) {
      const i = this.stepIndex % 16, t = this.nextTime;
      if (tr.kick[i]) this.kick(t, tr.kick[i]);
      if (tr.hat[i]) this.hat(t, tr.hat[i]);
      const b = tr.bass[i];
      if (b !== null) this.tone(t, freq(b + 12), stepDur * 1.8, 0.5, 'sawtooth', 300);
      const bell = tr.bell[i];
      // 钟声每两小节才出现一次,免得太满
      if (bell !== null && (this.mood !== 'calm' || Math.floor(this.stepIndex / 16) % 2 === 0)) this.tone(t, freq(bell + 36), 1.6, 0.12, 'sine', 4000);
      this.nextTime += stepDur;
      this.stepIndex++;
    }
  }

  /** 底鼓:一个从 120Hz 快速滑到 40Hz 的正弦波 */
  private kick(t: number, vol: number) {
    const c = this.ctx!, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.9 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(this.out!); o.start(t); o.stop(t + 0.22);
    this.notes++;
  }

  /** 踩镲:一小段高频噪声 */
  private hat(t: number, vol: number) {
    const c = this.ctx!, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noise; f.type = 'highpass'; f.frequency.value = 7000;
    g.gain.setValueAtTime(0.18 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(f).connect(g).connect(this.out!); src.start(t, 0, 0.06);
    this.notes++;
  }

  /** 一个带低通滤波、逐渐衰减的音(低音与钟声共用) */
  private tone(t: number, hz: number, dur: number, vol: number, wave: OscillatorType, cutoff: number) {
    const c = this.ctx!, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = wave; o.frequency.value = hz;
    f.type = 'lowpass'; f.frequency.value = cutoff;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f).connect(g).connect(this.out!); o.start(t); o.stop(t + dur + 0.02);
    this.notes++;
  }

  dispose() { clearInterval(this.timer); for (const o of this.drone) o.stop(); }
}
