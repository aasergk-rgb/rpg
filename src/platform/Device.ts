import { Capacitor } from '@capacitor/core';
import type { Quality } from '../render/Renderer';

export const isNative = Capacitor.isNativePlatform();

/** 端末性能をざっくり推定して画質プリセットを決める */
export function detectQuality(): Quality {
  const q = new URLSearchParams(location.search).get('q');
  if (q === 'low' || q === 'mid' || q === 'high') return q;
  const mem = (navigator as any).deviceMemory as number | undefined;
  const cores = navigator.hardwareConcurrency || 4;
  if ((mem !== undefined && mem <= 3) || cores <= 4) return 'low';
  if ((mem ?? 6) >= 8 && cores >= 8) return 'high';
  return 'mid';
}

/** 横画面固定・ステータスバー非表示（ネイティブ時） */
export async function setupNativeShell(): Promise<void> {
  if (!isNative) return;
  try {
    const { ScreenOrientation } = await import('@capacitor/screen-orientation');
    await ScreenOrientation.lock({ orientation: 'landscape' });
  } catch {
    /* noop */
  }
  try {
    const { StatusBar } = await import('@capacitor/status-bar');
    await StatusBar.hide();
  } catch {
    /* noop */
  }
}

/** 高リフレッシュレート端末なら 120fps を目標にする */
export function detectRefreshRate(): Promise<number> {
  return new Promise((resolve) => {
    let n = 0;
    const t0 = performance.now();
    const tick = () => {
      n++;
      if (n < 30) requestAnimationFrame(tick);
      else {
        const fps = (n * 1000) / (performance.now() - t0);
        resolve(fps > 100 ? 120 : 60);
      }
    };
    requestAnimationFrame(tick);
  });
}
