import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'tbdff',
  slug: 'tbdff',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: true,
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    edgeToEdgeEnabled: true,
  },
  plugins: ['expo-secure-store'],
  extra: {
    // 'localhost' only works in emulators/simulators.
    // For physical devices, set API_URL to your machine's LAN IP:
    //   API_URL=http://192.168.x.x:5000/api pnpm dev:mobile
    // For Android emulator, use: API_URL=http://10.0.2.2:5000/api
    apiUrl: process.env.API_URL || 'http://localhost:5000/api',
  },
});
