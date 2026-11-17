import * as THREE from 'three';
import { Level } from './Level';
import { M, mat } from '../render/Materials';

export interface SpawnDef {
  id: string;
  type: 'ghoul' | 'knight' | 'brute' | 'hound' | 'galahad';
  pos: [number, number, number];
  facing?: number;
}

export interface WorldDef {
  level: Level;
  spawns: SpawnDef[];
  playerStart: THREE.Vector3;
  hearthPos: THREE.Vector3;
  bossArena: { min: THREE.Vector3; max: THREE.Vector3 };
  fogWall: THREE.Mesh;
  zones: { name: string; min: [number, number]; max: [number, number]; yMin: number; yMax: number }[];
}

function titanRib(level: Level, x: number, z: number, scale: number, rotY: number, y = 0): void {
  // 巨神の骸：大陸を覆う巨大な肋骨のアーチ
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(2, 10, 0),
    new THREE.Vector3(8, 18, 0),
    new THREE.Vector3(16, 20, 0),
    new THREE.Vector3(24, 16, 0),
  ]);
  const geo = new THREE.TubeGeometry(curve, 24, 1.1, 8, false);
  const mesh = new THREE.Mesh(geo, M.bone());
  mesh.scale.setScalar(scale);
  mesh.position.set(x, y - 1, z);
  mesh.rotation.y = rotY;
  mesh.castShadow = false;
  mesh.userData.noFade = true;
  level.group.add(mesh);
}

export function buildWorld(): WorldDef {
  const L = new Level();
  const zones: WorldDef['zones'] = [];

  // =========================================================================
  // 炉心の廃教会（拠点）  x[-10,10] z[-12,12] y=0
  // =========================================================================
  zones.push({ name: '炉心の廃教会', min: [-10, -12], max: [10, 12], yMin: -2, yMax: 10 });
  L.floor(-10, -12, 10, 12, 0);
  L.wall(-11, -13, -10, 13, 0, 9);
  L.wall(10, -13, 11, 13, 0, 9);
  L.wall(-11, -13, 11, -12, 0, 9);
  L.wall(-11, 12, -2, 13, 0, 9);
  L.wall(2, 12, 11, 13, 0, 9);
  L.box(-2, 6, 12, 2, 9, 13, mat('lvlStone2', { color: 0x4a4644, roughness: 0.9 }), { occluder: true });
  for (const z of [-6, 0, 6]) {
    L.pillar(-6, z, 0, 9);
    L.pillar(6, z, 0, 9);
  }
  // 祭壇の段
  L.box(-3.5, 0, -11.5, 3.5, 0.35, -7.5, M.stoneDark());
  // 崩れた長椅子
  for (const z of [1, 4, 7]) {
    L.box(-4.5, 0, z, -1.8, 0.5, z + 0.5, M.wood(), { shadow: true });
    L.box(1.8, 0, z, 4.5, 0.5, z + 0.5, M.wood(), { shadow: true });
  }
  L.brazier(-3, 0, 9, 10);
  L.brazier(3, 0, 9, 10);

  // 炉心（セーブ・回復）
  const hearthPos = new THREE.Vector3(0, 0.35, -9.2);
  const hearth = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.15, 8, 24), M.iron());
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.2;
  const heart = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), M.ember());
  heart.position.y = 1.4;
  heart.name = 'heart';
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 2.2, 8, 1, true), mat('cage', { color: 0x222222, metalness: 0.9, roughness: 0.4, wireframe: true }));
  cage.position.y = 1.2;
  hearth.add(ring, heart, cage);
  hearth.position.copy(hearthPos);
  L.group.add(hearth);
  L.lightSpots.push({ pos: hearthPos.clone().setY(2.2), color: 0xff6a20, intensity: 24 });
  L.addInteract({ id: 'hearth', kind: 'hearth', pos: hearthPos.clone(), radius: 2.4, active: true, object: hearth });

  // 鍛冶屋（金床と鍛冶師）
  const forge = new THREE.Group();
  const anvil = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.45, 0.5), M.iron());
  anvil.position.y = 0.75;
  const anvBase = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.4), M.iron());
  anvBase.position.y = 0.27;
  const smith = new THREE.Group();
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.7, 8), M.playerCloth());
  robe.position.y = 0.85;
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), M.playerCloth());
  hood.position.y = 1.75;
  const eyes = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), M.ember());
  eyes.position.set(0, 1.75, 0.22);
  smith.add(robe, hood, eyes);
  smith.position.set(1.2, 0, 0.3);
  smith.rotation.y = -0.8;
  forge.add(anvil, anvBase, smith);
  forge.position.set(7.8, 0, -9.5);
  forge.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  L.group.add(forge);
  L.brazier(8.6, 0, -6.8, 12);
  L.addInteract({ id: 'forge', kind: 'forge', pos: new THREE.Vector3(7.8, 0, -9), radius: 2.4, active: true, object: forge });

  // =========================================================================
  // 回廊  x[-2,2] z[12,30]
  // =========================================================================
  zones.push({ name: '血錆の回廊', min: [-2.5, 12], max: [2.5, 30], yMin: -2, yMax: 10 });
  L.floor(-2.5, 12, 2.5, 30, 0);
  L.wall(-3.5, 13, -2.5, 30, 0, 6);
  L.wall(2.5, 13, 3.5, 30, 0, 6);
  L.brazier(-1.7, 0, 21, 9);

  // =========================================================================
  // 城塞外郭（中庭）  x[-16,16] z[30,62]
  // =========================================================================
  zones.push({ name: '城塞外郭', min: [-16, 30], max: [16, 62], yMin: -2, yMax: 14 });
  // 床（北端中央にエレベーター用の穴）
  L.floor(-16, 30, 16, 57, 0);
  L.floor(-16, 57, -2.5, 62, 0);
  L.floor(2.5, 57, 16, 62, 0);
  // 外壁
  L.wall(-17, 29, -2.5, 30, 0, 10);
  L.wall(2.5, 29, 17, 30, 0, 10);
  L.wall(-17, 62, 17, 63, 0, 10);
  L.wall(-17, 30, -16, 44, 0, 10);
  L.wall(-17, 48, -16, 62, 0, 10);
  L.wall(16, 30, 17, 44, 0, 10);
  L.wall(16, 48, 17, 62, 0, 10);
  // 崩れた内壁・遮蔽物
  L.wall(-9, 41, -5, 42, 0, 2.2, true);
  L.wall(5, 52, 9, 53, 0, 1.6, true);
  L.box(-12.5, 0, 33, -10.5, 1.2, 35, M.wood());
  L.box(11, 0, 33, 12.4, 1.0, 34.4, M.wood());
  L.pillar(-6, 34, 0, 7, 0.7);
  L.pillar(6, 40, 0, 4.5, 0.7);
  L.pillar(-12, 56, 0, 6, 0.7);
  // 二段ジャンプで届く高台
  L.box(10, 0, 56, 16, 1.7, 62, M.stoneDark());
  L.addInteract({ id: 'chest_ledge', kind: 'chest', pos: new THREE.Vector3(13.5, 1.7, 59.5), radius: 1.8, active: true, data: { reward: 'flask' } });
  L.brazier(-14, 0, 31.5, 12);
  L.brazier(14, 0, 31.5, 12);
  L.brazier(-4, 0, 60.5, 10);
  L.brazier(4, 0, 60.5, 10);

  // 東：錆びた巨大鉄格子（怪力の剛腕でこじ開ける）
  const gateGroup = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 5, 6), M.rust());
    bar.position.set(0, 2.5, 44.3 + i * 0.57);
    gateGroup.add(bar);
  }
  const cross = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 4), M.rust());
  cross.position.set(0, 3.8, 46);
  gateGroup.add(cross);
  const cross2 = cross.clone();
  cross2.position.y = 1.2;
  gateGroup.add(cross2);
  gateGroup.position.x = 16.3;
  L.group.add(gateGroup);
  const gateCol = L.box(15.9, 0, 44, 16.7, 5, 48, M.rust(), { collide: true, tag: 'gate' });
  (gateCol.mesh as THREE.Mesh).visible = false;
  gateCol.mesh = gateGroup;
  L.addInteract({ id: 'gate_east', kind: 'gate', pos: new THREE.Vector3(15, 0, 46), radius: 2.6, active: true, object: gateGroup, data: { collider: gateCol } });

  // 東の小部屋
  L.floor(16, 40, 28, 52, 0);
  L.wall(16, 39, 29, 40, 0, 7);
  L.wall(16, 52, 29, 53, 0, 7);
  L.wall(28, 40, 29, 52, 0, 7);
  L.brazier(26.5, 0, 41.5, 10);
  L.addInteract({ id: 'chest_east', kind: 'chest', pos: new THREE.Vector3(25.5, 0, 46), radius: 1.8, active: true, data: { reward: 'skeleton:greatsword' } });

  // 西：毒の茨（火で焼き払う）
  const thorns = new THREE.Group();
  for (let i = 0; i < 26; i++) {
    const t = new THREE.Mesh(new THREE.TorusKnotGeometry(0.35 + Math.random() * 0.25, 0.06, 32, 5, 2, 3), M.thorn());
    t.position.set(-16 + (Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 3.6, 44.2 + Math.random() * 3.6);
    t.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    thorns.add(t);
  }
  L.group.add(thorns);
  const thornCol = L.box(-16.6, 0, 44, -15.4, 4.5, 48, M.thorn(), { collide: true, tag: 'thorns' });
  (thornCol.mesh as THREE.Mesh).visible = false;
  thornCol.mesh = thorns;
  L.addInteract({ id: 'thorns_west', kind: 'thorns', pos: new THREE.Vector3(-15, 0, 46), radius: 2.6, active: true, object: thorns, data: { collider: thornCol } });

  // 西の小部屋
  L.floor(-28, 40, -16, 52, 0);
  L.wall(-29, 39, -16, 40, 0, 7);
  L.wall(-29, 52, -16, 53, 0, 7);
  L.wall(-29, 40, -28, 52, 0, 7);
  L.brazier(-26.5, 0, 50.5, 10);
  L.addInteract({ id: 'chest_west', kind: 'chest', pos: new THREE.Vector3(-25.5, 0, 46), radius: 1.8, active: true, data: { reward: 'skeleton:spear' } });

  // =========================================================================
  // 魔導エレベーター  x[-2.5,2.5] z[57,62]  y 0 ⇔ -12
  // =========================================================================
  const shaftMat = M.stoneDark();
  L.box(-3.5, -12, 57, -2.5, 0, 63, shaftMat, { occluder: true });
  L.box(2.5, -12, 57, 3.5, 0, 63, shaftMat, { occluder: true });
  const elevMat = mat('elev', { color: 0x4a4038, metalness: 0.8, roughness: 0.4, emissive: 0x002030, emissiveIntensity: 0.6 });
  L.elevator = L.box(-2.45, -0.4, 57.05, 2.45, 0, 61.95, elevMat, { tag: 'elevator', shadow: false });
  L.elevatorTarget = 0;
  const runes = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.5, 6), mat('runes', { color: 0x000000, emissive: 0x30c0ff, emissiveIntensity: 2, side: THREE.DoubleSide }));
  runes.rotation.x = -Math.PI / 2;
  runes.position.y = 0.21;
  L.elevator.mesh!.add(runes);
  L.addInteract({ id: 'elevator', kind: 'elevator', pos: new THREE.Vector3(0, 0, 59.5), radius: 2.4, active: true });

  // =========================================================================
  // 地下回廊  x[-3,3] z[48,82] y=-12（エレベーター下から北へ）
  // =========================================================================
  zones.push({ name: '巨神の脊髄道', min: [-3, 57], max: [3, 82], yMin: -16, yMax: -4 });
  L.floor(-3.5, 62, 3.5, 82, -12);
  L.box(-3.5, -13, 56, 3.5, -12, 62, M.floor());
  L.box(-3.5, -12, 55.5, 3.5, -1, 56.5, M.stoneDark(), { occluder: true });
  L.wall(-4.5, 62, -3.5, 82, -12, 7, true);
  L.wall(3.5, 62, 4.5, 82, -12, 7, true);
  L.brazier(-2.8, -12, 70, 10);
  L.brazier(2.8, -12, 78, 10);
  // 巨神の肉壁（脈動）
  for (let i = 0; i < 6; i++) {
    const blob = new THREE.Mesh(new THREE.SphereGeometry(0.8 + Math.random() * 0.8, 10, 8), M.titanFlesh());
    blob.position.set(i % 2 ? 3.6 : -3.6, -10 + Math.random() * 4, 64 + i * 3);
    blob.userData.noFade = true;
    L.group.add(blob);
  }

  // ボス前の霧の門
  const fogMat = new THREE.MeshBasicMaterial({ color: 0x8090ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const fogWall = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), fogMat);
  fogWall.position.set(0, -8.5, 82);
  fogWall.userData.noFade = true;
  L.group.add(fogWall);
  const fogCol = L.box(-3.5, -12, 81.8, 3.5, -5, 82.2, fogMat, { tag: 'fog' });
  (fogCol.mesh as THREE.Mesh).visible = false;
  L.addInteract({ id: 'fog', kind: 'fog', pos: new THREE.Vector3(0, -12, 81), radius: 2.5, active: true, data: { collider: fogCol } });

  // =========================================================================
  // 処刑場（ボスアリーナ） x[-18,18] z[82,118] y=-12
  // =========================================================================
  zones.push({ name: '処刑場', min: [-18, 82], max: [18, 118], yMin: -16, yMax: 4 });
  L.floor(-18, 82, 18, 118, -12);
  L.wall(-19, 81, -3.5, 82, -12, 14);
  L.wall(3.5, 81, 19, 82, -12, 14);
  L.wall(-19, 82, -18, 118, -12, 14);
  L.wall(18, 82, 19, 118, -12, 14);
  L.wall(-19, 118, -3, 119, -12, 14);
  L.wall(3, 118, 19, 119, -12, 14);
  L.pillar(-11, 92, -12, 3.5, 1);
  L.pillar(12, 96, -12, 6, 1);
  L.pillar(-12, 110, -12, 8, 1);
  L.pillar(11, 112, -12, 2.5, 1);
  L.brazier(-16, -12, 84, 16);
  L.brazier(16, -12, 84, 16);
  L.brazier(-16, -12, 116, 16);
  L.brazier(16, -12, 116, 16);
  // 処刑台
  L.box(-3, -12, 112, 3, -11.6, 116, M.wood());

  // 本編アンロック扉（体験版の終点）
  const door = new THREE.Mesh(new THREE.BoxGeometry(6, 8, 0.5), mat('trialDoor', { color: 0x2a2018, metalness: 0.6, roughness: 0.5, emissive: 0x401000, emissiveIntensity: 0.5 }));
  door.position.set(0, -8, 118.5);
  L.group.add(door);
  const doorCol = L.box(-3, -12, 118.2, 3, -4, 118.8, door.material as THREE.Material, { tag: 'trialDoor' });
  (doorCol.mesh as THREE.Mesh).visible = false;
  doorCol.mesh = door;
  L.addInteract({ id: 'trialDoor', kind: 'trialDoor', pos: new THREE.Vector3(0, -12, 117), radius: 2.5, active: true, object: door, data: { collider: doorCol } });

  // 深層（本編）入口：アンロック後のみ到達
  L.floor(-4, 118, 4, 132, -12);
  L.wall(-5, 119, -4, 132, -12, 8, true);
  L.wall(4, 119, 5, 132, -12, 8, true);
  L.wall(-5, 132, 5, 133, -12, 8, true);
  L.addInteract({ id: 'sign_deep', kind: 'sign', pos: new THREE.Vector3(0, -12, 129), radius: 2.5, active: true, data: { text: '溶鉱炉の貪り竜、百腕の墓守ヘカトン、機巧熾天使セラフ――深層への道は続く（本編エリアは開発中）' } });

  // 巨神の骸の背景
  titanRib(L, -30, 20, 1.6, 0.3);
  titanRib(L, -30, 45, 1.8, 0.1);
  titanRib(L, -32, 75, 1.7, -0.2);
  titanRib(L, 30, 30, 1.6, Math.PI - 0.2);
  titanRib(L, 32, 60, 1.8, Math.PI + 0.1);
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.5, 160, 10), M.bone());
  spine.rotation.x = Math.PI / 2;
  spine.position.set(0, 34, 60);
  spine.userData.noFade = true;
  L.group.add(spine);
  // 地平の巨大な心臓の光
  const glow = new THREE.Mesh(new THREE.SphereGeometry(8, 16, 12), new THREE.MeshBasicMaterial({ color: 0x601010, fog: false }));
  glow.position.set(0, 10, 240);
  L.group.add(glow);

  const spawns: SpawnDef[] = [
    { id: 'g_corr', type: 'ghoul', pos: [0, 0, 25], facing: Math.PI },
    { id: 'g_c1', type: 'ghoul', pos: [-8, 0, 37] },
    { id: 'g_c2', type: 'ghoul', pos: [8, 0, 36] },
    { id: 'g_c3', type: 'ghoul', pos: [-3, 0, 50] },
    { id: 'k_c1', type: 'knight', pos: [1, 0, 45], facing: Math.PI },
    { id: 'b_c1', type: 'brute', pos: [10, 0, 47], facing: -Math.PI / 2 },
    { id: 'h_c1', type: 'hound', pos: [-10, 0, 53], facing: Math.PI },
    { id: 'g_l1', type: 'ghoul', pos: [-1.5, -12, 67], facing: Math.PI },
    { id: 'g_l2', type: 'ghoul', pos: [1.5, -12, 72], facing: Math.PI },
    { id: 'k_l1', type: 'knight', pos: [0, -12, 77], facing: Math.PI },
    { id: 'boss', type: 'galahad', pos: [0, -12, 106], facing: Math.PI },
  ];

  return {
    level: L,
    spawns,
    playerStart: new THREE.Vector3(0, 0, -2),
    hearthPos,
    bossArena: { min: new THREE.Vector3(-18, -14, 82.5), max: new THREE.Vector3(18, 2, 118) },
    fogWall,
    zones,
  };
}
