// 角色外观:用方块拼出的低模小人(Rig)和贴图小人(SpriteRig)。
// 它们只负责「画」:根据模拟层给出的角色状态(站、走、攻击、倒地等)摆姿势,
// 不参与任何战斗判定。模型朝 +x 方向搭建。
import * as THREE from 'three';
import { CharacterDef, Fighter, Look, SIM, Tier } from '../sim/types';
import { findArt, spriteMeta } from './art';
import { chainIds } from '../data/tuning';

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
function limb(len: number, w: number, m: THREE.Material, mLower: THREE.Material = m): { pivot: THREE.Group; lower: THREE.Group } {
  const pivot = new THREE.Group();
  const up = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), m);
  up.position.y = -len / 2;
  pivot.add(up);
  const lower = new THREE.Group();
  lower.position.y = -len;
  const lo = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, len, w * 0.85), mLower);
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
    const fem = !!look.feminine;
    // 女性体型:腿更长、躯干略短、肩与四肢更细
    const legLen = (fem ? 0.47 : 0.42) * s, armLen = 0.36 * s;
    const torsoH = (fem ? 0.54 : 0.62) * s, headY = torsoH + 0.18 * s;
    const limbW = fem ? 0.78 : 1;
    this.hipY = legLen * 2;
    const mPrim = mat(look.primary), mSec = mat(look.secondary), mSkin = mat(look.skin);
    const mLeg = look.legColor ? mat(look.legColor) : mSec;
    this.mats.push(mPrim, mSec, mSkin, mLeg);

    this.root.add(this.body);
    this.body.position.y = this.hipY;
    this.body.add(this.torso);

    const chest = new THREE.Mesh(new THREE.BoxGeometry((fem ? 0.26 : 0.3) * bk, torsoH, (fem ? 0.42 : 0.5) * bk), mPrim);
    chest.position.y = torsoH / 2 + 0.02 * s;
    this.torso.add(chest);
    if (fem) {
      // 胸甲 / 上衣的起伏,以及收窄的腰线
      const bust = new THREE.Mesh(new THREE.BoxGeometry(0.1 * bk, 0.17 * s, 0.38 * bk), mPrim);
      bust.position.set(0.14 * bk, torsoH * 0.68, 0);
      const waist = new THREE.Mesh(new THREE.BoxGeometry(0.22 * bk, 0.12 * s, 0.34 * bk), mSec);
      waist.position.y = 0.12 * s;
      this.torso.add(bust, waist);
    }
    const belt = new THREE.Mesh(new THREE.BoxGeometry((fem ? 0.3 : 0.32) * bk, 0.12 * s, (fem ? 0.48 : 0.52) * bk), mSec);
    belt.position.y = 0.04 * s;
    this.torso.add(belt);
    if (look.skirt) {
      // 短裙:上窄下宽的一圈,挂在髋部,不随腿摆动
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * bk, 0.34 * bk, 0.26 * s, 8), mPrim);
      skirt.position.y = -0.1 * s;
      this.body.add(skirt);
    }
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26 * s, 0.28 * s, 0.26 * s), look.hood ? mSec : mSkin);
    head.position.y = headY;
    this.torso.add(head);
    if (!look.hood && !look.glow) {
      // 眼睛:脸朝 +x 方向,两个小深色方块
      for (const z of [-0.06, 0.06]) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.035 * s, 0.045 * s), mat('#1a1418'));
        eye.position.set(0.131 * s, headY + 0.02 * s, z * s);
        this.torso.add(eye);
      }
    }
    if (look.hair && !look.hood) {
      const mHair = mat(look.hairColor ?? '#2a2018');
      const add = (w: number, h: number, d: number, x: number, y: number, z = 0, rz = 0) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w * s, h * s, d * s), mHair);
        m.position.set(x * s, headY + y * s, z * s); m.rotation.z = rz;
        this.torso.add(m);
      };
      add(0.29, 0.1, 0.29, -0.01, 0.13);              // 头顶
      add(0.09, 0.2, 0.29, -0.11, 0.03);              // 后脑
      add(0.06, 0.08, 0.29, 0.1, 0.11);               // 刘海
      if (look.hair === 'long') add(0.07, 0.62, 0.27, -0.15, -0.32, 0, -0.08);          // 披到背后的长发
      if (look.hair === 'ponytail') { add(0.1, 0.1, 0.1, -0.18, 0.12); add(0.06, 0.5, 0.08, -0.24, -0.16, 0, -0.25); } // 高马尾
      if (look.hair === 'braid') add(0.07, 0.5, 0.07, 0.02, -0.3, 0.14, 0.1);           // 垂在肩前的麻花辫
    }
    if (look.glow) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04 * s, 0.16 * s), mat(look.glow, look.glow));
      eye.position.set(0.135 * s, headY + 0.02 * s, 0);
      this.torso.add(eye);
    }
    if (look.horns) for (const z of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.05 * s, 0.25 * s, 4), mat(look.accent));
      h.position.set(0, headY + 0.22 * s, z * 0.12 * s); h.rotation.x = z * 0.4;
      this.torso.add(h);
    }
    if (look.cape) {
      const cape = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.9 * s, 0.46 * bk), mSec);
      cape.position.set(-0.19 * bk, 0.18 * s, 0); cape.rotation.z = -0.12;
      this.torso.add(cape);
    }

    // 女性角色露出前臂(下半截用肤色)
    this.aL = limb(armLen, 0.13 * bk * limbW, mPrim, fem ? mSkin : mPrim);
    this.aR = limb(armLen, 0.13 * bk * limbW, mPrim, fem ? mSkin : mPrim);
    const shY = torsoH - 0.04 * s, shZ = (fem ? 0.27 : 0.32) * bk;
    this.aL.pivot.position.set(0, shY, -shZ);
    this.aR.pivot.position.set(0, shY, shZ);
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
    this.lL = limb(legLen, 0.16 * bk * limbW, mLeg);
    this.lR = limb(legLen, 0.16 * bk * limbW, mLeg);
    if (fem) {
      for (const leg of [this.lL, this.lR]) {
        // 裙摆与长袜之间露出的一小段大腿,以及脚上的鞋
        const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.165 * bk * limbW, legLen * 0.24, 0.165 * bk * limbW), mSkin);
        thigh.position.y = -legLen * 0.14;
        leg.pivot.add(thigh);
        const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.2 * s, 0.07 * s, 0.11 * bk), mSec);
        shoe.position.set(0.04 * s, -legLen + 0.03 * s, 0);
        leg.lower.add(shoe);
      }
    }
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
    case 'guard': {
      // 格挡:双臂架在身前,重心下沉
      p.crouch = 0.12; p.lean = 0.15; p.armL = 1.5; p.foreL = 1.6; p.armR = 1.2; p.foreR = 1.7; p.legL = 0.35; p.legR = -0.3;
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
  /** 残影(只有贴图角色支持) */
  ghost?(color: string): THREE.Mesh | null;
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
  /** 当前姿势图的校正:放大倍数、人物重心在画布里的横向位置(0~1) */
  private poseK = 1;
  private poseCx = 0.5;
  /** 已经走过的距离(米):用来按步幅切换迈步图,避免「脚在滑」 */
  private dist = 0;
  private lastX = NaN;
  private lastZ = 0;
  /** 身体动作的当前值(逐帧向目标值平滑过渡):前后位移、上下位移、倾斜、横向 / 纵向拉伸 */
  private mo = { x: 0, y: 0, rot: 0, sx: 1, sy: 1 };

  constructor(private id: string, look: Look) {
    this.size = (SIM.BODY_H * look.scale) / 0.85 * 1.05;
    this.mat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.08, side: THREE.DoubleSide, color: 0xe6e6e6 });
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(this.size, this.size), this.mat);
    this.root.add(this.plane);
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.5 * look.bulk, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.setPose('idle');
  }

  /** 在候选姿势里挑第一张存在的图(新美术没到位时自动退回旧图) */
  private pick(...names: string[]): string {
    for (const n of names) if (findArt(`sprites/${this.id}/${n}`)) return n;
    return 'idle';
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
    // 每张图里人物的大小和位置不完全一样(武器伸得远的图,人会被画得小一些、偏后一些),这里读取校正值
    const meta = spriteMeta(this.id, pose);
    this.poseK = meta.k; this.poseCx = meta.cx;
  }

  /** 被打中时调用:触发一次闪白。 */
  hitFlash() { this.flash = 1; }

  /**
   * 生成一个「残影」:一张停在原地、马上淡出的半透明副本(冲刺、突进、瞬移时用,显得动作很快)。
   * @param color 残影的颜色
   */
  ghost(color: string): THREE.Mesh | null {
    if (!this.mat.map) return null;
    // 几何体单独复制一份:残影消失时会被销毁,不能和本体共用
    const m = new THREE.Mesh(this.plane.geometry.clone(), new THREE.MeshBasicMaterial({
      map: this.mat.map, transparent: true, opacity: 0.5, color, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }));
    m.position.copy(this.root.position).add(this.plane.position);
    m.scale.copy(this.plane.scale);
    m.rotation.z = this.plane.rotation.z;
    return m;
  }

  /**
   * 根据角色状态挑一张姿势图。
   * 每种情况都按「最贴切的图 → 退而求其次的图」排列,所以第二批美术(跑步循环、各段连击、蓄力、格挡、空中攻击等)
   * 一放进来就会自动用上,没有的继续用现有的图。
   */
  private poseOf(f: Fighter): string {
    switch (f.state) {
      case 'run': {
        // 跑步:有 4 帧循环就用,没有就用两张走路图顶替;按跑过的距离切帧
        const i = Math.floor(this.dist / 0.55);
        if (findArt(`sprites/${this.id}/run1`)) return this.pick(`run${1 + (i % 4)}`, `run${1 + (i % 2)}`, 'run1');
        return i % 2 ? this.pick('walk2', 'idle') : 'walk1';
      }
      case 'walk': return Math.floor(this.dist / 0.42) % 2 ? this.pick('walk2', 'idle') : 'walk1';
      case 'jump': return 'jump';
      case 'attack': {
        const m = f.move!;
        if (m.grab) return this.pick('grab', 'attack', 'light');
        if (m.chargeable) return f.moveFrame < m.startup ? this.pick('charge', 'heavy', 'attack') : this.pick('heavy3', 'heavy', 'attack');
        if (f.y > 0) return m.tier >= Tier.HEAVY ? this.pick('airheavy', 'attack', 'heavy') : this.pick('airlight', 'attack', 'light');
        const n = chainIndex(f.def, m.id); // 这是连段里的第几下:让每一下用不同的图
        if (m.tier >= Tier.SUPER) return this.pick('super', 'special', 'attack');
        if (m.tier >= Tier.SKILL) return this.pick(`special${1 + (f.def.skills.indexOf(m.id) % 3)}`, 'special', 'attack');
        if (m.tier >= Tier.COMMAND) return this.pick('command', 'heavy', 'attack');
        if (m.tier >= Tier.HEAVY) return this.pick(['heavy', 'heavy2', 'heavy3'][n % 3], 'heavy', 'attack2', 'attack');
        return this.pick(['light', 'light2', 'light3'][n % 3], 'light', 'attack');
      }
      case 'guard': return this.pick('guard', 'idle');
      case 'dodge': return this.pick('dodge', 'walk1');
      case 'launched': return this.pick('launched', 'hurt');
      case 'hitstun': case 'grabbed': return 'hurt';
      case 'getup': return this.pick('getup', 'idle');
      case 'knockdown': case 'dead': return 'down';
      default: return 'idle';
    }
  }

  /**
   * 身体动作的目标值。静态的图靠这些小动作「活」起来:走跑时一起一伏并前倾,
   * 出招时先后仰蓄势、再前冲拉伸、最后收回;挨打时后仰。
   */
  private motionTarget(f: Fighter, time: number) {
    const t = { x: 0, y: 0, rot: 0, sx: 1, sy: 1 };
    const S = this.size;
    switch (f.state) {
      case 'walk': case 'run': {
        const run = f.state === 'run';
        const phase = (this.dist / (run ? 0.55 : 0.42)) * Math.PI;
        t.y = Math.abs(Math.sin(phase)) * S * (run ? 0.045 : 0.022);
        t.rot = -(run ? 0.13 : 0.04);
        break;
      }
      case 'idle': t.sy = 1 + Math.sin(time * 2.6 + f.id) * 0.008; break; // 呼吸
      case 'attack': {
        const m = f.move!, heavy = m.tier >= Tier.HEAVY ? 1.5 : 1;
        const n = chainIndex(f.def, m.id);
        if (m.chargeable && f.moveFrame < m.startup) {
          // 蓄力:压低重心、微微颤抖
          t.x = -0.06 * S; t.rot = 0.1; t.sy = 0.94; t.sx = 1.04; t.y = Math.sin(time * 60) * 0.006 * S;
        } else if (f.moveFrame < m.startup) {
          const k = f.moveFrame / Math.max(1, m.startup);
          t.x = -0.07 * S * heavy * k; t.rot = 0.07 * heavy * k; // 后仰蓄势
        } else if (f.moveFrame < m.startup + m.active + 2) {
          // 击出:前冲 + 横向拉伸;连段里单数下和双数下的倾斜方向相反,看起来不是同一个动作
          t.x = 0.13 * S * heavy; t.rot = (n % 2 ? 0.05 : -0.1) * heavy; t.sx = 1 + 0.07 * heavy; t.sy = 1 - 0.03 * heavy;
          if (n % 2) t.y = 0.03 * S;
        } else {
          t.x = 0.04 * S; t.rot = -0.02;
        }
        break;
      }
      case 'hitstun': t.x = -0.05 * S; t.rot = 0.16; break;
      case 'guard': t.sy = 0.96; t.rot = 0.03; break;
      case 'dodge': t.rot = -0.3; t.sy = 0.85; break;
      case 'launched': t.rot = 0.9; break;
      case 'getup': t.sy = 0.8 + 0.2 * Math.min(1, f.stateFrame / SIM.GETUP_FRAMES); break;
    }
    return t;
  }

  update(f: Fighter, time: number, dt: number) {
    // 累计走过的距离(瞬移之类的大跳变不算)
    if (!Number.isNaN(this.lastX)) { const d = Math.hypot(f.x - this.lastX, f.z - this.lastZ); if (d < 0.6) this.dist += d; }
    this.lastX = f.x; this.lastZ = f.z;

    this.setPose(this.poseOf(f));
    const tgt = this.motionTarget(f, time), mo = this.mo;
    const ease = Math.min(1, dt * (f.state === 'attack' ? 34 : 18));
    for (const key of ['x', 'y', 'rot', 'sx', 'sy'] as const) mo[key] += (tgt[key] - mo[key]) * ease;

    const hurt = f.state === 'hitstun' || f.state === 'launched' || f.state === 'grabbed';
    const jitter = f.hitstop > 0 && hurt ? Math.sin(time * 90) * 0.06 : 0;
    this.root.position.set(f.x + jitter, f.y, f.z);
    // 画布按校正倍数放大;脚底(画布底部往上 6.25%)对齐地面;人物重心对齐角色所在位置
    const k = this.poseK, S = this.size;
    this.plane.scale.set(f.facing * k * mo.sx, k * mo.sy, 1);
    this.plane.position.set(
      f.facing * (mo.x - (this.poseCx - 0.5) * S * k),
      S * k * mo.sy * (0.5 - 0.0625) + mo.y,
      0,
    );
    this.plane.rotation.z = -f.facing * mo.rot; // 正值 = 向后仰
    this.shadow.position.set(f.x, 0.02, f.z);
    this.shadow.scale.setScalar(Math.max(0.4, 1 - f.y * 0.25));
    this.flash = Math.max(0, this.flash - dt * 7);
    const warn = armorWarning(f, time);
    // 受击瞬间提亮;霸体大招前摇时偏橙色闪烁;蓄力越久越亮(带闪烁);格挡时整体偏冷色
    const chg = f.charge > 0 ? (f.charge / SIM.CHARGE_MAX) * (0.5 + 0.3 * Math.sin(time * 40)) : 0;
    const grd = f.state === 'guard' ? 0.25 : 0;
    this.mat.color.setRGB(0.9 + this.flash * 3 + warn + chg - grd, 0.9 + this.flash * 3 - warn * 0.3 + chg * 0.7 - grd * 0.3, 0.9 + this.flash * 3 - warn * 0.8 + chg * 0.2 + grd);
    const blink = f.invuln > 0 && f.state !== 'dodge' && f.hp > 0 && Math.floor(time * 20) % 2 === 0;
    this.root.visible = !(f.state === 'dead' && Math.floor(time * 12) % 2 === 0) && !blink;
  }
}

/** 每个角色「招式 id → 它是所在连段里的第几下」的缓存 */
const chainIndexCache = new Map<CharacterDef, Map<string, number>>();

/** 一招是它所在连段(轻 / 踢 / 重)里的第几下(0 起);不在任何连段里则为 0 */
function chainIndex(def: CharacterDef, moveId: string): number {
  let m = chainIndexCache.get(def);
  if (!m) {
    m = new Map();
    for (const btn of ['LP', 'LK', 'HP', 'HK'] as const) chainIds(def, def.normals[btn], btn).forEach((id, i) => m!.set(id, i));
    chainIds(def, def.airNormals.LP, 'LP').forEach((id, i) => m!.set(id, i));
    chainIndexCache.set(def, m);
  }
  return m.get(moveId) ?? 0;
}

/** 场景物件(木桶)的外观:一个带铁箍的圆桶,被打时晃一下。 */
export class PropRig implements ActorView {
  root = new THREE.Group();
  shadow: THREE.Mesh;
  private wobble = 0;

  /** @param def 物件定义:按 id 决定外形(木桶 / 木箱 / 岩石 / 路障),尺寸取自它的碰撞范围 */
  constructor(def: CharacterDef) {
    const look = def.look;
    const sd = def.solid ?? { hx: SIM.BODY_HALF_W * look.bulk, hz: SIM.BODY_HALF_W * look.bulk, h: SIM.BODY_H * look.scale };
    const main = mat(look.primary), trim = mat(look.accent), dark = mat(look.secondary);
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z = 0) => {
      const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); this.root.add(mesh); return mesh;
    };
    switch (def.id) {
      case 'rock': {
        // 岩石:几块压扁的多面体堆在一起
        const a = add(new THREE.DodecahedronGeometry(sd.hx * 1.05), main, 0, sd.h * 0.5); a.scale.set(1, sd.h / (sd.hx * 1.7), sd.hz / sd.hx); a.rotation.y = 0.6;
        const b2 = add(new THREE.DodecahedronGeometry(sd.hx * 0.6), trim, sd.hx * 0.5, sd.h * 0.3, sd.hz * 0.4); b2.rotation.set(0.5, 1, 0.2);
        break;
      }
      case 'crate': {
        add(new THREE.BoxGeometry(sd.hx * 2, sd.h, sd.hz * 2), main, 0, sd.h / 2);
        for (const y of [0.08, 0.92]) add(new THREE.BoxGeometry(sd.hx * 2.06, sd.h * 0.1, sd.hz * 2.06), dark, 0, sd.h * y);
        add(new THREE.BoxGeometry(sd.hx * 2.04, sd.h * 0.08, sd.hz * 2.04), trim, 0, sd.h * 0.5).rotation.z = 0.5;
        break;
      }
      case 'barricade': {
        // 路障:几根立柱加两道横木,顶端削尖
        for (let i = -2; i <= 2; i++) {
          add(new THREE.BoxGeometry(0.16, sd.h, 0.16), main, i * sd.hx * 0.45, sd.h / 2);
          add(new THREE.ConeGeometry(0.12, 0.3, 4), main, i * sd.hx * 0.45, sd.h + 0.14);
        }
        for (const y of [0.35, 0.75]) add(new THREE.BoxGeometry(sd.hx * 2, 0.12, 0.1), dark, 0, sd.h * y, 0.1);
        break;
      }
      default: {
        // 木桶
        const h = sd.h, r = sd.hx;
        add(new THREE.CylinderGeometry(r, r * 0.85, h, 10), main, 0, h / 2);
        for (const y of [0.25, 0.75]) add(new THREE.CylinderGeometry(r * 1.03, r * 1.03, h * 0.07, 10), trim, 0, h * y);
      }
    }
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(Math.max(sd.hx, sd.hz) * 1.25, 12),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.scale.set(1, sd.hz / Math.max(sd.hx, sd.hz), 1);
  }

  hitFlash() { this.wobble = 1; }

  update(f: Fighter, time: number, dt: number) {
    this.wobble = Math.max(0, this.wobble - dt * 5);
    this.root.position.set(f.x, 0, f.z);
    this.root.rotation.z = Math.sin(time * 40) * 0.12 * this.wobble;
    this.shadow.position.set(f.x, 0.02, f.z);
    this.root.visible = f.state !== 'dead';
    this.shadow.visible = this.root.visible;
  }
}
