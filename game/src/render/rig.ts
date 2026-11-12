// 程序化低模角色:由 Look 参数生成,无需外部美术资源。模型朝 +x 方向搭建。
import * as THREE from 'three';
import { Fighter, Look, SIM } from '../sim/types';

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

export const REST: Pose = {
  armL: 0.1, armR: 0.25, foreL: 0.3, foreR: 0.5, legL: 0.05, legR: -0.05, kneeL: 0, kneeR: 0,
  lean: 0.05, twist: 0, tilt: 0, spin: 0, lift: 0, crouch: 0,
};

const mat = (c: string, emissive?: string) =>
  new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0.15, emissive: emissive ?? '#000000', emissiveIntensity: emissive ? 1.6 : 0, flatShading: true });

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

export class Rig {
  root = new THREE.Group();
  private body = new THREE.Group();
  private torso = new THREE.Group();
  private aL; private aR; private lL; private lR;
  private pose: Pose = { ...REST };
  private flash = 0;
  private mats: THREE.MeshStandardMaterial[] = [];
  shadow: THREE.Mesh;
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

  hitFlash() { this.flash = 1; }

  /** 根据模拟状态计算目标姿势并平滑过渡 */
  update(f: Fighter, time: number, dt: number) {
    const tgt = targetPose(f, time);
    const k = Math.min(1, dt * (f.state === 'attack' ? 30 : 16));
    const p = this.pose;
    for (const key of Object.keys(p) as (keyof Pose)[]) p[key] += (tgt[key] - p[key]) * k;

    this.root.position.set(f.x, f.y + p.lift, f.z);
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
    for (const m of this.mats) { m.emissive.setScalar(this.flash * 0.9); m.emissiveIntensity = 1; }
  }
}

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
    case 'getup': {
      const k = Math.min(1, f.stateFrame / SIM.GETUP_FRAMES);
      p.tilt = (1 - k) * 1.2; p.crouch = 0.3 * (1 - k); p.lean = 0.5 * (1 - k); p.kneeL = 0.8 * (1 - k); p.kneeR = 0.8 * (1 - k);
      break;
    }
    case 'attack': attackPose(f, p); break;
  }
  return p;
}

function attackPose(f: Fighter, p: Pose) {
  const m = f.move!;
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
