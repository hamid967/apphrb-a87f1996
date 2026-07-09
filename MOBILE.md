# تطبيقات الجوال — HBSpro (iOS + Android)

المنصة جاهزة الآن للعمل كتطبيق جوال بمسارين:

## 1) PWA (تثبيت فوري بدون متاجر)

مُفعّل مسبقاً — أي مستخدم يستطيع تثبيت التطبيق مباشرة من المتصفح:

- **iPhone (Safari):** زر المشاركة ← "إضافة إلى الشاشة الرئيسية".
- **Android (Chrome):** القائمة ← "تثبيت التطبيق" / "Add to Home screen".

يظهر بأيقونة مستقلة، شاشة splash، ويعمل بوضع standalone بدون شريط المتصفح.
لا يحتاج نشر على المتاجر ولا رسوم.

## 2) تطبيق أصلي عبر Capacitor (App Store + Google Play)

تم تجهيز مشروع Capacitor يُغلّف نفس الموقع داخل تطبيق أصلي. النشر على المتاجر يتم من جهازك المحلي.

### المتطلبات
- **iOS:** جهاز macOS + Xcode 15+ + حساب Apple Developer ($99/سنة).
- **Android:** Android Studio (يعمل على Windows/macOS/Linux) + حساب Google Play Console ($25 مرة واحدة).
- Node.js 18+ و Bun أو npm.

### الخطوات (على جهازك المحلي)

```bash
# 1) استنسخ المشروع من GitHub (استخدم زر GitHub في أعلى Lovable لربطه أولاً)
git clone <repo-url> && cd <repo>
bun install

# 2) أضف المنصّات (مرة واحدة فقط)
bunx cap add ios
bunx cap add android

# 3) بناء الأصول (اختياري إذا كنت تستخدم server.url أثناء التطوير)
bun run build

# 4) مزامنة أي تغييرات (كوّد أو حزم جديدة) مع المشاريع الأصلية
bunx cap sync

# 5) فتح المشروع في IDE الأصلي
bunx cap open ios       # يفتح Xcode
bunx cap open android   # يفتح Android Studio
```

من داخل Xcode أو Android Studio: اختر جهازاً (محاكي أو حقيقي) واضغط Run.

### وضع التطوير الحالي
`capacitor.config.ts` يشير حالياً إلى **رابط المعاينة** في Lovable، أي أن التطبيق الأصلي يحمّل الموقع الحيّ داخل الغلاف الأصلي. أي تعديل في Lovable يظهر فوراً في التطبيق بدون إعادة بناء.

### وضع الإنتاج (قبل النشر على المتاجر)
1. انشر الموقع من زر **Publish** في Lovable.
2. عدّل `capacitor.config.ts`: استبدل `server.url` برابط النشر (مثلاً `https://your-project.lovable.app` أو نطاقك المخصّص)، أو **احذف كتلة `server` بالكامل** لتضمين الأصول محلياً من `dist/`.
3. شغّل `bun run build && bunx cap sync`.
4. في Xcode: Product → Archive → Distribute App → App Store Connect.
5. في Android Studio: Build → Generate Signed Bundle/APK → App Bundle (.aab) → ارفعه إلى Play Console.

### تحديث `appId` و `appName`
افتراضياً: `app.hbspro.mobile` و `HBSpro`. غيّرهما في `capacitor.config.ts` **قبل** تشغيل `cap add` أول مرة.

### الأيقونات وشاشة البدء
Capacitor يستخدم `public/icon-512.png` و `public/apple-touch-icon.png` كنقطة بداية. لأيقونات متجرية جاهزة استخدم:
```bash
bunx @capacitor/assets generate --iconBackgroundColor '#020617' --splashBackgroundColor '#020617'
```
(يتطلّب `bun add -d @capacitor/assets` وصورة مصدر `assets/icon.png` بحجم 1024×1024).
