# تطبيقات الجوال — HBSpro (iOS + Android)

المنصة جاهزة كتطبيق جوال بمسارَين، مع أيقونات وشاشات بداية جاهزة للمتاجر.

## 1) PWA (تثبيت فوري بدون متاجر)

مُفعّل مسبقاً. أي مستخدم يستطيع تثبيت التطبيق مباشرة من المتصفح:

- **iPhone (Safari):** زر المشاركة ← "إضافة إلى الشاشة الرئيسية".
- **Android (Chrome):** القائمة ← "تثبيت التطبيق".

الأيقونات (`icon-192.png`, `icon-512.png`, `apple-touch-icon.png`) والـ manifest مضبوطة بالعلامة الجديدة تلقائياً.

## 2) تطبيق أصلي عبر Capacitor (App Store + Google Play)

### المُضمَّن في المشروع
- `capacitor.config.ts` — إعدادات التطبيق + خطط SplashScreen و StatusBar.
- `resources/icon.png` (1024×1024) — مصدر أيقونة المتاجر.
- `resources/splash.png` (1920×1920) — مصدر شاشة البداية.
- الحزم: `@capacitor/core`, `ios`, `android`, `splash-screen`, `status-bar`, `assets`.

### المتطلبات
- **iOS:** جهاز macOS + Xcode 15+ + حساب Apple Developer ($99/سنة).
- **Android:** Android Studio + حساب Google Play Console ($25 مرة واحدة).
- Node.js 18+ و Bun (أو npm).

### الخطوات على جهازك المحلي

```bash
# 1) استنسخ من GitHub (اربط المشروع بـ GitHub من زر أعلى Lovable أولاً)
git clone <repo-url> && cd <repo>
bun install

# 2) أضف المنصّتين (مرة واحدة فقط)
bunx cap add ios
bunx cap add android

# 3) ولّد جميع مقاسات الأيقونة وشاشات البداية تلقائياً من resources/
bunx capacitor-assets generate \
  --iconBackgroundColor '#020617' \
  --iconBackgroundColorDark '#020617' \
  --splashBackgroundColor '#020617' \
  --splashBackgroundColorDark '#020617'

# 4) ابنِ الأصول الويب ثم زامنها للمشاريع الأصلية
bun run build
bunx cap sync

# 5) افتح في IDE الأصلي
bunx cap open ios       # Xcode
bunx cap open android   # Android Studio
```

بعد كل تعديل في الحزم أو إعدادات Capacitor: `bunx cap sync` — لا حاجة لإعادة `cap add`.

### ماذا يُولَّد؟

`capacitor-assets generate` ينتج:
- **iOS:** كامل `AppIcon.appiconset` (كل المقاسات من 20pt إلى 1024pt لـ App Store) + `Splash.imageset` بمقاسات @1x/@2x/@3x فاتحة وداكنة.
- **Android:** `mipmap-*` (mdpi → xxxhdpi) بأيقونات عادية و adaptive (foreground + background) + `drawable-*` splash + `values/ic_launcher_background.xml` + `styles.xml` splash theme.

### شاشة البداية (Splash) — كيف تظهر
- خلفية داكنة `#020617` (تطابق ثيم HBSpro) مع شعار HB في المنتصف.
- تبقى ظاهرة `2000ms` ثم fade-out `300ms` تلقائياً (مضبوطة في `capacitor.config.ts` تحت `plugins.SplashScreen`).
- StatusBar بلون `#020617` وأيقونات فاتحة.
- لإخفائها يدوياً من الكود:
  ```ts
  import { SplashScreen } from '@capacitor/splash-screen';
  await SplashScreen.hide();
  ```

### وضع التطوير الحالي
`capacitor.config.ts` يستخدم `server.url` يشير لرابط معاينة Lovable — التطبيق الأصلي يحمّل الموقع الحيّ، وأي تعديل يظهر فوراً بدون إعادة بناء.

### وضع الإنتاج (قبل النشر للمتاجر)
1. انشر الموقع من زر **Publish** في Lovable.
2. في `capacitor.config.ts`: استبدل `server.url` برابط النشر النهائي، أو **احذف كتلة `server` كلياً** ليعمل التطبيق من الأصول المحلية في `dist/`.
3. `bun run build && bunx cap sync`.
4. **iOS:** Xcode → Product → Archive → Distribute App → App Store Connect.
5. **Android:** Android Studio → Build → Generate Signed Bundle → `.aab` → ارفعه إلى Play Console.

### تخصيص العلامة
- لتغيير الشعار: استبدل `resources/icon.png` (1024×1024 PNG مربّع) و `resources/splash.png` (يُفضّل 2732×2732، الشعار في وسط ~25% من المساحة) ثم أعِد `bunx capacitor-assets generate` و `bunx cap sync`.
- لتغيير `appId` أو `appName`: عدّل `capacitor.config.ts` **قبل** أول `cap add` (وإلا احذف مجلدَي `ios/` و `android/` وأعِد `cap add`).
