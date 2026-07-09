import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for HBSpro native iOS/Android shells — PRODUCTION.
 *
 * `server.url` points at the stable production URL for this Lovable project.
 * This URL serves the latest **published** deployment and never changes if
 * the project is renamed, so it is safe to bake into a shipped native app.
 *
 * IMPORTANT: publish the site from Lovable (Publish button) at least once —
 * otherwise this URL will 404 until the first deploy exists.
 *
 * To ship a fully offline / store-review build (no live web dependency),
 * remove the `server` block entirely and rely on `webDir: 'dist'` so the
 * client bundle is packaged inside the app itself.
 */
const config: CapacitorConfig = {
  appId: 'app.hrhbs.aqari',
  appName: 'Aqari',
  webDir: 'dist',
  server: {
    url: 'https://project--a9ead090-32b6-464c-a919-22a1f97a0364.lovable.app',
    cleartext: false,
    androidScheme: 'https',
    iosScheme: 'https',
    allowNavigation: [
      'project--a9ead090-32b6-464c-a919-22a1f97a0364.lovable.app',
      '*.lovable.app',
      'zgzhekdyospixozsmjwi.supabase.co',
      '*.supabase.co',
      'connector-gateway.lovable.dev',
    ],
  },
  ios: {
    contentInset: 'always',
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      launchFadeOutDuration: 300,
      backgroundColor: '#020617',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
      useDialog: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#020617',
      overlaysWebView: false,
    },
  },
};

export default config;
