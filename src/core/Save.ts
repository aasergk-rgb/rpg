import { Capacitor } from '@capacitor/core';
import { parseSave, serializeSave, type SaveData } from '../game/Build';

const KEY = 'titan-graft-save-v1';
const SETTINGS_KEY = 'titan-graft-settings-v1';

/** 完全オフライン保存。ネイティブは Capacitor Preferences（OS のバックアップ対象）、Web は localStorage */
async function getRaw(key: string): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    const { Preferences } = await import('@capacitor/preferences');
    return (await Preferences.get({ key })).value;
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

async function setRaw(key: string, value: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key, value });
    return;
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    /* noop */
  }
}

export async function loadSave(): Promise<{ data: SaveData; exists: boolean }> {
  const raw = await getRaw(KEY);
  return { data: parseSave(raw), exists: !!raw };
}

export async function writeSave(data: SaveData): Promise<void> {
  await setRaw(KEY, serializeSave(data));
}

export async function deleteSave(): Promise<void> {
  await setRaw(KEY, '');
}

export interface Settings {
  volume: number;
  haptics: boolean;
  camSensitivity: number;
  showFps: boolean;
}

export const defaultSettings: Settings = { volume: 0.7, haptics: true, camSensitivity: 1, showFps: false };

export async function loadSettings(): Promise<Settings> {
  const raw = await getRaw(SETTINGS_KEY);
  try {
    return { ...defaultSettings, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...defaultSettings };
  }
}

export async function writeSettings(s: Settings): Promise<void> {
  await setRaw(SETTINGS_KEY, JSON.stringify(s));
}
