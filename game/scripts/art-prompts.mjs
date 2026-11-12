// 生成美术提示词清单 art/prompts.json。
// 用法:node scripts/art-prompts.mjs
// 修改角色外观描述后重新运行即可;图片生成方(另一个 AI)只需要读 art/prompts.json 与 docs/ART-GUIDE.md。
import { writeFileSync } from 'node:fs';

/** 全局画风:所有图片的提示词都以它开头,保证风格统一 */
const STYLE = 'dark fantasy action game art, anime-influenced semi-realistic illustration, crisp cel shading with painterly highlights, ' +
  'muted ash-grey and charcoal palette with glowing ember-orange accents, falling ash snow, dramatic rim lighting, high detail, clean readable silhouette';
/** 所有图片通用的反向提示词 */
const NEGATIVE = 'text, watermark, logo, signature, frame, border, blurry, low quality, extra limbs, deformed hands, nudity, nsfw, child, childlike';

/**
 * 可选角色。look 是固定的外观描述,同一角色的所有图片都要原样带上它,以保持形象一致。
 * 女性角色:成年、高挑、长腿、丝袜,性感但不暴露;男性角色:冷峻、帅气或沉稳。
 */
const HEROES = [
  { id: 'kael', name: '凯尔', look: 'Kael, a handsome stoic knight in his late twenties, short swept-back dark hair, sharp calm grey eyes, light stubble, blue-grey steel plate armor over dark chainmail, tattered crimson cape, longsword in right hand and kite shield on left arm, composed and resolute expression' },
  { id: 'brynn', name: '布琳', look: 'Brynn, a tall beautiful adult woman in her late twenties with an athletic figure and long legs, long golden braid over one shoulder, confident blue eyes, polished steel breastplate and pauldrons with navy-blue cloth, short armored battle skirt, black thigh-high stockings under steel greaves, huge tower shield and war hammer, proud protective stance' },
  { id: 'sera', name: '塞拉', look: 'Sera, a stunning adult woman in her mid twenties, tall and slender with very long legs, long flowing crimson hair, glowing amber eyes, elegant dark-red sorceress dress with a high side slit and gold embroidery, black lace thigh-high stockings, high-heeled boots, ornate staff topped with a burning ember crystal, alluring confident smile' },
  { id: 'ilex', name: '伊莱', look: 'Ilex, a lean handsome young man in his mid twenties, ash-blond hair tied back, cold focused green eyes, dark forest-green hooded ranger cloak over fitted leather armor, quiver on back, elegant recurve longbow, calm and aloof expression' },
  { id: 'rook', name: '洛克', look: 'Rook, a rugged handsome prizefighter in his early thirties, muscular build, short messy white hair, scar across one eyebrow, cocky grin, open sleeveless dark-red jacket, bandage-wrapped fists and forearms, loose dark trousers and heavy boots, relaxed boxing stance' },
  { id: 'vesper', name: '薇丝', look: 'Vesper, a sleek beautiful adult woman in her mid twenties, tall with long slender legs, short asymmetric violet-black hair, sharp violet eyes, short hooded cloak, fitted dark leather bodice and high-waisted shorts, sheer black pantyhose, thigh-high leather boots, twin curved daggers, sly dangerous smirk' },
  { id: 'morgan', name: '莫甘', look: 'Morgan, a pale hauntingly beautiful adult woman in her late twenties, tall and graceful with long legs, very long straight black hair, half-lidded teal eyes, gothic black and dark-green dress with layered lace and a high front slit, dark patterned lace thigh-high stockings, heeled ankle boots, bone staff with a ghostly green lantern, cold aloof expression' },
  { id: 'odran', name: '奥丁', look: 'Odran, a towering fierce warrior in his late thirties, massive muscular build, braided red beard and wild red hair, horned iron helm, wolf-fur mantle over scarred bare arms, leather war kilt, enormous two-handed great axe, battle-hungry glare' },
  { id: 'li', name: '璃', look: 'Li, an elegant beautiful adult East-Asian woman in her mid twenties, tall with long toned legs, black hair in a high ponytail with a teal ribbon, calm dark eyes, white and teal qipao-style martial dress with high side slits and silver trim, white thigh-high stockings, flat martial shoes, long white-shafted spear with a silver blade, poised graceful stance' },
  { id: 'nola', name: '诺拉', look: 'Nola, a gentle radiant adult woman in her mid twenties, tall with long legs, long wavy platinum-blonde hair, soft golden eyes, white and gold priestess dress with a short front hem and long back train, white thigh-high stockings with gold trim, white heeled boots, golden ceremonial mace, faint halo of light, serene kind smile' },
];

/** 普通敌人 */
const ENEMIES = [
  { id: 'husk', look: 'a Husk, a gaunt hooded humanoid whose memories were burned away, grey ashen skin, tattered dark robes, glowing orange cracks across the body, burning ember claws, hollow glowing eyes' },
  { id: 'brute', look: 'an Ash Brute, a hulking undead soldier in rusted heavy plate armor with ember light leaking from the joints, horned helmet, dragging a massive war hammer' },
  { id: 'emberbow', look: 'an Ember Archer, a thin ashen undead archer in a ragged hooded cloak, drawing a charred bow with a burning arrow' },
  { id: 'hound', look: 'an Ash-snow Hound, a lean skeletal wolf with charcoal fur, glowing ember eyes and smoldering jaws' },
  { id: 'monk', look: 'a Weeping-bone Monk, an emaciated monk with names carved into exposed bone, torn grey habit, fast bare-handed fighter, pale bone-white glow' },
  { id: 'chanter', look: 'a Chanter, a robed undead priest holding a glowing open tome, pages swirling around, sickly green-white light' },
  { id: 'miner', look: 'a Root Miner, a broad hunched undead miner in a cracked lantern helmet and leather apron, heavy pickaxe, amber glow' },
  { id: 'crawler', look: 'a Root Crawler, a small fast creature made of tangled glowing ember roots with too many limbs' },
  { id: 'kingsguard', look: 'a Kingless Guard, a tall royal soldier in ornate tarnished silver-blue armor with a tower shield and long spear, empty helmet filled with blue-white flame' },
  { id: 'shade', look: 'a Shade, a slender shadowy assassin silhouette with trailing smoke, violet glowing eyes, thin twin blades' },
  { id: 'ashling', look: 'an Ashling, a bloated humanoid of molten ash and cracked glowing skin, about to burst with fire' },
  { id: 'skeleton', look: 'a summoned Skeleton warrior with a rusty sword, bones bound by ghostly green light' },
];

/** Boss */
const BOSSES = [
  { id: 'gareth', look: 'Gareth the Nameless Knight-Captain, a huge imposing knight in battered black-and-crimson plate armor, torn banner cape, great kite shield and broad sword, helmet visor glowing ember-orange' },
  { id: 'bishop', look: 'the Bishop of a Thousand Pages, a tall gaunt archbishop in decaying white-gold vestments, tall mitre, face hidden by floating written pages, hundreds of glowing pages orbiting him, long crozier staff' },
  { id: 'colossus', look: 'the Gravedigger Colossus, a gigantic stone-and-iron golem covered in mining scaffolds and roots, molten amber core in its chest, fists like boulders' },
  { id: 'queenshade', look: 'the Shade of the Fire-keeper Queen, a tall regal adult woman made of living flame and shadow, elegant long burning gown, crown of embers, long legs visible through the flame-like slit of the gown, graceful and sorrowful' },
  { id: 'nameless', look: 'the Nameless One, the heart of the Ashen Abyss, a colossal shifting humanoid of black ash and white-hot embers with countless faint faces drifting across its body, no face of its own' },
];

/** 场景主题(与 src/data/chapters.ts 的 theme 对应) */
const THEMES = [
  { id: 'ashsnow', look: 'abandoned frontier outpost on a frozen plain at night, broken watchtowers and palisades, burning braziers, falling ash snow' },
  { id: 'abbey', look: 'ruined gothic abbey cloister at night, rows of bone-carved pillars, graves, candle light, pale green mist' },
  { id: 'mine', look: 'vast underground mine shaft, wooden scaffolds and rails, giant glowing ember roots growing through the rock, amber light' },
  { id: 'city', look: 'empty ruined royal capital at night, grand avenue with bell towers and statues, blue-violet moonlight, distant empty throne palace' },
  { id: 'abyss', look: 'the heart of the abyss, an inverted burning city hanging above a sea of embers, black stone and white-hot cracks, red-black sky' },
];

/** 主角的战斗姿势(每个姿势一张图) */
const HERO_POSES = {
  idle: 'standing in a ready combat stance', walk1: 'mid-stride walking forward, left leg forward', walk2: 'mid-stride walking forward, right leg forward',
  light: 'performing a quick light attack, arm or weapon extended forward', heavy: 'performing a powerful heavy overhead attack, full body committed',
  special: 'unleashing a signature special technique with glowing ember energy', jump: 'in mid-air jump, legs tucked',
  hurt: 'recoiling backward from being hit, pained expression', down: 'lying knocked down on the ground',
};
const ENEMY_POSES = { idle: HERO_POSES.idle, walk1: HERO_POSES.walk1, attack: 'lunging forward in a wide attack', hurt: HERO_POSES.hurt, down: HERO_POSES.down };

const SPRITE_RULES = 'full body, side view facing right, single character, centered, feet touching the bottom edge area, plain transparent background, no ground shadow, consistent proportions, game sprite';
const out = [];
/** 往清单里加一张图 */
const add = (priority, path, width, height, transparent, prompt, note) =>
  out.push({ priority, path: `public/art/${path}`, width, height, transparent, prompt: `${STYLE}. ${prompt}`, negative: NEGATIVE, note });

add(0, 'ui/title.png', 1920, 1080, false,
  'epic key art: ten heroes seen from behind as small silhouettes walking through ash snow toward a distant ruined capital with a pillar of ember light rising into a black sky, wide cinematic composition, empty space in the upper center for a title',
  '标题画面背景');

for (const h of HEROES) {
  add(0, `portraits/${h.id}.png`, 512, 512, false, `${h.look}. Head-and-shoulders portrait, three-quarter view, dark vignette background with drifting embers`, `${h.name} 头像(选人卡片、HUD)`);
  add(0, `full/${h.id}.png`, 1024, 1536, true, `${h.look}. Full-body character illustration from head to toe, standing pose showing the whole outfit and weapon, legs fully visible, plain transparent background`, `${h.name} 全身立绘(选人界面、剧情)`);
}
for (const t of THEMES) {
  add(0, `bg/${t.id}/far.png`, 2048, 1024, false, `${t.look}. Wide side-scrolling game background, distant scenery only, horizon in the lower third, no characters, seamless horizontally tileable left and right edges`, '远景(可横向平铺)');
  add(0, `bg/${t.id}/ground.png`, 1024, 1024, false, `${t.look}. Top-down seamless tileable ground texture of the walkable floor only, flat even lighting, no objects, no perspective`, '地面贴图(四方连续)');
}
for (const b of BOSSES) {
  add(1, `portraits/${b.id}.png`, 512, 512, false, `${b.look}. Menacing bust portrait, dark vignette background`, 'Boss 头像');
}
for (const h of HEROES) for (const [pose, desc] of Object.entries(HERO_POSES)) {
  add(1, `sprites/${h.id}/${pose}.png`, 512, 512, true, `${h.look}. ${desc}. ${SPRITE_RULES}`, `${h.name} 战斗姿势:${pose}`);
}
for (const e of [...BOSSES, ...ENEMIES]) for (const [pose, desc] of Object.entries(ENEMY_POSES)) {
  add(2, `sprites/${e.id}/${pose}.png`, 512, 512, true, `${e.look}. ${desc}. ${SPRITE_RULES}`, `敌人战斗姿势:${pose}`);
}

writeFileSync(new URL('../art/prompts.json', import.meta.url), JSON.stringify({ style: STYLE, negative: NEGATIVE, images: out }, null, 2));
console.log(`写入 art/prompts.json:共 ${out.length} 张(P0 ${out.filter(i => i.priority === 0).length} / P1 ${out.filter(i => i.priority === 1).length} / P2 ${out.filter(i => i.priority === 2).length})`);
