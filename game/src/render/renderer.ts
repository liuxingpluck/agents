// 画面层:用 Three.js 搭场景(地面、墙、火盆、粒子)、摆放角色、控制镜头与特效。
// 只「读」模拟层的状态来画画,不会反过来改游戏逻辑。
import * as THREE from 'three';
import { hazardState, World } from '../sim/world';
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
  /** 每个角色上一次留残影是第几帧(避免同一帧重复生成) */
  private lastGhostFrame = new Map<number, number>();
  /** 喷火口 id → 地面光圈 */
  private hazardMeshes = new Map<number, THREE.Mesh>();
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
    // alpha: true 让画布支持透明底(给角色拍立绘时用);平时场景有背景色,看不出区别
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
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
    this.hazardMeshes.clear();
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
      gt.wrapS = gt.wrapT = THREE.MirroredRepeatWrapping; gt.colorSpace = THREE.SRGBColorSpace;
      // 贴图铺满整块地面(每 6 米重复一次);中间那条纯色「路」就不需要了
      gt.repeat.set((W + 40) / 6, (D + 30) / 6);
      (ground.material as THREE.MeshStandardMaterial).map = gt;
      (ground.material as THREE.MeshStandardMaterial).color.set('#8f8f96'); // 压暗一些,让角色更突出
      road.visible = false;
    }
    const farUrl = findArt(`bg/${room.theme}/far`);
    if (farUrl) {
      const ft = new THREE.TextureLoader().load(farUrl);
      // 镜像平铺:每隔一张左右翻转,这样接缝两侧的画面总是对得上
      ft.wrapS = THREE.MirroredRepeatWrapping; ft.colorSpace = THREE.SRGBColorSpace;
      // 远景画立在可行走区域的正后方,底边略低于地面,这样画里的近处地形正好接上地面,中间不留空带
      const fw = W + 48, fh = 12;
      ft.repeat.set(fw / (fh * 2), 1); // 远景图宽高比 2:1,横向平铺
      const far = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), new THREE.MeshBasicMaterial({ map: ft, fog: false }));
      far.position.set(W / 2, fh / 2 - 0.4, -3.2);
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
    // 有手绘远景时不再生成程序布景(方块残墙和插画背景放在一起很突兀,还会挡住画面主体)
    for (let x = -4; x < (hasFar ? -4 : W + 6); x += 2.4 + rnd() * 2.5) {
      const h = 1.2 + rnd() * 2.6;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(1.6 + rnd() * 1.6, h, 0.8), stone);
      wall.position.set(x, h / 2, -1.6 - rnd() * 1.2); wall.rotation.z = (rnd() - 0.5) * 0.08;
      this.stage.add(wall);
      if (!hasFar && rnd() < 0.45) {
        const tower = new THREE.Mesh(new THREE.BoxGeometry(2 + rnd() * 2, 7 + rnd() * 9, 2), dark);
        tower.position.set(x + rnd() * 3, tower.geometry.parameters.height / 2, -8 - rnd() * 10);
        this.stage.add(tower);
      }
      // 枯树只长在地面上的两个主题里(矿道、王都、烬渊没有)
      if ((room.theme === 'ashsnow' || room.theme === 'abbey' || !PALETTES[room.theme]) && rnd() < 0.4) {
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
    if (!hasFar) this.decorate(room.theme, W, rnd, stone, dark, pal);
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

  /**
   * 各主题专属的布景,让五个章节一眼就能分清:
   *  灰雪边境 —— 木栅尖桩与瞭望塔    泣骨修道院 —— 尖拱回廊、墓碑、烛光
   *  深根矿道 —— 木支架、铁轨、发光根须  无王之都 —— 亮着窗的高塔、石像
   *  烬渊之心 —— 倒悬的尖塔、地面的余烬裂缝、远处的余烬之日
   * 全部摆在可行走区域之外(z < 0 的后方或高空),不影响战斗。
   */
  private decorate(theme: string, W: number, rnd: () => number, stone: THREE.Material, dark: THREE.Material, pal: Palette) {
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); this.stage.add(mesh); return mesh;
    };
    const glow = new THREE.MeshBasicMaterial({ color: pal.fire });
    const wood = new THREE.MeshStandardMaterial({ color: '#3d2c1e', roughness: 1, flatShading: true });
    switch (theme) {
      case 'ashsnow':
        for (let x = 0; x < W; x += 0.7 + rnd() * 0.5) {
          if (Math.floor(x / 6) % 2) continue; // 每隔一段留个缺口
          const h = 1.6 + rnd() * 0.9;
          add(new THREE.ConeGeometry(0.16, h, 5), wood, x, h / 2, -0.9 - rnd() * 0.2).rotation.z = (rnd() - 0.5) * 0.15;
        }
        for (let x = 6; x < W; x += 14) {
          for (const dx of [-0.8, 0.8]) add(new THREE.BoxGeometry(0.18, 5, 0.18), wood, x + dx, 2.5, -3);
          add(new THREE.BoxGeometry(2.4, 0.2, 2), wood, x, 5, -3);
          add(new THREE.ConeGeometry(1.7, 1.2, 4), wood, x, 5.9, -3).rotation.y = Math.PI / 4;
        }
        break;
      case 'abbey':
        for (let x = 1; x < W; x += 4) {
          for (const dx of [-1.3, 1.3]) add(new THREE.BoxGeometry(0.5, 4.2, 0.5), stone, x + dx, 2.1, -1.5);
          add(new THREE.BoxGeometry(3.2, 0.4, 0.6), stone, x, 4.3, -1.5);
          add(new THREE.ConeGeometry(1.5, 1.6, 4), stone, x, 5.3, -1.5).rotation.y = Math.PI / 4; // 尖拱
          if (rnd() < 0.7) {
            const tx = x + (rnd() - 0.5) * 2;
            add(new THREE.BoxGeometry(0.5, 0.8, 0.14), stone, tx, 0.4, -0.5 - rnd() * 0.4).rotation.z = (rnd() - 0.5) * 0.3; // 墓碑
            add(new THREE.BoxGeometry(0.06, 0.2, 0.06), glow, tx + 0.4, 0.1, -0.4);                                        // 蜡烛
          }
        }
        break;
      case 'mine':
        for (let x = 2; x < W; x += 5) {
          for (const dx of [-1.6, 1.6]) add(new THREE.BoxGeometry(0.25, 4.6, 0.25), wood, x + dx, 2.3, -1.2);
          add(new THREE.BoxGeometry(3.8, 0.28, 0.3), wood, x, 4.6, -1.2);
          add(new THREE.BoxGeometry(0.2, 2.2, 0.2), wood, x - 0.9, 3.7, -1.2).rotation.z = 0.8; // 斜撑
          // 从顶上垂下来的发光根须
          const root = add(new THREE.CylinderGeometry(0.05, 0.14, 3 + rnd() * 2.5, 5), glow, x + 2.4, 5.5, -2 - rnd() * 2);
          root.rotation.z = (rnd() - 0.5) * 0.6;
          if (rnd() < 0.5) { const l = new THREE.PointLight(pal.fire, 4, 8, 1.8); l.position.set(x + 2.4, 3, -1.5); this.stage.add(l); }
        }
        for (const z of [-0.35, -0.75]) add(new THREE.BoxGeometry(W + 8, 0.06, 0.07), stone, W / 2, 0.06, z); // 铁轨
        for (let x = 0; x < W; x += 0.9) add(new THREE.BoxGeometry(0.16, 0.04, 0.7), wood, x, 0.03, -0.55);    // 枕木
        break;
      case 'city':
        for (let x = -2; x < W + 4; x += 4 + rnd() * 3) {
          const h = 9 + rnd() * 10, w = 2 + rnd() * 2, z = -6 - rnd() * 9;
          add(new THREE.BoxGeometry(w, h, 2), dark, x, h / 2, z);
          add(new THREE.ConeGeometry(w * 0.75, 2.5, 4), dark, x, h + 1.2, z).rotation.y = Math.PI / 4;
          // 零星亮着的窗
          for (let k = 0; k < 5; k++) add(new THREE.PlaneGeometry(0.22, 0.4), glow, x + (rnd() - 0.5) * w * 0.7, 2 + rnd() * (h - 3), z + 1.01);
        }
        for (let x = 5; x < W; x += 9) {
          add(new THREE.BoxGeometry(1, 1.2, 1), stone, x, 0.6, -1.5);     // 石像底座
          add(new THREE.BoxGeometry(0.5, 1.5, 0.35), stone, x, 1.95, -1.5); // 身体
          add(new THREE.BoxGeometry(0.3, 0.3, 0.3), stone, x, 2.9, -1.5);   // 头
        }
        break;
      case 'abyss': {
        for (let x = -4; x < W + 6; x += 2.5 + rnd() * 3) {
          const h = 3 + rnd() * 7;
          add(new THREE.ConeGeometry(0.8 + rnd() * 1.2, h, 5), dark, x, 13 - h / 2, -4 - rnd() * 9).rotation.z = Math.PI; // 倒悬的尖塔
        }
        // 地面上的余烬裂缝(贴在路面后沿与远处)
        for (let i = 0; i < W * 0.8; i++) {
          const c = add(new THREE.PlaneGeometry(0.5 + rnd() * 1.4, 0.05), glow, rnd() * W, 0.02, -0.3 - rnd() * 5);
          c.rotation.x = -Math.PI / 2; c.rotation.z = rnd() * Math.PI;
        }
        add(new THREE.SphereGeometry(5, 16, 12), new THREE.MeshBasicMaterial({ color: '#ff5a1f', fog: false }), W / 2, 9, -40); // 余烬之日
        break;
      }
    }
  }

  /** 生成一个火花:在指定位置放个发光小方块,逐渐放大并淡出。 */
  private spark(x: number, y: number, z: number, color: string, size: number, life: number, grow: number) {
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(size), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    mesh.position.set(x, y, z + 0.3); mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    this.scene.add(mesh);
    this.sparks.push({ mesh, life, max: life, grow });
  }

  /**
   * 冲击环:一个迅速扩大并淡出的圆环。
   * @param flat true 表示平贴在地上(尘浪),否则竖着面向镜头(冲击波)
   */
  private ring(x: number, y: number, z: number, color: string, size: number, life: number, grow: number, flat = false) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(size * 0.7, size, 28), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    mesh.position.set(x, y, z + (flat ? 0 : 0.3));
    if (flat) mesh.rotation.x = -Math.PI / 2;
    this.scene.add(mesh);
    this.sparks.push({ mesh, life, max: life, grow });
  }

  /**
   * 刀光 / 拳风:出招瞬间在角色身前画一道弧线,迅速放大并淡出。
   * 弧线大小取自招式判定框的长度,所以长枪的刀光比拳头的大。
   */
  private slash(w: World, id: number, heavy: boolean) {
    const f = w.fighters.find(x => x.id === id);
    const m = f?.move;
    if (!f || !m) return;
    const reach = Math.max(0.6, Math.min(2.8, m.hitbox.x1));
    const midY = f.y + (m.hitbox.y0 + m.hitbox.y1) / 2;
    // 半个圆环,开口朝向角色;上挑类招式竖着画
    const vertical = m.anim === 'upper' || m.anim === 'overhead' || m.anim === 'slam';
    const geo = new THREE.RingGeometry(reach * 0.55, reach * 0.72, 16, 1, -Math.PI / 2.4, Math.PI / 1.2);
    const color = f.def.look.glow ?? (f.team === 0 ? '#fff1c9' : '#ff8a5a');
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: heavy ? 0.9 : 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    mesh.position.set(f.x + f.facing * reach * 0.25, midY, f.z + 0.2);
    mesh.scale.x = f.facing;
    if (vertical) mesh.rotation.z = f.facing * 0.9;
    this.scene.add(mesh);
    this.sparks.push({ mesh, life: heavy ? 0.16 : 0.11, max: heavy ? 0.16 : 0.11, grow: 0.25 });
  }

  /**
   * 把模拟层这一帧的事件变成画面反馈:火花、震屏、镜头冲击、尘土。
   * @param w 传入世界以便查到角色位置(落地尘土用);不传则跳过需要位置的效果
   */
  handleEvents(events: SimEvent[], w?: World) {
    for (const e of events) {
      if (e.type === 'hit') {
        // 火花颜色跟随攻击者(各角色的招式有自己的色调);重击再加一圈冲击波
        const tint = w?.fighters.find(x => x.id === e.attacker)?.def.look.glow ?? '#ff5a1f';
        this.spark(e.x, e.y, e.z, e.heavy ? '#ffb347' : '#fff1c9', e.heavy ? 0.32 : 0.2, 0.18, e.heavy ? 7 : 5);
        this.spark(e.x, e.y, e.z, tint, 0.12, 0.3, 9);
        if (e.heavy) this.ring(e.x, e.y, e.z, tint, 0.25, 0.2, 7);
        if (e.combo >= 5) for (let i = 0; i < Math.min(4, e.combo / 5); i++) this.spark(e.x + (Math.random() - 0.5) * 0.8, e.y + (Math.random() - 0.5) * 0.8, e.z, '#ffe9c0', 0.07, 0.3, 6);
        this.shake = Math.max(this.shake, e.heavy ? 0.16 : 0.06);
        if (e.heavy) this.punch = Math.max(this.punch, 0.5);
        this.rigs.get(e.victim)?.hitFlash();
      } else if (e.type === 'ko') { this.shake = Math.max(this.shake, 0.28); this.punch = 1; }
      else if (e.type === 'comboBreak') this.shake = Math.max(this.shake, 0.2);
      else if (e.type === 'whiff' && w) this.slash(w, e.id, e.heavy);
      else if (e.type === 'block') {
        // 格挡:蓝白色的小火花
        this.spark(e.x, e.y, e.z, '#9fd0ff', 0.16, 0.16, 4);
        this.shake = Math.max(this.shake, 0.05);
      } else if (e.type === 'parry') {
        // 弹反:一圈白光迅速扩散 + 强震屏
        this.ring(e.x, e.y, e.z, '#ffffff', 0.3, 0.28, 9);
        this.spark(e.x, e.y, e.z, '#bfe4ff', 0.3, 0.2, 6);
        this.shake = Math.max(this.shake, 0.22); this.punch = 0.8;
      } else if (e.type === 'guardBreak' && w) {
        const f = w.fighters.find(x => x.id === e.id);
        if (f) { for (let i = 0; i < 6; i++) this.spark(f.x + (Math.random() - 0.5) * 0.9, f.y + 0.6 + Math.random() * 1.1, f.z, '#9fd0ff', 0.12, 0.45, 5); this.ring(f.x, f.y + 1, f.z, '#9fd0ff', 0.4, 0.3, 6); }
        this.shake = Math.max(this.shake, 0.25);
      } else if (e.type === 'chargeRelease' && w) {
        const f = w.fighters.find(x => x.id === e.id);
        if (f) this.ring(f.x + f.facing * 0.6, f.y + 1, f.z, '#ffd27a', 0.3 + e.level * 0.4, 0.25, 6 + e.level * 5);
        this.shake = Math.max(this.shake, 0.1 + e.level * 0.2);
      } else if (e.type === 'groundBounce') {
        // 砸地:贴地的尘浪 + 碎屑
        this.ring(e.x, 0.06, e.z, '#b9b4ad', 0.5, 0.4, 5, true);
        for (let i = -2; i <= 2; i++) this.spark(e.x + i * 0.3, 0.2 + Math.random() * 0.4, e.z, '#8a8490', 0.14, 0.45, 4);
        this.shake = Math.max(this.shake, 0.2); this.punch = Math.max(this.punch, 0.6);
      } else if (e.type === 'super' && w) {
        const f = w.fighters.find(x => x.id === e.id);
        if (f) { this.ring(f.x, f.y + 1, f.z, f.def.look.glow ?? '#ff6a2a', 0.5, 0.5, 12); this.ring(f.x, 0.06, f.z, '#ffd27a', 0.6, 0.6, 8, true); }
        this.shake = Math.max(this.shake, 0.3);
      }
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

  /**
   * 给一个角色「拍照」,返回 PNG 图片(data URL)。用来把程序绘制的模型导出成头像 / 立绘占位图。
   * @param kind portrait 半身头像(带暗色背景) / full 全身立绘(透明背景)
   * @param size 输出的宽高(像素)
   */
  snapshot(w: World, fighterId: number, kind: 'portrait' | 'full', size: { w: number; h: number }): string {
    const f = w.fighters.find(x => x.id === fighterId);
    if (!f) return '';
    const canvas = this.renderer.domElement;
    const old = { w: canvas.width, h: canvas.height, bg: this.scene.background, fog: this.scene.fog, ratio: this.renderer.getPixelRatio() };
    // 先正常渲染几帧,让角色的姿势过渡到位
    for (let i = 0; i < 12; i++) this.render(w, fighterId, 1 / 30);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(size.w, size.h, false);
    this.camera.aspect = size.w / size.h;
    this.camera.updateProjectionMatrix();
    this.stage.visible = false;
    for (const [id, rig] of this.rigs) { rig.root.visible = id === fighterId; rig.shadow.visible = false; }
    this.scene.fog = null;
    const h = 1.8 * f.def.look.scale;
    if (kind === 'portrait') {
      this.scene.background = new THREE.Color('#15131c');
      this.camera.position.set(f.x + 1.5, f.y + h * 0.92, f.z + 1.7);
      this.camera.lookAt(f.x + 0.05, f.y + h * 0.83, f.z);
    } else {
      this.scene.background = null;
      this.renderer.setClearColor(0x000000, 0);
      // 距离按身高算:让角色大约占满画面高度的八成
      const d = h * 1.82;
      this.camera.position.set(f.x + d * 0.42, f.y + h * 0.58, f.z + d * 0.9);
      this.camera.lookAt(f.x + 0.12, f.y + h * 0.5, f.z);
    }
    this.renderer.render(this.scene, this.camera);
    const url = canvas.toDataURL('image/png');
    // 恢复现场
    this.scene.background = old.bg; this.scene.fog = old.fog;
    this.stage.visible = true;
    for (const rig of this.rigs.values()) rig.shadow.visible = true;
    this.renderer.setPixelRatio(old.ratio);
    this.resize(canvas.clientWidth, canvas.clientHeight);
    return url;
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
  /**
   * 画一帧。
   * @param focusId  镜头跟随的角色
   * @param focusId2 第二个要照顾的角色(双人合作);两人都在时镜头对准中点
   */
  render(w: World, focusId: number, dt: number, focusId2?: number) {
    this.time += dt;
    const seen = new Set<number>();
    let focusX = this.camX, sum = 0, cnt = 0;
    for (const f of w.fighters) {
      seen.add(f.id);
      let rig = this.rigs.get(f.id);
      if (!rig) {
        // 有战斗贴图就用贴图人,否则用程序绘制的方块人
        rig = f.def.role === 'prop' ? new PropRig(f.def)
          : hasSprites(f.def.id) ? new SpriteRig(f.def.id, f.def.look) : new Rig(f.def.look);
        this.rigs.set(f.id, rig);
        this.scene.add(rig.root, rig.shadow);
      }
      rig.update(f, this.time, dt);
      // 残影:冲刺、闪避、带突进的招式、蓄力满时,每隔几帧在身后留一个淡出的影子
      const fast = f.state === 'run' || f.state === 'dodge' || (f.state === 'attack' && ((f.move?.moveX ?? 0) >= 0.1 || (f.move?.tier ?? 0) >= 4));
      if (fast && rig.ghost && w.frame % 3 === 0 && w.frame !== this.lastGhostFrame.get(f.id)) {
        this.lastGhostFrame.set(f.id, w.frame);
        const g = rig.ghost(f.def.look.glow ?? (f.team === 0 ? '#9fc4ff' : '#ff8a5a'));
        if (g) { this.scene.add(g); this.sparks.push({ mesh: g, life: 0.22, max: 0.22, grow: 0 }); }
      }
      // 蓄力中:脚下聚起一圈光
      if (f.charge > 4 && w.frame % 6 === 0) this.ring(f.x, 0.05, f.z, '#ffd27a', 0.9 - (f.charge / 45) * 0.5, 0.25, -0.4, true);
      if ((f.id === focusId || f.id === focusId2) && f.state !== 'dead') { sum += f.x; cnt++; }
    }
    if (cnt) focusX = sum / cnt; // 跟随的角色都倒下时,镜头停在原地
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

    // 喷火口:平时是暗红色光圈;快喷发时越闪越亮;喷发时冒出火柱
    for (const h of w.hazards) {
      let m = this.hazardMeshes.get(h.id);
      if (!m) {
        m = new THREE.Mesh(new THREE.RingGeometry(h.radius * 0.55, h.radius, 24), new THREE.MeshBasicMaterial({ color: '#ff4a1a', transparent: true, depthWrite: false, side: THREE.DoubleSide }));
        m.rotation.x = -Math.PI / 2; m.scale.y = 1 / 1.4; // 纵深方向压扁,与判定范围一致
        m.position.set(h.x, 0.03, h.z);
        this.hazardMeshes.set(h.id, m); this.stage.add(m);
      }
      const st = hazardState(w, h);
      const warn = st.untilBurst <= 70 ? 1 - st.untilBurst / 70 : 0;
      (m.material as THREE.MeshBasicMaterial).opacity = st.active ? 1 : 0.18 + warn * (0.4 + 0.4 * Math.sin(this.time * (10 + warn * 30)));
      if (st.active && Math.random() < 0.9) {
        const a = Math.random() * 6.28, r = Math.random() * h.radius * 0.8;
        this.spark(h.x + Math.cos(a) * r, 0.3 + Math.random() * 1.6, h.z + Math.sin(a) * r / 1.4 - 0.3, Math.random() < 0.5 ? '#ff6a2a' : '#ffd27a', 0.14, 0.3, 2.2);
      }
    }

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
      // 保留水平翻转的方向(刀光朝左时 scale.x 为负)
      const v = 1 + k * s.grow, sx = s.mesh.scale.x < 0 ? -1 : 1;
      s.mesh.scale.set(sx * v, v, v);
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
