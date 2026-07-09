# Aqari — دليل بناء تطبيق الجوال (Capacitor)

نفس واجهة React تُغلَّف داخل تطبيق أصلي (iOS/Android) عبر Capacitor.
التطبيق يعمل بوضع **remote content**: الغلاف الأصلي يحمّل الموقع المنشور
`https://project--a9ead090-32b6-464c-a919-22a1f97a0364.lovable.app` مباشرةً، فأي تحديث تنشره
من Lovable يظهر فوراً داخل التطبيق بدون إعادة بناء APK/IPA.

## المتطلبات (على جهازك المحلي — ليس داخل Lovable)

| النظام | الأدوات |
|---|---|
| **iOS** | macOS + Xcode 15+ + CocoaPods (`sudo gem install cocoapods`) + حساب Apple Developer |
| **Android** | Android Studio + JDK 17 + Android SDK 34 + حساب Google Play Developer |
| **مشترك** | Node 20+، حزمة `@capacitor/cli` مثبتة (موجودة بالفعل) |

## خطوات أولى (مرة واحدة فقط)

```bash
# 1) استنسخ المشروع محلياً من GitHub (زر "Export to GitHub" داخل Lovable)
git clone <your-repo-url> && cd <repo>
bun install    # أو npm install

# 2) تأكّد أن الموقع منشور على Lovable مرة واحدة على الأقل
#    (وإلا سيعطي URL 404)

# 3) أضف منصّات Capacitor الأصلية
bun run cap:add:ios       # ينشئ مجلد ios/
bun run cap:add:android   # ينشئ مجلد android/

# 4) زامن الإعدادات مع المشاريع الأصلية
bun run cap:sync
```

> ملاحظة: مجلدات `ios/` و `android/` **لا تُنشأ داخل Lovable** — أضِفها محلياً بعد التصدير إلى GitHub.

## دورة التطوير اليومية

طالما تعمل بوضع remote-content:

1. عدّل الكود داخل Lovable كالمعتاد.
2. اضغط **Publish → Update** في Lovable.
3. أعد فتح التطبيق على الجوال — سيرى المستخدمون التحديث فوراً.
4. **لا** حاجة لبناء APK/IPA جديد إلا عند:
   - تغيير `capacitor.config.ts` (splash / status bar / permissions)
   - إضافة أو تحديث Capacitor plugins
   - تغيير أيقونة أو splash screen
   - أول رفع للمتجر

## البناء والنشر للمتاجر

### iOS (App Store)

```bash
bun run mobile:release:ios   # cap sync ios && cap open ios
```

في Xcode:
1. اختر جهازك أو `Any iOS Device`.
2. **Signing & Capabilities** → اختر Team.
3. عدّل `Bundle Identifier` إن رغبت (الحالي: `app.hrhbs.aqari`).
4. Product → Archive → Distribute App → App Store Connect.

### Android (Google Play)

```bash
bun run mobile:release:android   # cap sync android && cap open android
```

في Android Studio:
1. Build → Generate Signed Bundle / APK → **Android App Bundle (.aab)**.
2. أنشئ keystore جديد (احتفظ به بأمان — لا يمكن استبداله بعد النشر).
3. ارفع الملف الناتج إلى Google Play Console.

## أيقونات وشاشات البداية

بعد `cap add`، ضع:
- `resources/icon.png` — 1024×1024 PNG بدون شفافية
- `resources/splash.png` — 2732×2732 PNG (المركز فقط سيظهر)

ثم:
```bash
bunx @capacitor/assets generate
```

يولّد جميع المقاسات المطلوبة تلقائياً لـ iOS و Android.

## الوضع البديل: تطبيق أوفلاين بالكامل (بدون remote URL)

لبناء تطبيق مستقل عن الويب:

1. احذف كتلة `server` من `capacitor.config.ts`.
2. `bun run build` — يُنشئ `dist/` بمحتوى ثابت.
3. `bun run cap:sync` — يغلّف `dist/` داخل التطبيق.

**تحذير:** المشروع يستخدم TanStack Start مع SSR/server functions، والوضع الأوفلاين يعطّل جميع server functions (المصادقة، قاعدة البيانات، AI). لا يُنصح به لهذا التطبيق.

## الأوامر المتاحة

| الأمر | ما يفعله |
|---|---|
| `bun run cap:add:ios` / `cap:add:android` | إنشاء مشروع أصلي لأول مرة |
| `bun run cap:sync` | مزامنة الإعدادات + الـplugins مع iOS/Android |
| `bun run cap:open:ios` / `cap:open:android` | فتح المشروع في Xcode / Android Studio |
| `bun run cap:run:ios` / `cap:run:android` | تشغيل على محاكي/جهاز مباشرة |
| `bun run cap:update` | تحديث نسخ Capacitor + plugins |
| `bun run cap:doctor` | تشخيص إعدادات البيئة الأصلية |
| `bun run mobile:release:ios` | تحضير iOS للنشر (sync + فتح Xcode) |
| `bun run mobile:release:android` | تحضير Android للنشر |

## المعرّفات الحالية

- **App ID (iOS/Android)**: `app.hrhbs.aqari`
- **App Name**: `Aqari`
- **Production URL**: `https://project--a9ead090-32b6-464c-a919-22a1f97a0364.lovable.app`
- **Splash background**: `#020617` (يطابق ثيم `theme-tech`)
- **StatusBar style**: DARK

لتعديل أي من هذه القيم، حرّر `capacitor.config.ts` ثم `bun run cap:sync`.
