import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/**
 * 端末ハプティクス。
 *  - flesh：重低音（Heavy impact / 長めのパルス）
 *  - metal：鋭い金属振動（Light impact 連打 / 短パルス）
 */
export type HapticKind = 'flesh' | 'metal' | 'heavy' | 'light' | 'parry';

const native = Capacitor.isNativePlatform();
let enabled = true;

export function setHapticsEnabled(v: boolean): void {
  enabled = v;
}

export function haptic(kind: HapticKind): void {
  if (!enabled) return;
  if (native) {
    switch (kind) {
      case 'flesh':
        void Haptics.impact({ style: ImpactStyle.Heavy });
        break;
      case 'heavy':
        void Haptics.impact({ style: ImpactStyle.Heavy });
        setTimeout(() => void Haptics.impact({ style: ImpactStyle.Heavy }), 60);
        break;
      case 'metal':
        void Haptics.impact({ style: ImpactStyle.Light });
        setTimeout(() => void Haptics.impact({ style: ImpactStyle.Light }), 25);
        break;
      case 'parry':
        void Haptics.impact({ style: ImpactStyle.Medium });
        setTimeout(() => void Haptics.impact({ style: ImpactStyle.Light }), 40);
        setTimeout(() => void Haptics.impact({ style: ImpactStyle.Light }), 80);
        break;
      case 'light':
        void Haptics.impact({ style: ImpactStyle.Light });
        break;
    }
    return;
  }
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    const pattern: Record<HapticKind, number | number[]> = {
      flesh: 45,
      heavy: [60, 30, 60],
      metal: [8, 12, 8],
      parry: [15, 20, 10, 20, 10],
      light: 10,
    };
    try {
      navigator.vibrate(pattern[kind]);
    } catch {
      /* noop */
    }
  }
}
