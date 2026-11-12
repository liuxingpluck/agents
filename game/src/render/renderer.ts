// 画面层:用 Three.js 搭场景(地面、墙、火盆、粒子)、摆放角色、控制镜头与特效。
// 只「读」模拟层的状态来画画,不会反过来改游戏逻辑。
import * as THREE from 'three';
import { World } from '../sim/world';
import { RoomDef, SimEvent } from '../sim/types';
import { ActorView, hasSprites, PropRig, Rig, SpriteRig } from './rig';
import { findArt } from './art';

/** 场景主题配色:天空、雾、地面、石墙、飘落粒子、火光 */
interface Palette { sky: string; fog: string; ground: string; road: string; slab: string; stone: string; ash: string; fire: string }
const PALETTES: Record<string, Palette> = {
  ashsnow: { sky: '#0d0c14', fog: '#12101a', ground: '#25232c', road: '#3b3844', slab: '#474350', stone: '#23222b', ash: '#b9b4ad', fire: '#ff5a1f' },
  abbey: { sky: '#0a100e', fog: '#0f1714', ground: '#1f2623', road: '#353d38', slab: '#424b45', stone: '#222a26', ash: '#a8c2b0', fire: '#8dffb0' },
  mine: { sky: '#100b07', fog: '#17100a', ground: '#2a2018', road: '#40342a', slab: '#4d4034', stone: '#2a2119', ash: '#d9a05a', fire: '#ffa030' },
  city: { sky: '#0a0b18', fog: '#0f1022', ground: '#20223a', road: '#34365a', slab: '#40426a', stone: '#1f2136', ash: '#9aa4e0', fire: '#7a8cff' },
  abyss: { sky: '#120606', fog: '#1a0808', ground: '#2a1414', road: '#402020', slab: '#4d2828', stone: '#2a1212', ash: '#ff8a5a', fire: '#ff3a1a' },
};

/** 一个短命的小特效(火花/尘土):life 是剩余寿命,grow 是它变大的倍数。 */
interface Spark { mesh: THREE.Mesh; life: number; max: number; grow: number }

/** 渲染器总管:每帧把模拟世界画到画布上,并处理镜头跟随、震屏等效果。 */
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  // 角色 id → 外观;projMeshes:飞行道具 id → 模型
  private rigs = new Map<number, ActorView>();
  private projMeshes = new Map<number, THREE.Mesh>();
  /** 地上的道具 id → 模型 */
  private pickupMeshes = new Map<number, THREE.Mesh>();
  private sparks: Spark[] = [];
  // 飘落的灰雪/余烬粒子及其下落速度
  private embers!: THREE.Points;
  private emberVel!: Float32Array;
  // 震屏强度,随时间衰减
  private shake = 0;
  /** 重击时的镜头推近量(逐渐回弹) */
  private punch = 0;
  // 镜头当前的水平位置(平滑跟随主角)
  private camX = 0;
  private time = 0;
  private room!: RoomDef;
  // 场景里所有「布景」的容器,换房间时一次清空
  private stage = new THREE.Group();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.background = new THREE.Color('#0d0c14');
    this.scene.fog = new THREE.Fog('#12101a', 16, 50);
    this.scene.add(new THREE.HemisphereLight('#8f9cc4', '#3a2218', 2.2));
    const key = new THREE.DirectionalLight('#ffe9d0', 1.6);
    key.position.set(2, 6, 14);
    this.scene.add(key);
    const moon = new THREE.DirectionalLight('#9fb4ff', 2.2);
    moon.position.set(-6, 12, 8);
    this.scene.add(moon);
    const rim = new THREE.DirectionalLight('#ff6a2a', 1.6);
    rim.position.set(8, 3, -6);
    this.scene.add(rim);
    this.scene.add(this.stage);
  }

  /** 窗口大小变化时,同步画布尺寸与镜头比例。 */
  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 搭建房间场景(程序化) */
  buildRoom(room: RoomDef, seed = 1) {
    this.room = room;
    this.stage.clear();
    for (const r of this.rigs.values()) { this.scene.remove(r.root, r.shadow); }
    this.rigs.clear();
    // 简易伪随机:同一个 seed 总是搭出同样的布景,避免每次进房间都不一样
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const W = room.width, D = room.depth;
    const pal = PALETTES[room.theme] ?? PALETTES.ashsnow;
    (this.scene.background as THREE.Color).set(pal.sky);
    (this.scene.fog as THREE.Fog).color.set(pal.fog);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W + 40, D + 30), new THREE.MeshStandardMaterial({ color: pal.ground, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(W / 2, 0, D / 2);
    this.stage.add(ground);
    // 可行走区域的石板路
    const road = new THREE.Mesh(new THREE.PlaneGeometry(W + 4, D + 0.8), new THREE.MeshStandardMaterial({ color: pal.road, roughness: 0.95 }));
    road.rotation.x = -Math.PI / 2; road.position.set(W / 2, 0.01, D / 2);
    this.stage.add(road);
    // 美术贴图(可选):地面与远景。有图时覆盖程序生成的底色。
    const groundUrl = findArt(`bg/${room.theme}/ground`);
    if (groundUrl) {
      const gt = new THREE.TextureLoader().load(groundUrl);
      gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.colorSpace = THREE.SRGBColorSpace;
      gt.repeat.set((W + 4) / 6, (D + 0.8) / 6);
      (road.material as THREE.MeshStandardMaterial).map = gt;
      (road.material as THREE.MeshStandardMaterial).color.set('#ffffff');
    }
    const farUrl = findArt(`bg/${room.theme}/far`);
    if (farUrl) {
      const ft = new THREE.TextureLoader().load(farUrl);
      ft.wrapS = THREE.RepeatWrapping; ft.colorSpace = THREE.SRGBColorSpace;
      const fw = W + 60, fh = 24;
      ft.repeat.set(fw / (fh * 2), 1); // 远景图宽高比 2:1,横向平铺
      const far = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), new THREE.MeshBasicMaterial({ map: ft, fog: false }));
      far.position.set(W / 2, fh / 2 - 1.5, -14);
      this.stage.add(far);
    }
    const hasFar = !!farUrl;
    const slabMat = new THREE.MeshStandardMaterial({ color: pal.slab, roughness: 0.9 });
    for (let i = 0; i < (groundUrl ? 0 : W * 1.4); i++) {
      const sl = new THREE.Mesh(new THREE.PlaneGeometry(0.6 + rnd() * 1.2, 0.4 + rnd() * 0.7), slabMat);
      sl.rotation.x = -Math.PI / 2; sl.position.set(rnd() * W, 0.015, rnd() * D);
      this.stage.add(sl);
    }
    // 远景:残墙、石柱、枯树
    const stone = new THREE.MeshStandardMaterial({ color: pal.stone, roughness: 1, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: '#131218', roughness: 1, flatShading: true });
    for (let x = -4; x < W + 6; x += 2.4 + rnd() * 2.5) {
      const h = 1.2 + rnd() * 2.6;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(1.6 + rnd() * 1.6, h, 0.8), stone);
      wall.position.set(x, h / 2, -1.6 - rnd() * 1.2); wall.rotation.z = (rnd() - 0.5) * 0.08;
      this.stage.add(wall);
      if (!hasFar && rnd() < 0.45) {
        const tower = new THREE.Mesh(new THREE.BoxGeometry(2 + rnd() * 2, 7 + rnd() * 9, 2), dark);
        tower.position.set(x + rnd() * 3, tower.geometry.parameters.height / 2, -8 - rnd() * 10);
        this.stage.add(tower);
      }
      if (rnd() < 0.4) {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, 2.6, 5), dark); trunk.position.y = 1.3; tree.add(trunk);
        for (let b = 0; b < 4; b++) {
          const br = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.06, 1.2, 4), dark);
          br.position.set((rnd() - 0.5) * 0.8, 2 + rnd() * 0.8, (rnd() - 0.5) * 0.4); br.rotation.z = (rnd() - 0.5) * 2;
          tree.add(br);
        }
        tree.position.set(x + 1, 0, -0.9 - rnd()); this.stage.add(tree);
      }
      if (rnd() < 0.3) {
        // 余烬火盆:暖色点光
        const fire = new THREE.PointLight(pal.fire, 6, 9, 1.8);
        fire.position.set(x, 1.1, -0.6);
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.18, 0.9, 6), stone); bowl.position.set(x, 0.45, -0.6);
        const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshBasicMaterial({ color: pal.fire })); flame.position.set(x, 1.1, -0.6);
        this.stage.add(fire, bowl, flame);
      }
    }
    // (曾经有近景剪影方块,离镜头太近会挡住角色,已去掉)
    // 灰雪 / 余烬粒子
    const N = 500;
    const pos = new Float32Array(N * 3); this.emberVel = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = rnd() * (W + 20) - 10; pos[i * 3 + 1] = rnd() * 9; pos[i * 3 + 2] = rnd() * 16 - 8;
      this.emberVel[i] = 0.3 + rnd() * 0.7;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.embers = new THREE.Points(geo, new THREE.PointsMaterial({ color: pal.ash, size: 0.07, transparent: true, opacity: 0.7 }));
    this.stage.add(this.embers);
    this.camX = 5;
  }

  /** 生成一个火花:在指定位置放个发光小方块,逐渐放大并淡出。 */
  private spark(x: number, y: number, z: number, color: string, size: number, life: number, grow: number) {
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(size), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    mesh.position.set(x, y, z + 0.3); mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    this.scene.add(mesh);
    this.sparks.push({ mesh, life, max: life, grow });
  }

  /**
   * 把模拟层这一帧的事件变成画面反馈:火花、震屏、镜头冲击、尘土。
   * @param w 传入世界以便查到角色位置(落地尘土用);不传则跳过需要位置的效果
   */
  handleEvents(events: SimEvent[], w?: World) {
    for (const e of events) {
      if (e.type === 'hit') {
        this.spark(e.x, e.y, e.z, e.heavy ? '#ffb347' : '#fff1c9', e.heavy ? 0.32 : 0.2, 0.18, e.heavy ? 7 : 5);
        this.spark(e.x, e.y, e.z, '#ff5a1f', 0.12, 0.3, 9);
        this.shake = Math.max(this.shake, e.heavy ? 0.16 : 0.06);
        if (e.heavy) this.punch = Math.max(this.punch, 0.5);
        this.rigs.get(e.victim)?.hitFlash();
      } else if (e.type === 'ko') { this.shake = Math.max(this.shake, 0.28); this.punch = 1; }
      else if (e.type === 'comboBreak') this.shake = Math.max(this.shake, 0.2);
      else if (e.type === 'break') {
        // 木桶碎裂:几片木屑色的碎块
        for (let i = 0; i < 4; i++) this.spark(e.x + (Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.6, e.z, '#8a6a4a', 0.14, 0.4, 3);
        this.shake = Math.max(this.shake, 0.1);
      } else if (e.type === 'bossPhase') { this.shake = Math.max(this.shake, 0.4); this.punch = 1; }
      else if (e.type === 'wallBounce') {
        // 撞墙:一大一小两团火花 + 震屏
        this.spark(e.x, e.y, e.z, '#ffe9c0', 0.3, 0.22, 6);
        this.spark(e.x, e.y, e.z, '#8a8490', 0.2, 0.4, 5);
        this.shake = Math.max(this.shake, 0.2);
      }
      else if (e.type === 'land' && w) {
        const f = w.fighters.find(x => x.id === e.id);
        // 被打飞后摔在地上才扬尘,普通跳跃落地不扬
        if (f && (f.state === 'knockdown' || f.state === 'dead')) {
          for (let i = -1; i <= 1; i++) this.spark(f.x + i * 0.35, 0.12, f.z, '#8a8490', 0.16, 0.45, 4);
          this.shake = Math.max(this.shake, 0.08);
        }
      }
    }
  }

  /** 世界坐标 → 屏幕像素坐标(伤害数字等界面元素定位用) */
  project(x: number, y: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const c = this.renderer.domElement;
    return { x: (v.x * 0.5 + 0.5) * c.clientWidth, y: (-v.y * 0.5 + 0.5) * c.clientHeight };
  }

  /**
   * 每帧调用:更新角色/飞行道具/特效/粒子,再移动镜头并真正画出画面。
   * focusId 是镜头跟随的角色(玩家)。
   */
  render(w: World, focusId: number, dt: number) {
    this.time += dt;
    const seen = new Set<number>();
    let focusX = this.camX;
    for (const f of w.fighters) {
      seen.add(f.id);
      let rig = this.rigs.get(f.id);
      if (!rig) {
        // 有战斗贴图就用贴图人,否则用程序绘制的方块人
        rig = f.def.role === 'prop' ? new PropRig(f.def.look)
          : hasSprites(f.def.id) ? new SpriteRig(f.def.id, f.def.look) : new Rig(f.def.look);
        this.rigs.set(f.id, rig);
        this.scene.add(rig.root, rig.shadow);
      }
      rig.update(f, this.time, dt);
      if (f.id === focusId) focusX = f.x;
    }
    for (const [id, rig] of this.rigs) if (!seen.has(id)) { this.scene.remove(rig.root, rig.shadow); this.rigs.delete(id); }

    // 飞行道具:没有就新建模型,已消失的就移除
    const pSeen = new Set<number>();
    for (const p of w.projectiles) {
      pSeen.add(p.id);
      let m = this.projMeshes.get(p.id);
      if (!m) {
        m = new THREE.Mesh(new THREE.OctahedronGeometry(p.def.radius), new THREE.MeshBasicMaterial({ color: p.def.color, blending: THREE.AdditiveBlending, transparent: true }));
        this.projMeshes.set(p.id, m); this.scene.add(m);
      }
      m.position.set(p.x, p.y, p.z); m.rotation.x += 0.4; m.scale.set(1.8, 1, 1);
      if (Math.random() < 0.5) this.spark(p.x, p.y, p.z - 0.3, p.def.color, 0.08, 0.25, 2);
    }
    for (const [id, m] of this.projMeshes) if (!pSeen.has(id)) { this.scene.remove(m); this.projMeshes.delete(id); }

    // 道具:食物是暖黄色小球,余烬是橙色晶体;原地上下浮动,快消失时闪烁
    const kSeen = new Set<number>();
    for (const k of w.pickups) {
      kSeen.add(k.id);
      let m = this.pickupMeshes.get(k.id);
      if (!m) {
        m = k.kind === 'food'
          ? new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffd27a' }))
          : new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshBasicMaterial({ color: '#ff6a2a' }));
        this.pickupMeshes.set(k.id, m); this.scene.add(m);
      }
      m.position.set(k.x, 0.35 + Math.sin(this.time * 4 + k.id) * 0.08, k.z);
      m.rotation.y += dt * 2;
      m.visible = k.life > 120 || Math.floor(this.time * 10) % 2 === 0;
    }
    for (const [id, m] of this.pickupMeshes) if (!kSeen.has(id)) { this.scene.remove(m); this.pickupMeshes.delete(id); }

    for (const s of this.sparks) {
      s.life -= dt;
      const k = 1 - s.life / s.max;
      s.mesh.scale.setScalar(1 + k * s.grow);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k);
    }
    // 清理寿命用完的火花
    this.sparks = this.sparks.filter(s => { if (s.life <= 0) { this.scene.remove(s.mesh); s.mesh.geometry.dispose(); return false; } return true; });

    // 让粒子缓缓下落,落到地面后回到顶部循环
    const pos = this.embers.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) - this.emberVel[i] * dt * 0.8;
      if (y < 0) y = 9;
      pos.setY(i, y);
      pos.setX(i, pos.getX(i) + Math.sin(this.time + i) * dt * 0.15);
    }
    pos.needsUpdate = true;

    // 相机跟随,限制在房间内
    const halfView = 6.5;
    const tx = Math.min(Math.max(focusX, halfView - 2), this.room.width - halfView + 2);
    this.camX += (tx - this.camX) * Math.min(1, dt * 4);
    this.shake = Math.max(0, this.shake - dt * 0.9);
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    const D = this.room.depth;
    this.punch = Math.max(0, this.punch - dt * 4);
    this.camera.position.set(this.camX + sx, 3.9 + sy, D + 9.2 - this.punch * 0.6);
    this.camera.lookAt(this.camX + sx, 1.3, D / 2 - 0.6);
    this.renderer.render(this.scene, this.camera);
  }
}
