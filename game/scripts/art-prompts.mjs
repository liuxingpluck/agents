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

// =====================================================================================
// 第二批:让动作「连起来」。第一批每个主角只有 9 个姿势,连招每一下都是同一张图、跑步只有两帧。
// 这一批补上:跑步循环、连招第 2 / 3 下、蓄力、格挡、闪避、空中招式、抓取、被打飞、起身、更多技能姿势,
// 以及敌人的第二种攻击 / 行走帧、场景里的障碍物和掉落物。输出到 art/prompts-v2.json。
// =====================================================================================

/** 所有主角通用的新姿势 */
const HERO_POSES_V2 = {
  run1: 'sprinting forward at full speed, torso leaning far forward, front leg reaching forward about to land, rear leg stretched far behind, hair and cloth streaming back',
  run2: 'sprinting forward at full speed, torso leaning forward, front foot planted under the body with the knee bent, rear knee driving forward, compact pose',
  run3: 'sprinting forward at full speed, torso leaning far forward, the opposite leg now reaching forward about to land, other leg stretched far behind, hair and cloth streaming back',
  run4: 'sprinting forward at full speed, torso leaning forward, the opposite foot planted under the body with the knee bent, other knee driving forward, compact pose',
  guard: 'bracing in a firm defensive guard stance, knees bent, weapon or forearms raised in front of the body to block an incoming blow, eyes locked forward',
  dodge: 'evasive low forward dash roll, body curled low to the ground, moving fast, hair and cloth trailing',
  launched: 'knocked high into the air, body arched backward and nearly horizontal, limbs flung loose, face up, pained expression',
  getup: 'rising from the ground, one knee and one hand on the floor, head lifting, about to stand back up',
};

/**
 * 每个主角各自的招式姿势(和游戏里的实际招式对应)。
 * light2 / light3 = 轻攻击连段第 2、3 下;heavy2 / heavy3 = 重攻击连段第 2、3 下;charge = 蓄力时的蓄势;
 * airlight / airheavy = 空中轻 / 重攻击;grab = 抓取;command = 前冲指令技;special2 / special3 = 第 2、3 个技能;super = 终极技。
 */
const HERO_MOVES_V2 = {
  kael: {
    light2: 'punching straight forward with the kite shield, sword held back', light3: 'wide horizontal sword slash at chest height, body twisting',
    heavy2: 'rising diagonal sword cut from low to high, front foot stepping in', heavy3: 'two-handed overhead sword cleave crashing downward, cape whipping up',
    charge: 'crouched low with the sword drawn far back behind the body in both hands, gathering ember light along the blade', grab: 'reaching forward with the shield arm to seize an opponent by the collar, sword held back ready',
    airlight: 'in mid-air slashing the sword diagonally downward', airheavy: 'in mid-air plunging the sword straight down with both hands',
    command: 'low forward charge with the sword thrust out ahead and the shield tucked to the chest', special2: 'spinning whirlwind sword slash, cape flaring in a circle', special3: 'driving the sword point down into the ground with both hands, kneeling',
    super: 'sword raised straight up to the sky blazing with ember light, shield at his side, cape billowing, solemn oath pose',
  },
  brynn: {
    light2: 'short punch forward with the edge of the tower shield', light3: 'shoving the tower shield forward with her shoulder behind it',
    heavy2: 'horizontal war hammer swing at head height, body twisting', heavy3: 'slamming the war hammer straight down into the ground with both hands',
    charge: 'war hammer raised high behind her shoulder with both hands, knees bent, gathering ember light in the hammer head', grab: 'pinning forward with the tower shield while reaching over it with her free hand to seize an opponent',
    airlight: 'in mid-air swinging the war hammer downward one-handed', airheavy: 'in mid-air dropping with the war hammer held overhead in both hands',
    command: 'charging forward behind the tower shield, head lowered, hammer trailing', special2: 'pounding the ground with the hammer, kneeling', special3: 'spinning with the tower shield held out wide',
    super: 'planted behind the tower shield like an unbreakable wall, hammer resting on her shoulder, faint golden-ember aura, defiant shout',
  },
  sera: {
    light2: 'sweeping the staff horizontally in a low arc', light3: 'thrusting an open palm forward with a small burst of embers at the palm',
    heavy2: 'both hands thrust forward with the staff, a burst of flame at the staff tip', heavy3: 'swinging the staff upward, a rising tongue of flame following the tip',
    charge: 'staff held upright in both hands close to the chest, eyes closed, embers spiralling into the crystal', grab: 'lashing a whip of fire forward from her free hand, staff held back',
    airlight: 'in mid-air flicking a small spark downward from her fingertips', airheavy: 'in mid-air aiming the staff diagonally downward with a fireball forming at the tip',
    command: 'gliding backward in a burst of flame, dress and hair trailing forward', special2: 'hurling a long lance of ember light forward like a javelin', special3: 'staff planted on the ground, free hand sweeping low as flames rise along the floor',
    super: 'floating slightly off the ground with arms spread and staff raised, hair lifted by heat, singing, ring of embers around her',
  },
  ilex: {
    light2: 'backhand strike with the bow limb', light3: 'firing an arrow at point-blank range, bow held horizontally at the hip',
    heavy2: 'bow fully drawn with a heavy glowing arrow, leaning back into the shot', heavy3: 'firing upward at a steep angle, kneeling on one knee',
    charge: 'bow drawn to its limit and held, arrow tip glowing brighter, one eye closed, perfectly still', grab: 'casting a rope-tethered arrow forward with one hand, pulling the line taut',
    airlight: 'in mid-air shooting an arrow diagonally downward', airheavy: 'in mid-air upside-down tilt, firing straight down',
    command: 'leaping backward while loosing an arrow forward, cloak flaring', special2: 'drawing the bow with three arrows nocked at once', special3: 'aiming the bow straight up to the sky, arrow blazing',
    super: 'bow aimed to the sky releasing a blazing arrow, cloak and hair blown upward, calm merciless expression',
  },
  rook: {
    light2: 'tight lead hook punch, body rotating', light3: 'rapid body blows, both fists blurred close to the body',
    heavy2: 'brutal driving elbow strike stepping in', heavy3: 'spinning backfist with full shoulder rotation',
    charge: 'deep stance with the right fist cocked far back at the hip, left hand open in front, embers gathering around the cocked fist', grab: 'lunging in to clinch, both hands reaching to grab an opponent by the jacket',
    airlight: 'in mid-air throwing quick downward punches', airheavy: 'in mid-air diving heel-first kick diagonally downward',
    command: 'rising uppercut, leaping off the ground with the fist high overhead', special2: 'shoulder-and-back body check, slamming forward with his back and shoulder', special3: 'skyward leaping punch, body fully extended upward',
    super: 'storm of punches, many afterimage fists fanned out close in front of him, roaring',
  },
  vesper: {
    light2: 'reverse-grip dagger slash across the body', light3: 'both daggers crossing in an X slash',
    heavy2: 'low sweeping dagger cut at knee height, crouched on long legs', heavy3: 'spinning throat-height slash, cloak whirling',
    charge: 'coiled low like a spring, both daggers held reversed beside the hip, violet-ember glint on the blades', grab: 'slipping behind an opponent, one arm hooked forward as a choke hold, dagger ready in the other hand',
    airlight: 'in mid-air slashing with both daggers in a scissor motion', airheavy: 'in mid-air diving head-first with both daggers pointed down',
    command: 'dashing through low with one dagger extended forward and the other trailing, afterimage smear', special2: 'reappearing mid-step with a backstab thrust, cloak dissolving into shadow at the edges', special3: 'single precise finishing thrust, arm fully extended, perfectly still',
    super: 'whirling dance of blades, several faint shadow afterimages of herself close around her body',
  },
  morgan: {
    light2: 'upward flick of the bone staff', light3: 'pushing an open hand forward, wisps of ghostly green light at the palm',
    heavy2: 'heavy two-handed overhead staff smash', heavy3: 'driving the butt of the staff into the ground, kneeling, bone shards rising at her feet',
    charge: 'lantern staff held close with both hands, head bowed, ghostly green light swirling into the lantern', grab: 'one hand stretched forward clawed, a spectral skeletal hand reaching out from her sleeve',
    airlight: 'in mid-air swiping the staff downward', airheavy: 'in mid-air dropping with the staff held vertical beneath her like a stake',
    command: 'thrusting the staff forward low, a spike of bone jutting from the tip', special2: 'one hand extended drawing a stream of green soul-light toward her palm', special3: 'hurling a spear of bone forward overhand',
    super: 'arms spread, head tilted back, lantern blazing, hair and dress lifted by ghostly wind',
  },
  odran: {
    light2: 'short brutal elbow strike', light3: 'headbutt lunging forward, horned helm leading',
    heavy2: 'horizontal great axe swing at neck height, whole torso rotating', heavy3: 'great axe brought down overhead with both hands, feet leaving the ground',
    charge: 'great axe hauled far back over the shoulder with both hands, muscles straining, teeth bared, embers along the axe edge', grab: 'grabbing forward with one massive hand at head height, axe held aside in the other',
    airlight: 'in mid-air chopping the axe downward one-handed', airheavy: 'in mid-air falling with the great axe raised overhead in both hands like a meteor',
    command: 'charging forward like a bull, shoulder first, axe dragging behind', special2: 'spinning with the great axe held out at full reach', special3: 'smashing the axe head into the ground, kneeling',
    super: 'berserk roar, axe swinging wildly, red-ember aura hugging his body, fur mantle flying',
  },
  li: {
    light2: 'second rapid spear thrust, slightly higher, rear hand sliding', light3: 'full-extension lunging spear thrust, front leg deeply bent, rear leg straight',
    heavy2: 'turning away then thrusting the spear backward-over-the-shoulder in a reversal strike', heavy3: 'spear swung overhead and smashed downward like a staff',
    charge: 'low horse stance, spear drawn far back and levelled, ponytail and ribbon lifting, cold light on the blade', grab: 'hooking forward with the spear blade to catch an opponent and pull them in',
    airlight: 'in mid-air thrusting the spear diagonally downward', airheavy: 'in mid-air pole-vaulting down with the spear point driven toward the ground',
    command: 'dashing forward with the spear levelled, dress slits and ribbon streaming', special2: 'sweeping the spear in a wide arc releasing a crescent of cold light close to the blade', special3: 'spinning the spear overhead like a rotor',
    super: 'flurry of thrusts with several afterimage spear points fanned close in front of her',
  },
  nola: {
    light2: 'swinging the golden mace horizontally', light3: 'thrusting an open palm forward with a small flash of holy light',
    heavy2: 'two-handed overhead mace smash of judgement', heavy3: 'rising upward mace swing, dress train sweeping',
    charge: 'mace held to her chest in both hands, eyes closed in prayer, halo brightening', grab: 'extending her free hand forward with glowing golden shackles of light forming at her fingers',
    airlight: 'in mid-air tapping the mace downward', airheavy: 'in mid-air descending with the mace overhead in both hands, trailing light',
    command: 'stepping forward and smiting downward with the mace, one hand on her chest', special2: 'kneeling with the mace planted, a small dome of soft light around her', special3: 'pointing the mace forward, a bolt of light at its tip',
    super: 'hovering just above the ground, arms open, mace raised, bright halo and feather-like motes of light, serene',
  },
};

/** 敌人 / Boss 的第二种攻击(对应它的重招或招牌技) */
const ENEMY_ATTACK2 = {
  husk: 'leaping pounce with both ember claws stretched forward', brute: 'slamming the war hammer straight down into the ground',
  emberbow: 'bow fully drawn, loosing a burning arrow', hound: 'airborne pounce, jaws wide open, body stretched out',
  monk: 'two-handed thrust with a prayer staff', chanter: 'tome held open in one hand, the other hand hurling a glowing page-bolt forward',
  miner: 'pickaxe raised high overhead in both hands about to split downward', crawler: 'springing forward off the ground, root-limbs spread, biting',
  kingsguard: 'long spear thrust at full extension from behind the tower shield', shade: 'reappearing with a backstab thrust, body half dissolved into smoke',
  ashling: 'swollen and glowing white-hot, arms spread, on the verge of exploding', skeleton: 'overhead chop with the rusty sword',
  gareth: 'heavy two-handed downward cleave with the broad sword', bishop: 'slamming the crozier down, pages scattering',
  colossus: 'both boulder fists raised overhead about to smash down', queenshade: 'descending slash with a sword of flame, gown trailing like fire',
  nameless: 'one enormous arm of ash driven forward in an annihilating punch',
};
/** Boss 放技能时的姿势 */
const BOSS_SPECIAL = {
  gareth: 'spinning slash with cape and banner whirling, sword trailing ember light', bishop: 'both arms raised, crozier aloft, a storm of glowing pages rising around him',
  colossus: 'one fist punched into the ground, amber core flaring, rocks lifting', queenshade: 'one hand extended forward casting a ball of flame, crown blazing',
  nameless: 'arms spread wide, countless faint faces surging across its body, white-hot core exposed',
};

/** 场景里的障碍物与掉落物(单个物件,不是角色) */
const PROPS = {
  rock: ['a waist-high jagged dark boulder dusted with ash snow, a few glowing ember cracks', 512],
  crate: ['a sturdy old wooden supply crate with iron corner brackets, scorched edges', 512],
  barrel: ['an old wooden barrel with rusted iron hoops, faint ember glow leaking between the staves', 512],
  barricade: ['a wide low wooden spiked barricade of sharpened stakes lashed with rope, seen from the side', 512],
  food: ['a roasted meat drumstick on the bone with a warm golden glow, simple readable game pickup icon', 256],
  ember: ['a floating orange ember crystal shard with a bright glowing core, simple readable game pickup icon', 256],
};

const SPRITE_RULES_V2 = SPRITE_RULES + ', keep any glow or effect small and close to the body, same outfit colors and weapon as the reference idle image';
const v2 = [];
/** 往第二批清单里加一张图;路径直接写源文件的保存位置 art/source/... */
const add2 = (priority, path, size, prompt, note, reference) =>
  v2.push({ priority, path: `art/source/${path}`, width: size, height: size, transparent: true, prompt: `${STYLE}. ${prompt}`, negative: NEGATIVE, note, reference });

const P0 = ['run1', 'run2', 'run3', 'run4', 'light2', 'light3', 'heavy2', 'heavy3', 'charge'];
const P1 = ['guard', 'dodge', 'airlight', 'airheavy', 'grab', 'launched', 'getup'];
const P2 = ['command', 'special2', 'special3', 'super'];
for (const [pri, poses] of [[0, P0], [1, P1], [2, P2]]) for (const h of HEROES) for (const pose of poses) {
  const desc = HERO_POSES_V2[pose] ?? HERO_MOVES_V2[h.id][pose];
  if (!desc) throw new Error(`缺少姿势描述:${h.id}/${pose}`);
  add2(pri, `sprites/${h.id}/${pose}.png`, 512, `${h.look}. ${desc}. ${SPRITE_RULES_V2}`, `${h.name} 战斗姿势:${pose}`, `art/source/sprites/${h.id}/idle.png`);
}
for (const [id, [look, size]] of Object.entries(PROPS)) {
  add2(1, `props/${id}.png`, size, `${look}. Single object, three-quarter side view, centered, resting on the bottom edge area, plain transparent background, no ground shadow, no characters, game prop sprite`, `场景物件:${id}`);
}
for (const e of [...BOSSES, ...ENEMIES]) {
  const ref = `art/source/sprites/${e.id}/idle.png`;
  add2(3, `sprites/${e.id}/walk2.png`, 512, `${e.look}. ${HERO_POSES.walk2}. ${SPRITE_RULES_V2}`, '敌人战斗姿势:walk2(行走第二帧)', ref);
  add2(3, `sprites/${e.id}/attack2.png`, 512, `${e.look}. ${ENEMY_ATTACK2[e.id]}. ${SPRITE_RULES_V2}`, '敌人战斗姿势:attack2(重招)', ref);
  add2(3, `sprites/${e.id}/launched.png`, 512, `${e.look}. ${HERO_POSES_V2.launched}. ${SPRITE_RULES_V2}`, '敌人战斗姿势:launched(被打飞)', ref);
}
for (const b of BOSSES) {
  add2(3, `sprites/${b.id}/special.png`, 512, `${b.look}. ${BOSS_SPECIAL[b.id]}. ${SPRITE_RULES_V2}`, 'Boss 战斗姿势:special(放技能)', `art/source/sprites/${b.id}/idle.png`);
}

// 可选:招式特效贴图。游戏现在用程序画这些特效;交了同名图片就会改用图片。
// 游戏用「叠加发光」的方式显示它们,所以必须是纯黑背景(黑色 = 看不见)、图案本身是白色到浅灰(颜色由游戏按角色染)。
const FX = {
  crescent: [512, 512, 'a single crescent-moon shaped sword slash arc, the arc bulges toward the RIGHT side of the image and its two sharp tips point to the top-left and bottom-left, bright sharp outer edge fading softly toward the inside'],
  streak: [1024, 256, 'a single horizontal spear-thrust energy streak pointing to the RIGHT, thin faint tail on the left growing into a bright sharp tip on the right, perfectly horizontal and vertically centered'],
  burst: [512, 512, 'a radial impact burst centered in the image, many sharp spikes of uneven length radiating outward from a bright core'],
  circle: [512, 512, 'a flat magic circle seen straight from above, perfectly round and centered, two concentric rings with tick marks and a hexagram inside, thin glowing lines'],
  crack: [512, 512, 'ground fracture cracks seen straight from above, jagged glowing lines radiating outward from the center of the image'],
  pillar: [512, 1024, 'a vertical pillar of light, brightest along the vertical center line, fading softly to the left and right edges, solid at the bottom and fading out at the top'],
};
for (const [id, [w, h, desc]] of Object.entries(FX)) {
  v2.push({
    priority: 3, path: `art/source/fx/${id}.png`, width: w, height: h, transparent: false,
    prompt: `game visual effect texture, ${desc}, pure white and light grey glow on a pure black background, no color, no character, no scenery, no text, high contrast`,
    negative: NEGATIVE + ', color, colored background, grey background', note: `招式特效贴图(可选):${id}。纯黑背景、白色图案,方向必须和描述一致`,
  });
}

writeFileSync(new URL('../art/prompts-v2.json', import.meta.url), JSON.stringify({ style: STYLE, negative: NEGATIVE, images: v2 }, null, 2));
console.log(`写入 art/prompts-v2.json:共 ${v2.length} 张(` + [0, 1, 2, 3].map(p => `P${p} ${v2.filter(i => i.priority === p).length}`).join(' / ') + ')');

// =====================================================================================
// 动图特效(试做批):让生图方直接出「逐帧动画」的 GIF,游戏把它拆成帧来播放。
// 先做 7 个看效果,好用再扩充。输出到 art/prompts-fx-anim.json。
// 统一要求:纯黑背景、白到浅灰的图案(游戏按角色染色)、画面不移动不缩放、一次性特效首尾两帧接近全黑。
// =====================================================================================
const FX_ANIM = [
  { id: 'slash', frames: 8, loop: false, desc: 'a crescent sword-slash arc sweeping from the upper left down to the lower right, the arc bulges toward the RIGHT, appears thin, flares to full brightness, then thins out and vanishes', note: '刀光挥过(横斩 / 下劈用)' },
  { id: 'hit', frames: 6, loop: false, desc: 'a sharp impact spark burst at the exact center, spikes shoot outward and fade', note: '命中火花' },
  { id: 'explosion', frames: 12, loop: false, desc: 'an explosion at the exact center: bright flash, expanding fireball with rolling turbulent edges, then breaking into fading smoke wisps', note: '爆炸(爆裂箭、烬爆、木桶)' },
  { id: 'pillar', frames: 12, loop: false, desc: 'a pillar of flame erupting straight up from the bottom-center of the image, rising to nearly full height, then narrowing and dying down', note: '地面喷出的火柱 / 光柱(升焰、光柱、喷火口)' },
  { id: 'lightning', frames: 8, loop: false, desc: 'a jagged lightning bolt striking from the top-center straight down to the bottom-center, with a bright flash at the ground on impact, then flickering out', note: '落雷(审判、万卷坠落)' },
  { id: 'shockwave', frames: 10, loop: false, desc: 'a ground dust shockwave seen from the side: a low wall of dust and debris bursting up at the bottom-center and spreading outward to both left and right along the bottom edge, then settling', note: '砸地冲击波(裂地、震地锤)' },
  { id: 'flame', frames: 8, loop: true, desc: 'a ball of fire with a flickering tail trailing to the LEFT, as if flying to the right, seamless loop', note: '飞行的火球(循环播放)' },
];
const fxAnim = FX_ANIM.map(f => ({
  path: `art/source/fx-anim/${f.id}.gif`, width: 512, height: 512, frames: f.frames, fps: 15, loop: f.loop, note: f.note,
  prompt: `frame-by-frame animated game visual effect, ${f.desc}. Pure white and light grey glow on a pure black background, no color, no character, no scenery, no text, the camera does not move or zoom, the effect stays the same size and position across frames` +
    (f.loop ? '' : ', the first frame and the last frame are almost completely black'),
  negative: NEGATIVE + ', color, colored background, grey background, camera shake, zoom',
}));
writeFileSync(new URL('../art/prompts-fx-anim.json', import.meta.url), JSON.stringify({ images: fxAnim }, null, 2));
console.log(`写入 art/prompts-fx-anim.json:共 ${fxAnim.length} 个动图特效(试做批)`);
