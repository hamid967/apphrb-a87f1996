import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for HBSpro native iOS/Android shells.
 *
 * The `server.url` below points at the Lovable preview so you can test the
 * native shell immediately without bundling a static web build. Once you
 * publish the site, replace it with your production URL (e.g.
 * https://your-project.lovable.app or your custom domain).
 *
 * To ship a fully offline / store-review-friendly build, remove `server.url`
 * entirely and set `webDir` to the built client assets folder produced by
 * your build pipeline.
 */
const config: CapacitorConfig = {
  appId: 'app.hbspro.mobile',
  appName: 'HBSpro',
  webDir: 'dist',
  server: {
    url: 'https://id-preview--a9ead090-32b6-464c-a919-22a1f97a0364.lovable.app',
    cleartext: false,
  },
  ios: {
    contentInset: 'always',
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
