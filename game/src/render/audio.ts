// 程序化音效:全部用 WebAudio 实时合成,不需要任何音频文件。
// 打击感的一半来自声音——轻击是短促的「啪」,重击多一层低频「咚」,击杀再加一段下滑音。
import { SimEvent } from '../sim/types';

/** 音效播放器:把战斗事件(命中、挥空、击杀…)变成合成声音。 */
export class Sfx {
  // ctx = 浏览器音频引擎;master = 总音量开关;noise = 共用的噪声素材
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  /** 总音量 0..1 */
  volume = 0.5;

  /**
   * 浏览器要求用户有过交互才能出声,所以在第一次按键时调用。
   * 重复调用是安全的。
   */
  unlock() {
    if (this.ctx) { void this.ctx.resume(); return; }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      // 预生成 1 秒白噪声,所有带噪声的音效共用
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, len);
      const d = this.noise.getChannelData(0);
      let s = 12345;
      for (let i = 0; i < len; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; }
    } catch { this.ctx = null; }
  }

  /**
   * 一段带滤波的噪声爆破。
   * @param dur 时长(秒) @param freq 滤波中心频率 @param gain 音量 @param type 滤波类型
   */
  private burst(dur: number, freq: number, gain: number, type: BiquadFilterType = 'bandpass', q = 1) {
    const c = this.ctx; if (!c || !this.master || !this.noise) return;
    const src = c.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(c.currentTime, Math.random() * 0.5, dur);
  }

  /**
   * 一个频率下滑的振荡音(用来做低频冲击、击杀音)。
   * @param f0 起始频率 @param f1 结束频率 @param dur 时长(秒)
   */
  private tone(f0: number, f1: number, dur: number, gain: number, wave: OscillatorType = 'sine') {
    const c = this.ctx; if (!c || !this.master) return;
    const o = c.createOscillator(); o.type = wave;
    o.frequency.setValueAtTime(f0, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), c.currentTime + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g).connect(this.master);
    o.start(); o.stop(c.currentTime + dur);
  }

  /** 音频环境(背景音乐模块共用它;解锁前为 null) */
  get context(): AudioContext | null { return this.ctx; }

  /** 调整总音量(0..1) */
  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** 把模拟层这一帧的事件翻译成声音 */
  handle(events: SimEvent[]) {
    if (!this.ctx) return;
    for (const e of events) {
      switch (e.type) {
        case 'hit':
          if (e.heavy) { this.burst(0.14, 900, 0.9, 'bandpass', 0.7); this.tone(150, 45, 0.18, 0.9); }
          else { this.burst(0.07, 1800, 0.7, 'bandpass', 0.8); this.tone(220, 110, 0.06, 0.35); }
          break;
        case 'whiff': if (e.again) break; this.burst(e.heavy ? 0.16 : 0.09, e.heavy ? 500 : 1100, 0.16, 'bandpass', 2.5); break;
        case 'ko': this.tone(320, 40, 0.5, 0.8, 'sawtooth'); this.burst(0.35, 400, 0.6, 'lowpass'); break;
        case 'comboBreak': this.tone(90, 400, 0.25, 0.6, 'square'); this.burst(0.3, 2500, 0.4, 'highpass'); break;
        case 'land': this.burst(0.08, 180, 0.35, 'lowpass'); break;
        case 'cast': this.tone(500, 1200, 0.2, 0.2, 'triangle'); break;
        case 'break': this.burst(0.2, 700, 0.7, 'bandpass', 0.6); this.burst(0.12, 2600, 0.3, 'highpass'); break;
        case 'bossPhase': this.tone(60, 220, 0.6, 0.8, 'sawtooth'); this.burst(0.5, 500, 0.6, 'lowpass'); break;
        case 'hazard': this.burst(0.5, 600, 0.5, 'lowpass'); this.tone(90, 40, 0.4, 0.4, 'sawtooth'); break;
        case 'block': this.burst(0.06, 2600, 0.5, 'bandpass', 3); this.tone(700, 500, 0.05, 0.2, 'square'); break;
        case 'parry': this.tone(1400, 2200, 0.18, 0.5, 'triangle'); this.burst(0.1, 4000, 0.5, 'highpass'); this.tone(200, 80, 0.2, 0.5); break;
        case 'guardBreak': this.burst(0.3, 1200, 0.9, 'bandpass', 0.5); this.tone(500, 60, 0.4, 0.7, 'sawtooth'); break;
        case 'chargeRelease': this.tone(180, 60, 0.25, 0.5 + e.level * 0.4); this.burst(0.2, 700, 0.5 + e.level * 0.4, 'lowpass'); break;
        case 'groundBounce': this.burst(0.22, 220, 0.9, 'lowpass'); this.tone(110, 40, 0.25, 0.8); break;
        case 'super': this.tone(200, 900, 0.5, 0.5, 'sawtooth'); this.tone(400, 1800, 0.5, 0.3, 'triangle'); this.burst(0.5, 3000, 0.3, 'highpass'); break;
        case 'wallBounce': this.burst(0.18, 300, 0.8, 'lowpass'); this.tone(120, 50, 0.2, 0.7); break;
        case 'pickup': this.tone(660, 990, 0.12, 0.3, 'triangle'); this.tone(990, 1320, 0.14, 0.2, 'triangle'); break;
        case 'recover': this.burst(0.1, 1500, 0.2, 'bandpass', 2); break;
      }
    }
  }
}
