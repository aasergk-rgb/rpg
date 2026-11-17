// E2E スモークテスト：起動→はじめる→移動・攻撃→戦闘→部位切断→グラフト→ボス戦
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(require('node:child_process').execSync('npm root -g').toString().trim() + '/playwright')); }
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:4173/';
const OUT = process.env.OUT || 'screenshots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 915, height: 412 }, deviceScaleFactor: 1, hasTouch: true, isMobile: false });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const wait = (ms) => page.waitForTimeout(ms);
const g = (fn, arg) => page.evaluate(fn, arg);

await page.goto(URL);
await wait(2500);
await shot('01-title');
await page.click('[data-a="new"]');
await wait(1500);
// テスト用に体力を増やす
await g(() => { const P = window.__game.player; P.hpMax = 99999; P.hp = 99999; });
await shot('02-hub');

// 移動
await page.keyboard.down('KeyW');
await wait(1200);
await page.keyboard.up('KeyW');
await shot('03-walk');

// 中庭の鎧騎士の前へテレポートして戦闘
await g(() => { const G = window.__game; const k = G.enemies.find(e => e.type === 'knight'); G.player.pos.set(k.pos.x, 0, k.pos.z - 2.5); G.player.facing = 0; G.cam.snapBehind(0); });
await wait(600);
await page.keyboard.press('KeyQ');
await wait(300);
for (let i = 0; i < 4; i++) { await page.keyboard.press('KeyJ'); await wait(280); }
await shot('04-combat');
const st1 = await g(() => { const G = window.__game; return G.enemies.filter(e=>e.alive).map(e => ({ t: e.type, hp: Math.round(e.hp), st: e.state, parts: Object.fromEntries(Object.entries(e.parts).map(([k,p]) => [k, { a: Math.round(p.armor), hp: Math.round(p.hp), sev: p.severed }])) })); });
console.log('enemies after combo', JSON.stringify(st1.slice(0, 3)));

// 決定的に検証するため敵を静止させ、盾の装甲を剥がした状態から斬撃で切断する
await g(() => { const G = window.__game; for (const e of G.enemies) { e.aggroRange = 0; e.state = 'idle'; e.attack = null; } const k = G.enemies.find(e => e.type === 'knight' && e.alive); k.parts.shield.armor = 0; k.parts.shield.hp = 1; k.facing = Math.PI; G.player.pos.set(k.pos.x, 0, k.pos.z - 2.2); G.player.state = 'move'; });
await wait(300);
await g(() => { const G = window.__game; const k = G.enemies.find(e => e.type === 'knight' && e.alive); G.lock.target = k; G.lock.partId = 'shield'; });
for (let i = 0; i < 3; i++) { await page.keyboard.press('KeyJ'); await wait(350); }
await wait(1500);
const pk = await g(() => window.__game.pickups.map(p => ({ id: p.id, x: p.pos.x.toFixed(1), z: p.pos.z.toFixed(1), g: p.grounded })));
console.log('pickups', JSON.stringify(pk));
await shot('05-severed');
if (pk.length) {
  await g(() => { const G = window.__game; const p = G.pickups[0]; G.player.pos.set(p.pos.x + 0.8, G.player.pos.y, p.pos.z); });
  await wait(300);
  await page.keyboard.press('KeyE');
  await wait(900);
  console.log('graft', await g(() => window.__game.player.graft?.def.id ?? null));
  await page.keyboard.down('KeyK');
  await wait(900);
  await shot('06-graft-special');
  await page.keyboard.up('KeyK');
  await wait(600);
}

// ボス戦
await g(() => { const G = window.__game; G.player.pos.set(0, -12, 80); G.player.facing = 0; G.player.state = 'move'; G.cam.snapBehind(0); G.lock.clear(); });
await wait(500);
await g(() => { const G = window.__game; const b = G.enemies.find(e => e.boss); b.aggroRange = 22; });
await page.keyboard.press('KeyE');
await wait(2500);
await g(() => { const G = window.__game; const b = G.enemies.find(e => e.boss); G.player.pos.set(b.pos.x, -12, b.pos.z - 4); });
await page.keyboard.press('KeyQ');
await wait(1800);
await shot('07-boss');
for (let i = 0; i < 6; i++) { await page.keyboard.press('KeyJ'); await wait(300); }
await wait(600);
await shot('08-boss-fight');
const boss = await g(() => { const G = window.__game; const b = G.enemies.find(e => e.boss); return b && { hp: Math.round(b.hp), st: b.state, phase: b.phase }; });
console.log('boss', JSON.stringify(boss), 'player hp', await g(() => Math.round(window.__game.player.hp)));
// タッチUIのフリック判定（ポインタイベント）
await g(() => { const G = window.__game; G.input.lastDevice = 'touch'; G.player.dropGraft(false); G.player.stamina = 100; G.player.pos.set(0, 0, 0); G.player.state = 'move'; G.lock.clear(); for (const e of G.enemies) { e.aggroRange = 0; e.state = 'idle'; } });
await wait(400);
const btn = await page.locator('.tbtn.attack').boundingBox();
const cx = btn.x + btn.width / 2, cy = btn.y + btn.height / 2;
await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx, cy - 50, { steps: 3 }); await page.mouse.up();
await wait(80);
const upMove = await g(() => window.__game.player.move?.id ?? window.__game.player.state);
await wait(900);
await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx - 60, cy, { steps: 3 }); await page.mouse.up();
await wait(80);
const fwdMove = await g(() => window.__game.player.move?.id ?? window.__game.player.state);
await wait(900);
await page.mouse.move(cx, cy); await page.mouse.down(); await wait(1100); await page.mouse.up();
await wait(60);
const chargeMove = await g(() => window.__game.player.move?.id ?? window.__game.player.state);
console.log('touch flick', JSON.stringify({ upMove, fwdMove, chargeMove }));
if (upMove !== 'su' || fwdMove !== 'sf' || chargeMove !== 'sc') errors.push('touch flick mismatch');

// 鍛冶場UI
await g(() => { const G = window.__game; G.player.pos.set(7.8, 0, -7.2); });
await wait(300);
await page.keyboard.press('KeyE');
await wait(500);
await shot('09-forge');
await page.keyboard.press('Escape');
await wait(200);
const calls = await g(() => window.__game.renderer.renderer.info.render.calls);
console.log('draw calls (hub)', calls);
await g(() => { const G = window.__game; G.player.pos.set(0, 0, 45); });
await wait(600);
console.log('draw calls (courtyard)', await g(() => window.__game.renderer.renderer.info.render.calls));
const fps = await g(() => window.__game.renderer.fps);
console.log('fps (swiftshader)', fps.toFixed(1));
console.log('errors', JSON.stringify(errors, null, 1));
await browser.close();
if (errors.length) process.exit(1);
