import './ui/style.css';
import { GameRenderer } from './render/Renderer';
import { Game } from './game/Game';
import { deleteSave, loadSave, loadSettings, writeSave, writeSettings, type Settings } from './core/Save';
import { newSave } from './game/Build';
import { audio } from './platform/Audio';
import { detectQuality, detectRefreshRate, isNative, setupNativeShell } from './platform/Device';
import { esc } from './ui/Menus';

const CONTROLS_HTML = `
<table class="controls-table">
<tr><th>操作</th><th>タッチ</th><th>コントローラー</th><th>キーボード</th></tr>
<tr><td>移動</td><td>画面左をドラッグ</td><td>左スティック</td><td>WASD</td></tr>
<tr><td>カメラ</td><td>画面右をドラッグ</td><td>右スティック</td><td>矢印キー</td></tr>
<tr><td>軽攻撃コンボ（最大4段）</td><td>攻ボタン タップ</td><td>X</td><td>J</td></tr>
<tr><td>斬り上げ・対空ジャンプ斬り</td><td>攻ボタン 上フリック</td><td>LB</td><td>I</td></tr>
<tr><td>踏み込み突進斬り</td><td>攻ボタン 横フリック</td><td>RB</td><td>L</td></tr>
<tr><td>溜め強攻撃（部位切断）</td><td>攻ボタン 長押し</td><td>RT 長押し</td><td>K 長押し</td></tr>
<tr><td>ステップ回避</td><td>避ボタン（スティック入力中）</td><td>A（スティック入力中）</td><td>Space（移動中）</td></tr>
<tr><td>刃合わせ（パリィ）</td><td>避ボタン（静止中・攻撃の瞬間）</td><td>A（静止中）</td><td>Space（静止中）</td></tr>
<tr><td>オーバーロード・パージ</td><td>避ボタン 長押し→離す</td><td>LT 長押し→離す</td><td>Space 長押し</td></tr>
<tr><td>接続・調べる</td><td>接続ボタン</td><td>B</td><td>E</td></tr>
<tr><td>ロックオン</td><td>◎ボタン</td><td>R3</td><td>Q</td></tr>
<tr><td>部位ターゲット切替</td><td>ロック中に画面右スワイプ</td><td>十字キー左右</td><td>Z / C</td></tr>
<tr><td>霊薬（回復）</td><td>霊薬ボタン</td><td>Y</td><td>R</td></tr>
</table>
<h3>戦いの心得</h3>
<ul>
<li><b>打撃</b>で装甲を砕き、露出した部位を<b>斬撃</b>で斬り落とす。<b>刺突</b>は弱点に刺さり大ダウンを奪う。</li>
<li>装甲が残る部位を斬ると刃が弾かれる。ロックオン中に右スワイプで狙う部位を選べ。</li>
<li>斬り落とした部位に駆け寄り「接続」。グラフト中は攻撃が部位の技に変化する（軽攻撃3段目→連携技）。</li>
<li>赤い咆哮攻撃はパリィ不能。ステップを合わせる「見切り」でスローになり、次の攻撃が確定の強攻撃になる。</li>
<li>処刑騎士の縦斬りを刃合わせすると右腕の装甲が剥がれる。</li>
<li>部位を残して倒すと、その部位由来のレア素材が手に入りやすい。</li>
</ul>`;

async function boot(): Promise<void> {
  void setupNativeShell();
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLDivElement;
  const rotate = document.createElement('div');
  rotate.className = 'rotate-hint';
  rotate.textContent = '端末を横向きにしてください';
  ui.appendChild(rotate);

  const [settings, saveRes] = await Promise.all([loadSettings(), loadSave()]);
  const renderer = new GameRenderer(canvas, detectQuality());
  void detectRefreshRate().then((hz) => (renderer.targetFps = hz));
  let save = saveRes.data;
  let hasSave = saveRes.exists;
  const game = new Game(renderer, ui, save, settings);
  const menus = game.menus;
  (window as any).__game = game;

  const unlockAudio = () => audio.unlock();
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  // タイトル画面の背景用に先に世界を構築
  game.start();
  game.hud.setVisible(false);
  game.running = false;
  game.cam.yaw = Math.PI * 0.85;
  game.cam.pitch = 0.18;
  game.cam.distance = 9;

  const showSettings = (onBack: () => void) => {
    const s = game.settings;
    const el = menus.push(
      `<div class="panel"><h2>設定</h2>
        <div class="row"><label>音量</label><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-k="volume"></div>
        <div class="row"><label>カメラ感度</label><input type="range" min="0.4" max="2" step="0.1" value="${s.camSensitivity}" data-k="camSensitivity"></div>
        <div class="row"><label>振動（ハプティクス）</label><button class="mbtn small" data-t="haptics">${s.haptics ? 'ON' : 'OFF'}</button></div>
        <div class="row"><label>FPS表示</label><button class="mbtn small" data-t="showFps">${s.showFps ? 'ON' : 'OFF'}</button></div>
        <div class="row"><label>画質</label><span>${renderer.quality.toUpperCase()}（動的解像度で${renderer.targetFps}fpsを維持）</span></div>
        <div class="menu" style="margin-top:12px"><button class="mbtn" data-a="back">戻る</button></div></div>`,
      '',
      () => {
        menus.pop();
        onBack();
      },
    );
    const apply = () => {
      game.applySettings(game.settings);
      void writeSettings(game.settings);
    };
    el.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((inp) =>
      inp.addEventListener('input', () => {
        (game.settings as any)[inp.dataset.k!] = Number(inp.value);
        apply();
      }),
    );
    el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.dataset.t) {
        const k = t.dataset.t as keyof Settings;
        (game.settings as any)[k] = !(game.settings as any)[k];
        t.textContent = (game.settings as any)[k] ? 'ON' : 'OFF';
        apply();
      } else if (t.dataset.a === 'back') {
        menus.pop();
        onBack();
      }
    });
  };

  const showControls = (onBack: () => void) => {
    const el = menus.push(`<div class="panel"><h2>操作説明</h2>${CONTROLS_HTML}<div class="menu" style="margin-top:10px"><button class="mbtn" data-a="back">戻る</button></div></div>`, '', () => {
      menus.pop();
      onBack();
    });
    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).dataset.a === 'back') {
        menus.pop();
        onBack();
      }
    });
  };

  const beginPlay = (fresh: boolean) => {
    if (fresh) {
      save = newSave();
      void deleteSave();
      game.save = save;
      hasSave = false;
    }
    menus.clear();
    audio.unlock();
    // 世界を作り直してセーブ状態を反映
    game.scene.remove(game.level.group);
    for (const e of game.enemies) e.dispose();
    game.enemies = [];
    game.scene.remove(game.player.group);
    game.cam.distance = 6.2;
    game.start();
    game.hud.setVisible(true);
    if (fresh) game.hud.banner('TITAN GRAFT', '敵の部位を斬り落とし、己の腕に繋げ');
    void writeSave(game.save);
  };

  const showTitle = () => {
    menus.clear();
    game.running = false;
    game.hud.setVisible(false);
    const el = menus.push(
      `<div class="logo">TITAN GRAFT</div>
       <div class="logo-sub">タイタン・グラフト</div>
       <div class="tagline">巨神の骸に築かれし大陸エルド・クラスト。<br>敵の最強の部位を斬り落とし、その場で己の腕に繋いでぶっ放せ。</div>
       <div class="menu">
         ${hasSave ? '<button class="mbtn primary" data-a="continue">続きから</button>' : ''}
         <button class="mbtn ${hasSave ? '' : 'primary'}" data-a="new">${hasSave ? 'はじめから' : 'はじめる'}</button>
         <button class="mbtn" data-a="controls">操作説明</button>
         <button class="mbtn" data-a="settings">設定</button>
       </div>
       <div class="tagline" style="margin-top:18px;font-size:11px">${save.unlocked ? '本編アンロック済み' : '体験版：序盤エリア無料／本編は買い切りアンロック'}　｜　スタミナ・ガチャ・課金武器なし${isNative ? '' : '　｜　PCはキーボード／ゲームパッド対応'}</div>`,
      'title-screen',
    );
    el.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).dataset.a;
      audio.unlock();
      if (a === 'continue') beginPlay(false);
      else if (a === 'new') {
        if (hasSave) {
          const c = menus.push(`<div class="panel"><h2>はじめから</h2><p>現在のセーブデータは失われます。よろしいですか？</p><div class="menu"><button class="mbtn" data-a="yes">はじめから</button><button class="mbtn" data-a="no">やめる</button></div></div>`, '', () => menus.pop());
          c.addEventListener('click', (ev) => {
            const b = (ev.target as HTMLElement).dataset.a;
            if (b === 'yes') beginPlay(true);
            else if (b === 'no') menus.pop();
          });
        } else beginPlay(true);
      } else if (a === 'controls') showControls(() => {});
      else if (a === 'settings') showSettings(() => {});
    });
  };

  const showPause = () => {
    const el = menus.push(
      `<div class="panel" style="min-width:280px"><h2>一時停止</h2>
       <div class="row"><span>撃破数 ${game.save.kills}　／　プレイ時間 ${Math.floor(game.save.playTime / 60)}分</span></div>
       <div class="menu">
         <button class="mbtn primary" data-a="resume">再開</button>
         <button class="mbtn" data-a="controls">操作説明</button>
         <button class="mbtn" data-a="settings">設定</button>
         <button class="mbtn" data-a="title">セーブしてタイトルへ</button>
       </div></div>`,
      '',
      () => menus.pop(),
    );
    el.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).dataset.a;
      if (a === 'resume') menus.pop();
      else if (a === 'controls') showControls(() => {});
      else if (a === 'settings') showSettings(() => {});
      else if (a === 'title') {
        void game.persist();
        hasSave = true;
        save = game.save;
        showTitle();
      }
    });
  };

  const showHearth = () => {
    const el = menus.push(
      `<div class="panel" style="min-width:300px"><h2>炉心の廃教会</h2>
       <p>炉心の火が傷を癒した。霊薬が満たされ、魔獣たちが蘇った。</p>
       <div class="menu">
         <button class="mbtn primary" data-a="leave">立ち去る</button>
         <button class="mbtn" data-a="forge">鍛冶場を開く</button>
         ${game.save.flags.bossDefeated ? '<button class="mbtn" data-a="rematch">処刑騎士の記憶と再戦する</button>' : ''}
         <button class="mbtn" data-a="controls">操作説明</button>
       </div></div>`,
      '',
      () => menus.pop(),
    );
    el.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).dataset.a;
      if (a === 'leave') menus.pop();
      else if (a === 'forge') game.openForge();
      else if (a === 'rematch') {
        game.rematchBoss();
        menus.pop();
      } else if (a === 'controls') showControls(() => {});
    });
  };

  const showTrialDoor = () => {
    if (game.save.unlocked) {
      game.openTrialDoor();
      return;
    }
    const el = menus.push(
      `<div class="panel" style="max-width:520px"><h2>封印された大扉</h2>
       <p>巨神の脈動が扉の向こうから響いてくる。ここから先は<b>本編</b>の領域だ。</p>
       <p>本編は買い切りでアンロックされます（スタミナ・ガチャ・課金武器は一切ありません）。<br>※このビルドでは決済処理は実装されておらず、フラグを切り替えるだけのデモです。</p>
       <div class="menu"><button class="mbtn primary" data-a="unlock">本編をアンロック（デモ）</button><button class="mbtn" data-a="no">やめる</button></div></div>`,
      '',
      () => menus.pop(),
    );
    el.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).dataset.a;
      if (a === 'unlock') {
        game.save.unlocked = true;
        void game.persist();
        menus.pop();
        game.openTrialDoor();
        game.hud.banner('本編アンロック', '深層への扉が開いた', 'victory');
      } else if (a === 'no') menus.pop();
    });
  };

  const showSign = (text: string) => {
    const el = menus.push(`<div class="panel" style="max-width:520px"><p>${esc(text)}</p><div class="menu"><button class="mbtn" data-a="ok">閉じる</button></div></div>`, '', () => menus.pop());
    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).dataset.a === 'ok') menus.pop();
    });
  };

  game.hooks = { onPause: showPause, onHearth: showHearth, onTrialDoor: showTrialDoor, onSign: showSign };

  // Android の戻るボタン
  if (isNative) {
    try {
      const { App } = await import('@capacitor/app');
      App.addListener('backButton', () => {
        if (menus.open) menus.back();
        else if (game.running) showPause();
      });
      App.addListener('pause', () => {
        if (game.running) {
          void game.persist();
          if (!menus.open) showPause();
        }
      });
    } catch {
      /* @capacitor/app 未導入 */
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.running) {
      void game.persist();
      if (!menus.open) showPause();
    }
  });

  showTitle();

  let last = performance.now();
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    const dt = (now - last) / 1000;
    last = now;
    if (!game.running) {
      // タイトル背景：ゆっくりカメラを回す
      game.cam.yaw += dt * 0.05;
      game.cam.update(0, dt, game.player.pos, null);
      game.fx.update(dt, dt);
      game.player.animate(dt);
      for (const e of game.enemies) e.animate(0, performance.now() / 1000);
      game.menus.pollPad();
    }
    game.update(dt);
    renderer.adapt(dt);
    renderer.render();
  };
  requestAnimationFrame(loop);
}

void boot();
