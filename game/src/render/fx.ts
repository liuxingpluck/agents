// 招式特效:刀光、枪芒、拳风、冲击波、法阵、光柱……
// 做法很朴素:每个特效都是一块「贴着发光贴图的小平面」,出现后放大、移动、旋转、淡出。
// 贴图默认用程序现画(下面的 DRAW 表);如果美术交了同名图片 art/fx/<名字>,就改用图片。
import * as THREE from 'three';
import { Fighter, MoveDef, Tier } from '../sim/types';
import { findArt } from './art';

export type FxTex = 'glow' | 'star' | 'crescent' | 'streak' | 'ring' | 'burst' | 'pillar' | 'circle' | 'crack' | 'smoke' | 'lines';

type Ctx = CanvasRenderingContext2D;
const WHITE = (a: number) => `rgba(255,255,255,${a})`;

/** 各种贴图的画法:[宽, 高, 绘制函数]。全部画成白色,用的时候再染色。 */
const DRAW: Record<FxTex, [number, number, (g: Ctx, w: number, h: number) => void]> = {
  // 光团:中心亮、向外淡出
  glow: [64, 64, g => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, WHITE(1)); r.addColorStop(0.3, WHITE(0.5)); r.addColorStop(1, WHITE(0));
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  }],
  // 星芒:光团 + 横竖两道亮条(打击火花)
  star: [64, 64, g => {
    DRAW.glow[2](g, 64, 64);
    for (const horizontal of [true, false]) {
      const ray = horizontal ? g.createLinearGradient(0, 0, 64, 0) : g.createLinearGradient(0, 0, 0, 64);
      ray.addColorStop(0, WHITE(0)); ray.addColorStop(0.5, WHITE(0.95)); ray.addColorStop(1, WHITE(0));
      g.fillStyle = ray;
      if (horizontal) g.fillRect(0, 30, 64, 4); else g.fillRect(30, 0, 4, 64);
    }
  }],
  // 月牙刀光:一个大圆减去一个偏左的圆,剩下右侧一弯月牙;外缘亮、内缘虚
  crescent: [128, 128, g => {
    const fill = g.createRadialGradient(40, 64, 34, 40, 64, 60);
    fill.addColorStop(0, WHITE(0)); fill.addColorStop(0.75, WHITE(0.75)); fill.addColorStop(0.97, WHITE(1)); fill.addColorStop(1, WHITE(0));
    g.fillStyle = fill; g.beginPath(); g.arc(40, 64, 60, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'destination-out';
    const cut = g.createRadialGradient(20, 64, 50, 20, 64, 68);
    cut.addColorStop(0, WHITE(1)); cut.addColorStop(1, WHITE(0));
    g.fillStyle = cut; g.beginPath(); g.arc(20, 64, 68, 0, Math.PI * 2); g.fill();
  }],
  // 枪芒:尾细头粗的一道光,尖端朝右
  streak: [128, 32, g => {
    const lg = g.createLinearGradient(0, 0, 128, 0);
    lg.addColorStop(0, WHITE(0)); lg.addColorStop(0.55, WHITE(0.7)); lg.addColorStop(0.9, WHITE(1)); lg.addColorStop(1, WHITE(0.2));
    g.fillStyle = lg;
    g.beginPath(); g.moveTo(0, 16); g.quadraticCurveTo(96, 0, 128, 16); g.quadraticCurveTo(96, 32, 0, 16); g.fill();
    g.globalCompositeOperation = 'destination-in';
    const soft = g.createLinearGradient(0, 0, 0, 32);
    soft.addColorStop(0.1, WHITE(0)); soft.addColorStop(0.5, WHITE(1)); soft.addColorStop(0.9, WHITE(0));
    g.fillStyle = soft; g.fillRect(0, 0, 128, 32);
  }],
  // 冲击环
  ring: [128, 128, g => {
    g.strokeStyle = WHITE(1); g.lineWidth = 6; g.shadowColor = WHITE(1); g.shadowBlur = 10;
    g.beginPath(); g.arc(64, 64, 50, 0, Math.PI * 2); g.stroke();
  }],
  // 爆裂:一圈长短不一的尖刺 + 中心光团
  burst: [128, 128, g => {
    g.translate(64, 64); g.fillStyle = WHITE(0.9);
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2 + Math.sin(i * 7.3) * 0.2, len = 34 + 28 * Math.abs(Math.sin(i * 3.1)), wd = 0.09;
      g.beginPath(); g.moveTo(Math.cos(a - wd) * 8, Math.sin(a - wd) * 8); g.lineTo(Math.cos(a) * len, Math.sin(a) * len); g.lineTo(Math.cos(a + wd) * 8, Math.sin(a + wd) * 8); g.fill();
    }
    const r = g.createRadialGradient(0, 0, 0, 0, 0, 30);
    r.addColorStop(0, WHITE(1)); r.addColorStop(1, WHITE(0));
    g.fillStyle = r; g.fillRect(-32, -32, 64, 64);
  }],
  // 光柱:中间亮、两边虚、顶端渐隐
  pillar: [64, 128, g => {
    const lg = g.createLinearGradient(0, 0, 64, 0);
    lg.addColorStop(0, WHITE(0)); lg.addColorStop(0.5, WHITE(1)); lg.addColorStop(1, WHITE(0));
    g.fillStyle = lg; g.fillRect(0, 0, 64, 128);
    g.globalCompositeOperation = 'destination-in';
    const v = g.createLinearGradient(0, 0, 0, 128);
    v.addColorStop(0, WHITE(0)); v.addColorStop(0.3, WHITE(1)); v.addColorStop(1, WHITE(1));
    g.fillStyle = v; g.fillRect(0, 0, 64, 128);
  }],
  // 法阵:两圈圆环、一圈刻度、中间一个六芒星
  circle: [256, 256, g => {
    g.translate(128, 128); g.strokeStyle = WHITE(1); g.shadowColor = WHITE(1); g.shadowBlur = 6;
    for (const [r, lw] of [[120, 3], [102, 1.5], [46, 2]]) { g.lineWidth = lw; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); }
    g.lineWidth = 2;
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * 104, Math.sin(a) * 104); g.lineTo(Math.cos(a) * 118, Math.sin(a) * 118); g.stroke(); }
    for (const off of [0, Math.PI]) {
      g.beginPath();
      for (let i = 0; i <= 3; i++) { const a = off + i / 3 * Math.PI * 2 - Math.PI / 2; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 98, Math.sin(a) * 98); }
      g.stroke();
    }
  }],
  // 地裂:从中心向外的几道折线
  crack: [128, 128, g => {
    g.translate(64, 64); g.strokeStyle = WHITE(1); g.shadowColor = WHITE(1); g.shadowBlur = 5; g.lineJoin = 'round';
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2 + Math.sin(i * 5.1) * 0.3;
      g.lineWidth = 3.5; g.beginPath(); g.moveTo(0, 0);
      for (let k = 1; k <= 4; k++) {
        const r = k * (11 + 4 * Math.abs(Math.sin(i * 2.7))), j = a + Math.sin(i * 9 + k * 4) * 0.35;
        g.lineTo(Math.cos(j) * r, Math.sin(j) * r);
      }
      g.stroke();
    }
  }],
  // 烟尘:很软的一团
  smoke: [64, 64, g => {
    const r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    r.addColorStop(0, WHITE(0.7)); r.addColorStop(0.6, WHITE(0.3)); r.addColorStop(1, WHITE(0));
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  }],
  // 速度线:几道长短不一的横线
  lines: [128, 64, g => {
    for (let i = 0; i < 7; i++) {
      const y = 5 + i * 9, x0 = 10 + 50 * Math.abs(Math.sin(i * 4.3)), x1 = 128 - 20 * Math.abs(Math.sin(i * 2.1));
      const lg = g.createLinearGradient(x0, 0, x1, 0);
      lg.addColorStop(0, WHITE(0)); lg.addColorStop(0.7, WHITE(0.9)); lg.addColorStop(1, WHITE(0));
      g.fillStyle = lg; g.fillRect(x0, y, x1 - x0, 1.5 + (i % 3));
    }
  }],
};

const texCache = new Map<FxTex, THREE.Texture>();
/** 取一张特效贴图(只生成一次,之后共用) */
export function fxTexture(name: FxTex): THREE.Texture {
  let t = texCache.get(name);
  if (t) return t;
  const url = findArt(`fx/${name}`);
  if (url) {
    // 美术图是黑底的,配合「叠加发光」的混合方式,黑色部分自然就看不见
    t = new THREE.TextureLoader().load(url);
    t.colorSpace = THREE.SRGBColorSpace;
  } else {
    const [w, h, draw] = DRAW[name];
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d')!, w, h);
    t = new THREE.CanvasTexture(c);
  }
  texCache.set(name, t);
  return t;
}

/** 各主角的特效配色:[亮芯, 外晕]。没列出的角色(敌人)用它外观里的发光色。 */
const TINT: Record<string, [string, string]> = {
  kael: ['#fff0d0', '#ff8a3a'], brynn: ['#eef4ff', '#7fa8ff'], sera: ['#ffd27a', '#ff4a1a'], ilex: ['#e6ffc9', '#6ad86a'],
  rook: ['#fff1c9', '#ff5a2a'], vesper: ['#ecd9ff', '#9a4aff'], morgan: ['#d9ffe9', '#4dffa0'], odran: ['#ffd9c0', '#ff3a1a'],
  li: ['#f0fdff', '#5ad8e8'], nola: ['#fffbe0', '#ffd24a'],
};
const tintOf = (f: Fighter): [string, string] => TINT[f.def.id] ?? ['#ffe9d0', f.def.look.glow ?? f.def.look.accent];

/** 一个特效小平面的参数。位置单位是米;rot / spin 按「角色朝右」来写,朝左时自动镜像。 */
interface PartOpts {
  x: number; y: number; z: number;
  w: number; h: number;
  color: string;
  /** 存活时间(秒) */
  life: number;
  /** 朝向:1 朝右 / -1 朝左(贴图会水平翻转) */
  dir?: number;
  rot?: number;
  /** 每秒转多少弧度 */
  spin?: number;
  /** 结束时放大到几倍(横向 / 纵向可以分开) */
  grow?: number; growX?: number; growY?: number;
  vx?: number; vy?: number;
  /** true = 平铺在地面上(法阵、尘浪、地裂) */
  flat?: boolean;
  /** 延迟多少秒才出现(做「连续几道」的效果) */
  delay?: number;
  /** 最亮时的不透明度 */
  peak?: number;
  /** true = 普通混合(烟尘);默认是叠加发光 */
  solid?: boolean;
}

interface Part {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial;
  life: number; max: number; delay: number;
  w: number; h: number; gx: number; gy: number; dir: number;
  spin: number; vx: number; vy: number; peak: number;
}

const UNIT = new THREE.PlaneGeometry(1, 1); // 所有特效共用一块 1×1 的平面,靠缩放决定大小
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 特效层:负责创建、更新、回收所有特效小平面,并知道「哪种招式该配哪种特效」。 */
export class FxLayer {
  private parts: Part[] = [];
  /** 每个角色已经出过几招(让连续的刀光一正一反、不重样) */
  private counter = new Map<number, number>();

  constructor(private scene: THREE.Scene) {}

  /** 放一个特效小平面 */
  add(tex: FxTex, o: PartOpts) {
    const mat = new THREE.MeshBasicMaterial({
      map: fxTexture(tex), color: o.color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
      blending: o.solid ? THREE.NormalBlending : THREE.AdditiveBlending,
      depthTest: !!o.flat, // 竖着的特效不做遮挡测试,否则伸到地面以下的部分会被地面齐刷刷切掉
    });
    const mesh = new THREE.Mesh(UNIT, mat);
    const dir = o.dir ?? 1;
    mesh.position.set(o.x, o.y, o.z);
    if (o.flat) mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = dir * (o.rot ?? 0);
    mesh.scale.set(dir * o.w, o.h, 1);
    mesh.visible = false;
    this.scene.add(mesh);
    this.parts.push({
      mesh, mat, life: o.life, max: o.life, delay: o.delay ?? 0, w: o.w, h: o.h, dir,
      gx: o.growX ?? o.grow ?? 1.3, gy: o.growY ?? o.grow ?? 1.3,
      spin: o.spin ?? 0, vx: o.vx ?? 0, vy: o.vy ?? 0, peak: o.peak ?? 1,
    });
  }

  /** 每帧调用:推进所有特效,清掉播完的 */
  update(dt: number) {
    for (const p of this.parts) {
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.life -= dt;
      const k = clamp(1 - p.life / p.max, 0, 1), ease = 1 - (1 - k) ** 3; // 先快后慢地放大
      p.mesh.visible = true;
      p.mesh.scale.set(p.dir * p.w * (1 + (p.gx - 1) * ease), p.h * (1 + (p.gy - 1) * ease), 1);
      p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt;
      p.mesh.rotation.z += p.dir * p.spin * dt;
      p.mat.opacity = p.peak * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85); // 迅速亮起,慢慢淡出
    }
    this.parts = this.parts.filter(p => {
      if (p.life > 0) return true;
      this.scene.remove(p.mesh); p.mat.dispose();
      return false;
    });
  }

  /** 清空(换房间时用) */
  clear() {
    for (const p of this.parts) { this.scene.remove(p.mesh); p.mat.dispose(); }
    this.parts = [];
  }

  /** 地面扬尘:几团向外飘散的灰色烟尘 */
  dust(x: number, z: number, n = 4, spread = 0.5) {
    for (let i = 0; i < n; i++) {
      const s = (i / Math.max(1, n - 1) - 0.5) * 2;
      this.add('smoke', { x: x + s * spread, y: 0.18, z: z + 0.2, w: 0.5, h: 0.4, color: '#9a94a0', life: 0.45, grow: 2.2, vx: s * 1.2, vy: 0.5, peak: 0.5, solid: true });
    }
  }

  /** 几颗向上飘的光点(治疗、蓄力、奥义) */
  motes(x: number, y: number, z: number, color: string, n = 6, spread = 0.7) {
    for (let i = 0; i < n; i++) {
      this.add('glow', { x: x + (Math.random() - 0.5) * spread * 2, y: y + Math.random() * 0.6, z: z + 0.2, w: 0.16, h: 0.16, color, life: 0.5 + Math.random() * 0.3, vy: 1.4 + Math.random(), grow: 0.4, delay: Math.random() * 0.15 });
    }
  }

  /**
   * 一招打出去时的特效。按招式的动作类型(横斩、突刺、上挑、砸地、施法……)选不同的画法,
   * 大小跟着判定范围走,颜色跟着角色走;重招 / 技能 / 奥义依次更大更亮。
   * @param again true 表示多段招式的后续几段(画得轻一些)
   */
  moveFx(f: Fighter, m: MoveDef, again = false) {
    const d = f.facing, [core, tint] = tintOf(f);
    const hb = m.hitbox;
    const reach = clamp(hb.x1, 0.7, 3.4);
    const midY = f.y + (hb.y0 + hb.y1) / 2, z = f.z + 0.25;
    const heavy = m.tier >= Tier.HEAVY, big = m.tier >= Tier.SKILL;
    const P = (big ? 1.35 : heavy ? 1.15 : 1) * (again ? 0.85 : 1);
    const T = heavy ? 0.2 : 0.15; // 基础时长
    const n = (this.counter.get(f.id) ?? 0) + 1;
    this.counter.set(f.id, n);
    const tipX = f.x + d * reach;
    /** 一道月牙:亮芯 + 稍大一圈的外晕 */
    const crescent = (x: number, y: number, w: number, h: number, rot: number, spin: number, life = T) => {
      this.add('crescent', { x, y, z, w, h, color: core, life, dir: d, rot, spin, grow: 1.2 });
      this.add('crescent', { x, y, z: z - 0.02, w: w * 1.18, h: h * 1.12, color: tint, life: life + 0.07, dir: d, rot, spin: spin * 0.8, grow: 1.3, peak: 0.7 });
    };
    /** 一道枪芒 */
    const streak = (y: number, len: number, thick: number, rot = 0, delay = 0) => {
      const cx = f.x + d * Math.cos(rot) * len * 0.5, cy = y + Math.sin(rot) * len * 0.5;
      this.add('streak', { x: cx, y: cy, z, w: len, h: thick, color: core, life: T * 0.9, dir: d, rot, growX: 1.25, growY: 0.5, delay });
      this.add('streak', { x: cx, y: cy, z: z - 0.02, w: len * 1.1, h: thick * 2.4, color: tint, life: T * 1.2, dir: d, rot, growX: 1.2, growY: 0.6, peak: 0.55, delay });
    };

    switch (m.anim) {
      case 'slash': {
        // 横斩:一道压扁的月牙,连续几刀一正一反地交叉
        const tilt = [0.35, -0.3, 0.05][n % 3];
        crescent(f.x + d * reach * 0.42, midY, reach * 1.5 * P, reach * 0.85 * P, tilt, tilt > 0 ? -1.5 : 1.5);
        break;
      }
      case 'overhead': {
        // 下劈:竖着的大月牙从上往下抡,落点扬尘
        crescent(f.x + d * reach * 0.35, midY + 0.2, reach * 1.25 * P, reach * 1.7 * P, 0.7, -5);
        if (!again) this.dust(tipX - d * 0.2, f.z, 3, 0.4);
        break;
      }
      case 'upper': {
        // 上挑:月牙从下往上撩,带一股上升气流
        crescent(f.x + d * reach * 0.4, midY, reach * 1.2 * P, reach * 1.6 * P, -0.8, 5.5);
        this.add('pillar', { x: f.x + d * reach * 0.55, y: f.y + 1.3, z, w: 0.7 * P, h: 2.6 * P, color: tint, life: 0.3, growX: 0.5, growY: 1.3, vy: 2, peak: 0.6 });
        if (f.y <= 0) this.dust(f.x + d * 0.5, f.z, 3, 0.35);
        break;
      }
      case 'thrust': {
        // 突刺:一道长枪芒直贯出去,枪尖炸一朵星芒;重招再补两道残影
        streak(midY, reach * 1.3 * P, 0.36 * P);
        this.add('star', { x: tipX, y: midY, z, w: 0.7 * P, h: 0.7 * P, color: core, life: T, rot: n, grow: 1.6 });
        if (heavy) { streak(midY + 0.22, reach * 1.1, 0.2, 0.06, 0.04); streak(midY - 0.2, reach * 1.15, 0.2, -0.05, 0.08); }
        break;
      }
      case 'punchL': case 'punchR': {
        // 拳:短促的拳风 + 拳头前方一圈压扁的气浪
        streak(midY, reach * 1.05 * P, 0.5 * P);
        this.add('ring', { x: tipX - d * 0.1, y: midY, z, w: 0.22 * P, h: 0.7 * P, color: core, life: T, growX: 1.6, growY: 2.2, peak: 0.9 });
        if (heavy) this.add('burst', { x: tipX, y: midY, z, w: 0.9 * P, h: 0.9 * P, color: tint, life: T, rot: n, grow: 1.5, peak: 0.8 });
        break;
      }
      case 'kick': crescent(f.x + d * reach * 0.45, midY, reach * 1.2 * P, reach * 0.9 * P, -0.25, 2); break;
      case 'highKick': crescent(f.x + d * reach * 0.4, midY + 0.1, reach * 1.2 * P, reach * 1.5 * P, -0.6, 5); break;
      case 'sweep': {
        // 扫腿:贴地的一道扁弧 + 尘土
        crescent(f.x + d * reach * 0.45, f.y + 0.3, reach * 1.5 * P, reach * 0.4 * P, 0.05, 0);
        this.dust(f.x + d * reach * 0.6, f.z, 3, 0.5);
        break;
      }
      case 'spin': {
        // 旋风:身体周围两道飞转的平弧,加一圈贴地的气浪
        const r = Math.max(reach, -hb.x0) * 1.15 * P;
        for (const [k, dly] of [[1, 0], [-1, 0.05]] as const) {
          this.add('crescent', { x: f.x, y: midY, z, w: r * 2 * k, h: r * 0.55, color: core, life: T + 0.08, spin: 0, growX: 1.15, growY: 1.1, delay: dly });
          this.add('crescent', { x: f.x, y: midY + 0.15 * k, z: z - 0.02, w: r * 2.2 * k, h: r * 0.75, color: tint, life: T + 0.14, growX: 1.2, growY: 1.2, peak: 0.6, delay: dly });
        }
        this.add('ring', { x: f.x, y: 0.06, z: f.z, w: r * 1.6, h: r * 1.6, color: tint, life: 0.3, flat: true, grow: 1.7, peak: 0.6, spin: 6 });
        break;
      }
      case 'slam': {
        // 砸地:落点地裂 + 贴地冲击环 + 向上炸开的光 + 碎尘;范围向两侧展开的招式落点在脚下
        const ix = hb.x0 < -0.5 ? f.x : f.x + d * reach * 0.6, size = (hb.x0 < -0.5 ? reach * 2 : reach * 1.5) * P;
        this.add('crack', { x: ix, y: 0.05, z: f.z, w: size, h: size, color: tint, life: 0.7, flat: true, grow: 1.05, rot: n });
        this.add('ring', { x: ix, y: 0.07, z: f.z, w: size * 0.5, h: size * 0.5, color: core, life: 0.35, flat: true, grow: 2.6 });
        this.add('burst', { x: ix, y: size * 0.36, z, w: size * 0.9, h: size * 0.9, color: core, life: 0.22, rot: n, grow: 1.5 });
        this.add('pillar', { x: ix, y: 1.1 * P, z: z - 0.02, w: size * 0.5, h: 2.2 * P, color: tint, life: 0.32, growX: 1.5, growY: 1.2, peak: 0.7 });
        this.dust(ix, f.z, 5, size * 0.35);
        break;
      }
      case 'cast': {
        // 施法:脚下转动的法阵 + 手边的光团 + 上飘的光点
        if (!again) this.add('circle', { x: f.x, y: 0.05, z: f.z, w: 2.3 * P, h: 2.3 * P, color: tint, life: 0.6, flat: true, spin: 2.5, grow: 1.12, peak: 0.9 });
        this.add('glow', { x: f.x + d * 0.55, y: f.y + 1.25, z, w: 0.9 * P, h: 0.9 * P, color: core, life: 0.25, grow: 1.8 });
        this.motes(f.x, f.y + 0.3, f.z, tint, again ? 2 : 5);
        break;
      }
      case 'shoot': {
        // 射击:弓口一朵星芒 + 一道细长的箭芒
        this.add('star', { x: f.x + d * 0.7, y: midY, z, w: 0.6 * P, h: 0.6 * P, color: core, life: T, rot: n, grow: 1.5 });
        streak(midY, 1.4 * P, 0.16);
        break;
      }
      case 'airKick': streak(midY + 0.3, reach * 1.3 * P, 0.4 * P, -0.75); break;
      case 'airSlash': crescent(f.x + d * reach * 0.35, midY, reach * 1.25 * P, reach * 1.5 * P, 0.5, -5); break;
    }

    // ---- 不分动作类型的附加效果 ----
    // 带突进的招式:身后拉出速度线
    if ((m.moveX ?? 0) >= 0.1 && !again) this.add('lines', { x: f.x - d * 0.9, y: f.y + 1, z, w: 2.2, h: 1.3, color: tint, life: 0.22, dir: d, growX: 1.4, growY: 1, vx: -d * 2, peak: 0.7 });
    // 砸地技(空中重击):一道斜向下的长光
    if (m.spike) streak(midY + 0.4, reach * 1.6, 0.5, -0.9);
    // 技能 / 奥义出手:身后炸开一圈光,奥义再加光柱和光点
    if (big && !again) {
      this.add('burst', { x: f.x, y: f.y + 1, z: f.z - 0.1, w: 2.4 * P, h: 2.4 * P, color: tint, life: 0.3, rot: n, grow: 1.5, peak: 0.45 });
      if (m.tier >= Tier.SUPER) {
        this.add('pillar', { x: f.x, y: 2.2, z: f.z - 0.1, w: 1.6, h: 4.4, color: tint, life: 0.55, growX: 1.8, growY: 1.1, peak: 0.6 });
        this.add('circle', { x: f.x, y: 0.05, z: f.z, w: 3.2, h: 3.2, color: core, life: 0.8, flat: true, spin: -3, grow: 1.2 });
        this.motes(f.x, f.y + 0.2, f.z, core, 10, 1);
      }
    }
    if (m.heal && !again) this.motes(f.x, f.y + 0.2, f.z, '#a8ffb0', 8, 0.8);
  }

  /** 命中瞬间:受击点炸一朵尖刺光;重击再划一道贯穿的斩痕 */
  hitFx(x: number, y: number, z: number, heavy: boolean, tint: string, dir: number) {
    this.add('burst', { x, y, z: z + 0.3, w: heavy ? 1.15 : 0.7, h: heavy ? 1.15 : 0.7, color: heavy ? '#ffd9a0' : '#fff1c9', life: heavy ? 0.18 : 0.13, rot: Math.random() * 6, grow: 1.6 });
    if (heavy) {
      this.add('streak', { x, y, z: z + 0.32, w: 2.6, h: 0.16, color: '#ffffff', life: 0.13, dir, rot: (Math.random() - 0.5) * 0.9, growX: 1.5, growY: 0.4 });
      this.add('glow', { x, y, z: z + 0.28, w: 1.4, h: 1.4, color: tint, life: 0.2, grow: 1.6, peak: 0.6 });
    }
  }
}
