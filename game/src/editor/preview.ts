// 实时预览:一个 GameRenderer 画布,可以用键盘试玩正在编辑的角色(对训练木桩)或整个房间。
// 世界在定义变化后整体重建;渲染与模拟循环沿用 train.ts 的固定 60Hz 步进写法。
import { CharacterDef, Fighter, RoomDef } from '../sim/types';
import { ROSTER } from '../data/characters';
import { makeScriptAI } from '../sim/ai/script';
import { createWorld, spawnFighter, step, World } from '../sim/world';
import { GameRenderer } from '../render/renderer';
import { InputManager } from '../ui/input';

/** 角色预览用的小场地 */
const DUMMY_ROOM: RoomDef = { id: 'preview', name: '预览场', width: 20, depth: 4, theme: 'arena', waves: [] };

/** 训练木桩:烬骸重卒,生命值巨大,永远不会倒下 */
function makeDummy(): CharacterDef {
  const b = ROSTER.brute;
  return { ...b, id: 'brute', stats: { ...b.stats, hp: 1_000_000 } };
}

export class Preview {
  private gfx: GameRenderer;
  private input = new InputManager();
  private world!: World;
  private player: Fighter | null = null;
  private heroDef: CharacterDef | null = null;
  private mode: 'char' | 'room' = 'char';
  private room: RoomDef = DUMMY_ROOM;
  private roster: Record<string, CharacterDef> = ROSTER;
  private last = performance.now();
  private acc = 0;
  private deadTimer = 0;
  /** 是否保持能量满(方便测试技能与奥义) */
  infiniteEnergy = true;

  /**
   * @param canvas 渲染画布
   * @param info 左上角的文字信息层
   */
  constructor(private canvas: HTMLCanvasElement, private info: HTMLElement) {
    this.gfx = new GameRenderer(canvas);
    // 在表单控件里打字时,屏蔽游戏的按键绑定(否则 W/J/K 等会被 preventDefault,无法输入)。
    // 捕获阶段先于 InputManager 的监听器执行,stopImmediatePropagation 让它看不到这些事件。
    const guard = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', guard, true);
    window.addEventListener('keyup', guard, true);
    // 点击画面 = 获得键盘焦点(并让表单控件失焦)
    canvas.tabIndex = 0;
    canvas.addEventListener('pointerdown', () => { (document.activeElement as HTMLElement | null)?.blur?.(); canvas.focus(); });
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    this.build();
    requestAnimationFrame(t => this.loop(t));
  }

  /** 画布尺寸变化时同步渲染器 */
  private resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w > 0 && h > 0) this.gfx.resize(w, h);
  }

  /** 设置模拟用的角色表(内置 + 自制);不会立即重建世界 */
  setRoster(r: Record<string, CharacterDef>) { this.roster = r; }

  /** 在小场地里试玩一个角色(对木桩)。def 会被深拷贝,之后对原对象的改动不影响当前预览 */
  showCharacter(def: CharacterDef) {
    this.mode = 'char';
    this.room = DUMMY_ROOM;
    this.heroDef = structuredClone(def);
    this.build();
  }

  /** 用指定主角试玩整个房间(按波次刷敌人) */
  playRoom(room: RoomDef, hero: CharacterDef) {
    this.mode = 'room';
    this.room = structuredClone(room);
    this.heroDef = structuredClone(hero);
    this.build();
  }

  /** 以当前设置重新开始 */
  restart() { this.build(); }

  /** 按当前模式重建世界与场景 */
  private build() {
    const hero = this.heroDef ?? this.roster.kael ?? Object.values(this.roster)[0];
    const roster = { ...this.roster, [hero.id]: hero };
    const w = createWorld(this.room, roster, (Date.now() & 0xffff) | 1);
    if (this.mode === 'char') {
      w.useWaves = false;
      spawnFighter(w, makeDummy(), 1, 11, this.room.depth / 2); // 无控制器 = 站桩
      this.player = spawnFighter(w, hero, 0, 7, this.room.depth / 2);
    } else {
      w.defaultEnemyAI = makeScriptAI(0.55);
      w.summonAI = makeScriptAI(0.8);
      this.player = spawnFighter(w, hero, 0, 4, this.room.depth / 2);
    }
    this.player.energy = hero.stats.energyMax;
    this.world = w;
    this.deadTimer = 0;
    this.gfx.buildRoom(this.room, 5);
  }

  /** 主循环:固定步长推进模拟,渲染,更新左上角信息 */
  private loop(now: number) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now; this.acc += dt;
    let n = 0;
    while (this.acc >= 1 / 60 && n < 4) {
      const p = this.player!;
      if (this.infiniteEnergy && p.state !== 'dead') p.energy = Math.max(p.energy, p.def.stats.energyMax);
      step(this.world, new Map([[p.id, this.input.read()]]));
      this.gfx.handleEvents(this.world.events);
      // 房间模式下主角倒下 1.5 秒后自动重来
      if (this.mode === 'room' && p.state === 'dead' && ++this.deadTimer > 90) this.build();
      this.acc -= 1 / 60; n++;
    }
    if (n === 4) this.acc = 0;
    this.gfx.render(this.world, this.player!.id, dt);
    this.showInfo();
    requestAnimationFrame(t => this.loop(t));
  }

  /** 左上角:当前角色、血量、模式提示 */
  private showInfo() {
    const p = this.player!, w = this.world;
    const hp = `${Math.max(0, Math.round((p.hp / p.def.stats.hp) * 100))}%`;
    let line2: string;
    if (this.mode === 'char') line2 = '对手:训练木桩(不会倒下)';
    else if (w.cleared && !w.fighters.some(f => f.team === 1 && f.hp > 0)) line2 = `房间「${this.room.name}」已清空!`;
    else line2 = `房间「${this.room.name}」· 第 ${Math.min(w.wave, this.room.waves.length)}/${this.room.waves.length} 波`;
    this.info.innerHTML = `<b>${esc(p.def.name || '未命名')}</b> 生命 ${hp} · 能量 ${Math.round(p.energy)}<br>${esc(line2)}`;
  }
}

/** 转义 HTML,避免角色名里的特殊字符破坏信息层 */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
