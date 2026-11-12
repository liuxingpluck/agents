// Three.js 渲染层:只读模拟状态,不影响逻辑。
import * as THREE from 'three';
import { World } from '../sim/world';
import { RoomDef, SimEvent } from '../sim/types';
import { Rig } from './rig';

interface Spark { mesh: THREE.Mesh; life: number; max: number; grow: number }

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  private rigs = new Map<number, Rig>();
  private projMeshes = new Map<number, THREE.Mesh>();
  private sparks: Spark[] = [];
  private embers!: THREE.Points;
  private emberVel!: Float32Array;
  private shake = 0;
  private camX = 0;
  private time = 0;
  private room!: RoomDef;
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
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const W = room.width, D = room.depth;

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W + 40, D + 30), new THREE.MeshStandardMaterial({ color: '#25232c', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(W / 2, 0, D / 2);
    this.stage.add(ground);
    // 可行走区域的石板路
    const road = new THREE.Mesh(new THREE.PlaneGeometry(W + 4, D + 0.8), new THREE.MeshStandardMaterial({ color: '#3b3844', roughness: 0.95 }));
    road.rotation.x = -Math.PI / 2; road.position.set(W / 2, 0.01, D / 2);
    this.stage.add(road);
    const slabMat = new THREE.MeshStandardMaterial({ color: '#474350', roughness: 0.9 });
    for (let i = 0; i < W * 1.4; i++) {
      const sl = new THREE.Mesh(new THREE.PlaneGeometry(0.6 + rnd() * 1.2, 0.4 + rnd() * 0.7), slabMat);
      sl.rotation.x = -Math.PI / 2; sl.position.set(rnd() * W, 0.015, rnd() * D);
      this.stage.add(sl);
    }
    // 远景:残墙、石柱、枯树
    const stone = new THREE.MeshStandardMaterial({ color: '#23222b', roughness: 1, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: '#131218', roughness: 1, flatShading: true });
    for (let x = -4; x < W + 6; x += 2.4 + rnd() * 2.5) {
      const h = 1.2 + rnd() * 2.6;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(1.6 + rnd() * 1.6, h, 0.8), stone);
      wall.position.set(x, h / 2, -1.6 - rnd() * 1.2); wall.rotation.z = (rnd() - 0.5) * 0.08;
      this.stage.add(wall);
      if (rnd() < 0.45) {
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
        const fire = new THREE.PointLight('#ff5a1f', 6, 9, 1.8);
        fire.position.set(x, 1.1, -0.6);
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.18, 0.9, 6), stone); bowl.position.set(x, 0.45, -0.6);
        const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshBasicMaterial({ color: '#ff7a2a' })); flame.position.set(x, 1.1, -0.6);
        this.stage.add(fire, bowl, flame);
      }
    }
    // 近景剪影
    for (let x = -2; x < W + 4; x += 5 + rnd() * 6) {
      const fg = new THREE.Mesh(new THREE.BoxGeometry(0.8 + rnd(), 0.6 + rnd() * 1.4, 0.8), dark);
      fg.position.set(x, fg.geometry.parameters.height / 2, D + 1.6 + rnd());
      this.stage.add(fg);
    }
    // 灰雪 / 余烬粒子
    const N = 500;
    const pos = new Float32Array(N * 3); this.emberVel = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = rnd() * (W + 20) - 10; pos[i * 3 + 1] = rnd() * 9; pos[i * 3 + 2] = rnd() * 16 - 8;
      this.emberVel[i] = 0.3 + rnd() * 0.7;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.embers = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#b9b4ad', size: 0.07, transparent: true, opacity: 0.7 }));
    this.stage.add(this.embers);
    this.camX = 5;
  }

  private spark(x: number, y: number, z: number, color: string, size: number, life: number, grow: number) {
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(size), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    mesh.position.set(x, y, z + 0.3); mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    this.scene.add(mesh);
    this.sparks.push({ mesh, life, max: life, grow });
  }

  handleEvents(events: SimEvent[]) {
    for (const e of events) {
      if (e.type === 'hit') {
        this.spark(e.x, e.y, e.z, e.heavy ? '#ffb347' : '#fff1c9', e.heavy ? 0.32 : 0.2, 0.18, e.heavy ? 7 : 5);
        this.spark(e.x, e.y, e.z, '#ff5a1f', 0.12, 0.3, 9);
        this.shake = Math.max(this.shake, e.heavy ? 0.16 : 0.06);
        this.rigs.get(e.victim)?.hitFlash();
      } else if (e.type === 'ko') this.shake = Math.max(this.shake, 0.28);
      else if (e.type === 'comboBreak') this.shake = Math.max(this.shake, 0.2);
    }
  }

  render(w: World, focusId: number, dt: number) {
    this.time += dt;
    const seen = new Set<number>();
    let focusX = this.camX;
    for (const f of w.fighters) {
      seen.add(f.id);
      let rig = this.rigs.get(f.id);
      if (!rig) {
        rig = new Rig(f.def.look);
        this.rigs.set(f.id, rig);
        this.scene.add(rig.root, rig.shadow);
      }
      rig.update(f, this.time, dt);
      if (f.id === focusId) focusX = f.x;
    }
    for (const [id, rig] of this.rigs) if (!seen.has(id)) { this.scene.remove(rig.root, rig.shadow); this.rigs.delete(id); }

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

    for (const s of this.sparks) {
      s.life -= dt;
      const k = 1 - s.life / s.max;
      s.mesh.scale.setScalar(1 + k * s.grow);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k);
    }
    this.sparks = this.sparks.filter(s => { if (s.life <= 0) { this.scene.remove(s.mesh); s.mesh.geometry.dispose(); return false; } return true; });

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
    this.camera.position.set(this.camX + sx, 3.9 + sy, D + 9.2);
    this.camera.lookAt(this.camX + sx, 1.3, D / 2 - 0.6);
    this.renderer.render(this.scene, this.camera);
  }
}
