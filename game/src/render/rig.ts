// 角色外观:用方块拼出的低模小人(Rig)和贴图小人(SpriteRig)。
// 它们只负责「画」:根据模拟层给出的角色状态(站、走、攻击、倒地等)摆姿势,
// 不参与任何战斗判定。模型朝 +x 方向搭建。
import * as THREE from 'three';
import { Fighter, Look, SIM, Tier } from '../sim/types';
import { findArt } from './art';

/** 一个姿势 = 一组关节角度。每帧算出「目标姿势」,再平滑过渡过去,动作才不会生硬。 */
export interface Pose {
  armL: number; armR: number; // 肩部前后摆(绕 z,正值向前)
  foreL: number; foreR: number; // 肘部弯曲
  legL: number; legR: number; // 髋部前后摆
  kneeL: number; kneeR: number;
  lean: number; // 躯干前倾(负值后仰)
  twist: number; // 躯干绕 y 扭转
  tilt: number; // 整体绕 z 旋转(倒地)
  spin: number; // 整体绕 y 额外旋转
  lift: number; // 整体抬升
  crouch: number; // 下蹲量
}

/** 默认站姿(各关节的基准值,其他姿势在它上面改)。 */
export const REST: Pose = {
  armL: 0.1, armR: 0.25, foreL: 0.3, foreR: 0.5, legL: 0.05, legR: -0.05, kneeL: 0, kneeR: 0,
  lean: 0.05, twist: 0, tilt: 0, spin: 0, lift: 0, crouch: 0,
};

/** 造一块材质(颜色);传入 emissive 时会自发光,用于眼睛、法杖宝石等。 */
const mat = (c: string, emissive?: string) =>
  new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0.15, emissive: emissive ?? '#000000', emissiveIntensity: emissive ? 1.6 : 0, flatShading: true });

/** 造一条四肢:上段 + 下段(肘/膝弯曲处),返回 pivot=肩/髋的转轴,lower=下半段的转轴。 */
function limb(len: number, w: number, m: THREE.Material): { pivot: THREE.Group; lower: THREE.Group } {
  const pivot = new THREE.Group();
  const up = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), m);
  up.position.y = -len / 2;
  pivot.add(up);
  const lower = new THREE.Group();
  lower.position.y = -len;
  const lo = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, len, w * 0.85), m);
  lo.position.y = -len / 2;
  lower.add(lo);
  pivot.add(lower);
  return { pivot, lower };
}

/** 按武器类型拼一把简易武器模型(都是方块拼的);没有武器或类型未知返回 null。 */
function buildWeapon(look: Look): THREE.Object3D | null {
  const g = new THREE.Group();
  const steel = mat(look.accent), wood = mat('#3a2a1e');
  const glow = look.glow ? mat(look.glow, look.glow) : steel;
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z = 0) => {
    const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); g.add(me); return me;
  };
  switch (look.weapon) {
    case 'sword': add(new THREE.BoxGeometry(1.0, 0.09, 0.03), steel, 0.6, 0); add(new THREE.BoxGeometry(0.06, 0.3, 0.06), wood, 0.08, 0); break;
    case 'daggers': add(new THREE.BoxGeometry(0.45, 0.07, 0.03), steel, 0.3, 0); break;
    case 'axe': add(new THREE.BoxGeometry(1.3, 0.07, 0.07), wood, 0.5, 0); add(new THREE.BoxGeometry(0.4, 0.55, 0.05), steel, 1.05, 0.1); break;
    case 'hammer': case 'mace': add(new THREE.BoxGeometry(1.1, 0.08, 0.08), wood, 0.45, 0); add(new THREE.BoxGeometry(0.36, 0.36, 0.36), steel, 1.0, 0); break;
    case 'spear': add(new THREE.BoxGeometry(2.2, 0.06, 0.06), wood, 0.5, 0); add(new THREE.BoxGeometry(0.4, 0.1, 0.04), steel, 1.75, 0); break;
    case 'staff': add(new THREE.BoxGeometry(1.7, 0.06, 0.06), wood, 0.3, 0); add(new THREE.OctahedronGeometry(0.16), glow, 1.2, 0); break;
    case 'bow': { const b = add(new THREE.TorusGeometry(0.55, 0.03, 4, 10, Math.PI), wood, 0.1, 0); b.rotation.z = -Math.PI / 2; break; }
    case 'claws': for (let i = -1; i <= 1; i++) add(new THREE.BoxGeometry(0.28, 0.03, 0.03), glow, 0.16, 0, i * 0.05); break;
    default: return null;
  }
  return g;
}

/** 方块小人:身体、四肢、武器全部由程序生成,不需要任何美术图片。 */
export class Rig implements ActorView {
  root = new THREE.Group();
  private body = new THREE.Group();
  private torso = new THREE.Group();
  // 左臂、右臂、左腿、右腿
  private aL; private aR; private lL; private lR;
  private pose: Pose = { ...REST };
  // 受击闪白的强度,1 表示刚被打中,随时间衰减到 0
  private flash = 0;
  private mats: THREE.MeshStandardMaterial[] = [];
  shadow: THREE.Mesh;
  // 髋部离地高度,身体整体高度的基准
  private hipY: number;

  constructor(public look: Look) {
    const s = look.scale, bk = look.bulk;
    const legLen = 0.42 * s, armLen = 0.36 * s;
    this.hipY = legLen * 2;
    const mPrim = mat(look.primary), mSec = mat(look.secondary), mSkin = mat(look.skin);
    this.mats.push(mPrim, mSec, mSkin);

    this.root.add(this.body);
    this.body.position.y = this.hipY;
    this.body.add(this.torso);

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.3 * bk, 0.62 * s, 0.5 * bk), mPrim);
    chest.position.y = 0.33 * s;
    this.torso.add(chest);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.32 * bk, 0.12 * s, 0.52 * bk), mSec);
    belt.position.y = 0.04 * s;
    this.torso.add(belt);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26 * s, 0.28 * s, 0.26 * s), look.hood ? mSec : mSkin);
    head.position.y = 0.8 * s;
    this.torso.add(head);
    if (look.glow) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04 * s, 0.16 * s), mat(look.glow, look.glow));
      eye.position.set(0.135 * s, 0.82 * s, 0);
      this.torso.add(eye);
    }
    if (look.horns) for (const z of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.05 * s, 0.25 * s, 4), mat(look.accent));
      h.position.set(0, 1.02 * s, z * 0.12 * s); h.rotation.x = z * 0.4;
      this.torso.add(h);
    }
    if (look.cape) {
      const cape = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.9 * s, 0.46 * bk), mSec);
      cape.position.set(-0.19 * bk, 0.18 * s, 0); cape.rotation.z = -0.12;
      this.torso.add(cape);
    }

    this.aL = limb(armLen, 0.13 * bk, mPrim);
    this.aR = limb(armLen, 0.13 * bk, mPrim);
    this.aL.pivot.position.set(0, 0.58 * s, -0.32 * bk);
    this.aR.pivot.position.set(0, 0.58 * s, 0.32 * bk);
    this.torso.add(this.aL.pivot, this.aR.pivot);
    const wpn = buildWeapon(look);
    if (wpn) { wpn.position.y = -armLen; this.aR.lower.add(wpn); }
    if (look.weapon === 'daggers' || look.weapon === 'claws') {
      const w2 = buildWeapon(look)!; w2.position.y = -armLen; this.aL.lower.add(w2);
    }
    if (look.shield) {
      const sh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5 * s, 0.4 * s), mat(look.accent));
      sh.position.set(0.1, -armLen * 0.6, -0.08);
      this.aL.lower.add(sh);
    }
    this.lL = limb(legLen, 0.16 * bk, mSec);
    this.lR = limb(legLen, 0.16 * bk, mSec);
    this.lL.pivot.position.set(0, 0, -0.14 * bk);
    this.lR.pivot.position.set(0, 0, 0.14 * bk);
    this.body.add(this.lL.pivot, this.lR.pivot);

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.5 * bk, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
  }

  /** 被打中时调用:触发一次闪白。 */
  hitFlash() { this.flash = 1; }

  /** 根据模拟状态计算目标姿势并平滑过渡 */
  update(f: Fighter, time: number, dt: number) {
    const tgt = targetPose(f, time);
    const k = Math.min(1, dt * (f.state === 'attack' ? 30 : 16));
    const p = this.pose;
    for (const key of Object.keys(p) as (keyof Pose)[]) p[key] += (tgt[key] - p[key]) * k;

    // 顿帧期间受击者左右抖动,强化「打中了」的感觉
    // 受击三态:被打硬直 / 被打飞 / 被抓住
    const hurt = f.state === 'hitstun' || f.state === 'launched' || f.state === 'grabbed';
    const jitter = f.hitstop > 0 && hurt ? Math.sin(time * 90) * 0.06 : 0;
    this.root.position.set(f.x + jitter, f.y + p.lift, f.z);
    this.root.rotation.y = (f.facing === 1 ? 0 : Math.PI) + p.spin;
    this.body.rotation.z = p.tilt;
    this.body.position.y = this.hipY - p.crouch + (p.tilt !== 0 ? Math.abs(Math.sin(p.tilt)) * -this.hipY * 0.75 : 0);
    this.torso.rotation.z = -p.lean;
    this.torso.rotation.y = p.twist;
    this.aL.pivot.rotation.z = p.armL; this.aR.pivot.rotation.z = p.armR;
    this.aL.lower.rotation.z = p.foreL; this.aR.lower.rotation.z = p.foreR;
    this.lL.pivot.rotation.z = p.legL; this.lR.pivot.rotation.z = p.legR;
    this.lL.lower.rotation.z = -p.kneeL; this.lR.lower.rotation.z = -p.kneeR;

    this.shadow.position.set(f.x, 0.02, f.z);
    const sc = Math.max(0.4, 1 - f.y * 0.25);
    this.shadow.scale.setScalar(sc);

    // 受击闪白 / 无敌闪烁 / 死亡淡出
    this.flash = Math.max(0, this.flash - dt * 7);
    const blink = f.invuln > 0 && f.state !== 'dodge' && f.hp > 0 && Math.floor(time * 20) % 2 === 0;
    this.root.visible = !(f.state === 'dead' && Math.floor(time * 12) % 2 === 0) && !blink;
    // 霸体大招预警:前摇期间全身泛橙光并闪烁,提示玩家「这招打不断,该躲了」
    const warn = armorWarning(f, time);
    for (const m of this.mats) { m.emissive.setRGB(this.flash * 0.9 + warn, this.flash * 0.9 + warn * 0.35, this.flash * 0.9); m.emissiveIntensity = 1; }
  }
}

/** 根据角色当前状态(站/走/跳/受击/倒地…)给出这一刻「想摆成的」姿势。 */
function targetPose(f: Fighter, t: number): Pose {
  const p: Pose = { ...REST };
  switch (f.state) {
    case 'idle': {
      const b = Math.sin(t * 3 + f.id) * 0.03;
      p.crouch = 0.02 + b; p.armL += b; p.armR -= b; p.lean = 0.08;
      p.armL = 0.5; p.foreL = 0.9; // 架势
      break;
    }
    case 'walk': case 'run': {
      const sp = f.state === 'run' ? 16 : 10, amp = f.state === 'run' ? 0.9 : 0.55;
      const s = Math.sin(t * sp + f.id);
      p.legL = s * amp; p.legR = -s * amp;
      p.kneeL = Math.max(0, -s) * amp; p.kneeR = Math.max(0, s) * amp;
      p.armL = -s * amp * 0.7; p.armR = s * amp * 0.7;
      p.lean = f.state === 'run' ? 0.35 : 0.12;
      break;
    }
    case 'jump': {
      const up = f.vy > 0;
      p.legL = up ? 0.6 : 0.2; p.kneeL = up ? 1.0 : 0.3; p.legR = up ? -0.2 : -0.1; p.kneeR = up ? 0.5 : 0.2;
      p.armL = up ? 1.2 : 2.2; p.armR = up ? 1.0 : 2.0; p.lean = up ? 0.1 : -0.05;
      break;
    }
    case 'dodge': {
      p.crouch = 0.35; p.lean = 0.9; p.legL = 0.9; p.kneeL = 1.2; p.legR = -0.4; p.kneeR = 0.6; p.armL = -0.6; p.armR = -0.6;
      break;
    }
    case 'hitstun': {
      p.lean = -0.4; p.armL = -0.5; p.armR = -0.7; p.legL = -0.15; p.legR = 0.2; p.twist = 0.3;
      break;
    }
    case 'launched': {
      p.tilt = f.vy > 0 ? 1.0 : 1.45; p.armL = -1.8; p.armR = -2.0; p.legL = 0.5; p.legR = 0.2; p.kneeL = 0.5;
      p.spin = 0;
      break;
    }
    case 'knockdown': case 'dead': {
      p.tilt = Math.PI / 2; p.armL = -1.4; p.armR = -1.2; p.legL = 0.1; p.legR = -0.1;
      break;
    }
    case 'grabbed': {
      // 被揪住:身体后仰、双脚离地挣扎
      p.lean = -0.5; p.lift = 0.18; p.armL = -1.2; p.armR = -1.4; p.legL = 0.4; p.legR = -0.2; p.kneeL = 0.6; p.kneeR = 0.4;
      break;
    }
    case 'getup': {
      const k = Math.min(1, f.stateFrame / SIM.GETUP_FRAMES);
      p.tilt = (1 - k) * 1.2; p.crouch = 0.3 * (1 - k); p.lean = 0.5 * (1 - k); p.kneeL = 0.8 * (1 - k); p.kneeR = 0.8 * (1 - k);
      break;
    }
    case 'attack': attackPose(f, p); break;
  }
  return p;
}

/** 攻击时的姿势:先「蓄力」(前摇)再「击出」,不同招式 anim 对应不同动作。 */
function attackPose(f: Fighter, p: Pose) {
  const m = f.move!;
  // 抓住对手时:单手前伸揪住
  if (f.grabTarget) { p.armL = 1.5; p.foreL = 0.1; p.armR = -0.6; p.foreR = 1.6; p.lean = 0.15; p.legL = 0.35; p.legR = -0.3; return; }
  // wind = 前摇(蓄势中);strike = 出招判定期及收招前几帧
  const wind = f.moveFrame < m.startup;
  const strike = !wind && f.moveFrame < m.startup + m.active + 3;
  const a = wind ? 0 : strike ? 1 : 0.4; // 0 蓄势 1 击出
  p.armL = 0.5; p.foreL = 1.0;
  switch (m.anim) {
    case 'punchL': p.armL = wind ? -0.6 : 1.55 * a; p.foreL = wind ? 1.8 : 0.05; p.twist = wind ? 0.3 : -0.45 * a; p.lean = 0.2; p.legL = 0.3; p.legR = -0.3; break;
    case 'punchR': p.armR = wind ? -0.7 : 1.6 * a; p.foreR = wind ? 1.8 : 0.05; p.twist = wind ? -0.35 : 0.5 * a; p.lean = 0.25; p.legL = -0.3; p.legR = 0.35; break;
    case 'slash': p.armR = wind ? 2.6 : 0.5; p.foreR = wind ? 0.9 : 0.1; p.twist = wind ? -0.9 : 0.9 * a; p.lean = 0.3; p.legL = 0.4; p.legR = -0.35; break;
    case 'overhead': p.armR = wind ? 3.3 : 0.9 * a; p.foreR = wind ? 0.6 : 0; p.lean = wind ? -0.25 : 0.55; p.legL = 0.45; p.legR = -0.3; p.crouch = wind ? 0 : 0.12; break;
    case 'slam': p.armR = wind ? 3.4 : 0.6; p.armL = wind ? 3.2 : 0.6; p.foreR = 0; p.foreL = 0.1; p.lean = wind ? -0.3 : 0.85; p.crouch = wind ? 0 : 0.25; p.kneeL = 0.5; p.kneeR = 0.5; break;
    case 'thrust': p.armR = wind ? -0.4 : 1.57; p.foreR = wind ? 1.6 : 0; p.lean = 0.5; p.legL = 0.7; p.legR = -0.6; p.kneeL = 0.5; break;
    case 'kick': p.legR = wind ? -0.3 : 1.3 * a; p.kneeR = wind ? 1.3 : 0; p.lean = -0.15; p.armL = 0.8; p.armR = -0.5; break;
    case 'highKick': p.legR = wind ? 0.3 : 2.0 * a; p.kneeR = wind ? 1.5 : 0; p.lean = -0.35; p.twist = wind ? -0.6 : 0.4; p.armR = -0.8; break;
    case 'sweep': p.legR = wind ? -0.2 : 1.2 * a; p.crouch = 0.4; p.kneeL = 1.2; p.lean = 0.2; break;
    case 'upper': p.legR = wind ? -0.4 : 2.3 * a; p.kneeR = wind ? 1.0 : 0; p.armR = wind ? -0.8 : 2.6 * a; p.lean = wind ? 0.4 : -0.4; p.crouch = wind ? 0.25 : 0; break;
    case 'spin': p.spin = f.moveFrame * 0.55; p.armR = 1.57; p.foreR = 0; p.armL = 1.57; p.foreL = 0; p.twist = 0; p.crouch = 0.1; break;
    case 'cast': p.armL = wind ? 0.4 : 1.6; p.armR = wind ? 2.4 : 1.5; p.foreL = 0.1; p.foreR = 0.1; p.lean = wind ? -0.2 : 0.3; p.legL = 0.35; p.legR = -0.3; break;
    case 'shoot': p.armL = 1.57; p.foreL = 0; p.armR = wind ? 1.2 : 0.6; p.foreR = wind ? 1.9 : 1.2; p.twist = -0.5; break;
    case 'airKick': p.legR = 1.0; p.kneeR = 0; p.legL = -0.4; p.kneeL = 1.3; p.lean = -0.3; p.armL = 1.4; p.armR = -1.0; break;
    case 'airSlash': p.armR = wind ? 3.0 : 0.4; p.foreR = 0.1; p.lean = wind ? -0.2 : 0.6; p.legL = 0.5; p.kneeL = 1.0; p.legR = -0.3; p.kneeR = 0.6; break;
  }
}

/**
 * 霸体大招的预警强度(0..约 0.7)。只在带霸体的招式前摇期间非零,并随时间闪烁。
 */
export function armorWarning(f: Fighter, time: number): number {
  const m = f.move;
  if (f.state !== 'attack' || !m?.armor || f.moveFrame >= m.startup) return 0;
  return 0.35 + 0.35 * Math.sin(time * 28);
}

/** 渲染器眼里的「角色外观」:方块人与贴图人都实现这个接口 */
export interface ActorView {
  root: THREE.Object3D;
  shadow: THREE.Mesh;
  update(f: Fighter, time: number, dt: number): void;
  hitFlash(): void;
}

/** 该角色是否有战斗贴图(至少要有 idle 这一张) */
export function hasSprites(id: string): boolean {
  return findArt(`sprites/${id}/idle`) !== null;
}

const texLoader = new THREE.TextureLoader();

/**
 * 贴图角色:一块始终面向镜头的平面,根据状态切换姿势图。
 * 贴图规范见 docs/ART-GUIDE.md(朝右、透明背景、脚底在画布底部往上约 6%)。
 */
export class SpriteRig implements ActorView {
  root = new THREE.Group();
  shadow: THREE.Mesh;
  private plane: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  /** 已加载的姿势贴图 */
  private tex = new Map<string, THREE.Texture>();
  private current = '';
  private flash = 0;
  /** 平面边长(米):画布里角色约占 85% 高度 */
  private size: number;

  constructor(private id: string, look: Look) {
    this.size = (SIM.BODY_H * look.scale) / 0.85 * 1.05;
    this.mat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.08, side: THREE.DoubleSide, color: 0xe6e6e6 });
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(this.size, this.size), this.mat);
    // 脚底在画布底部往上 6%:把平面上移,使脚底落在 y=0
    this.plane.position.y = this.size * (0.5 - 0.06);
    this.root.add(this.plane);
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.5 * look.bulk, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.setPose('idle');
  }

  /** 切换姿势;该姿势没有图时退回 idle */
  private setPose(pose: string) {
    if (pose === this.current) return;
    const url = findArt(`sprites/${this.id}/${pose}`) ?? findArt(`sprites/${this.id}/idle`);
    if (!url) return;
    this.current = pose;
    let t = this.tex.get(url);
    if (!t) {
      t = texLoader.load(url);
      t.colorSpace = THREE.SRGBColorSpace;
      this.tex.set(url, t);
    }
    this.mat.map = t;
    this.mat.needsUpdate = true;
  }

  /** 被打中时调用:触发一次闪白。 */
  hitFlash() { this.flash = 1; }

  /** 根据模拟状态选择姿势图 */
  /** 根据角色状态挑一张姿势图的名字(走路在两张图间交替)。 */
  private poseOf(f: Fighter, time: number): string {
    switch (f.state) {
      case 'walk': case 'run': return Math.floor(time * (f.state === 'run' ? 9 : 6)) % 2 ? 'walk2' : 'walk1';
      case 'jump': return 'jump';
      case 'attack': {
        const tier = f.move?.tier ?? 0;
        // 敌人只有一张 attack;主角按招式层级分 轻 / 重 / 特殊
        if (findArt(`sprites/${this.id}/attack`)) return 'attack';
        return tier >= Tier.SKILL ? 'special' : tier >= Tier.HEAVY ? 'heavy' : 'light';
      }
      case 'hitstun': case 'launched': case 'grabbed': return 'hurt';
      case 'knockdown': case 'dead': return 'down';
      default: return 'idle';
    }
  }

  update(f: Fighter, time: number, dt: number) {
    this.setPose(this.poseOf(f, time));
    const hurt = f.state === 'hitstun' || f.state === 'launched' || f.state === 'grabbed';
    const jitter = f.hitstop > 0 && hurt ? Math.sin(time * 90) * 0.06 : 0;
    this.root.position.set(f.x + jitter, f.y, f.z);
    this.plane.scale.x = f.facing; // 朝左时水平翻转
    this.plane.rotation.z = f.state === 'launched' ? -f.facing * 0.9 : 0; // 被打飞时身体后仰
    this.shadow.position.set(f.x, 0.02, f.z);
    this.shadow.scale.setScalar(Math.max(0.4, 1 - f.y * 0.25));
    this.flash = Math.max(0, this.flash - dt * 7);
    const warn = armorWarning(f, time);
    // 受击瞬间提亮;霸体大招前摇时偏橙色闪烁
    this.mat.color.setRGB(0.9 + this.flash * 3 + warn, 0.9 + this.flash * 3 - warn * 0.3, 0.9 + this.flash * 3 - warn * 0.8);
    const blink = f.invuln > 0 && f.state !== 'dodge' && f.hp > 0 && Math.floor(time * 20) % 2 === 0;
    this.root.visible = !(f.state === 'dead' && Math.floor(time * 12) % 2 === 0) && !blink;
  }
}
