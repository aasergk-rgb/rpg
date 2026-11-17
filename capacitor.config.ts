import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.titangraft.game',
  appName: 'TITAN GRAFT',
  webDir: 'dist',
  android: {
    backgroundColor: '#07060a',
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
