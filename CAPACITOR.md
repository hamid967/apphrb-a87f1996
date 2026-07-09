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

---

## توقيع التطبيق — أين تُخزَّن الشهادات وكيف تُستخدم

**تحذير أمني:** ملفات التوقيع (`.p12`, `.mobileprovision`, `.jks`, `.keystore`) وكلمات مرورها **لا تُرفع أبداً إلى Git ولا إلى Lovable Cloud**. تُخزَّن محلياً على جهاز البناء، وفي CI عبر متغيرات بيئة مشفّرة (GitHub Actions Secrets / Bitrise / Codemagic).

### 1) هيكل مجلد الشهادات المحلي

أنشئ هذا المجلد **خارج المستودع** (مثلاً في `~/.aqari-signing/`) أو داخله ضمن `signing/` مع `.gitignore` صارم:

```
signing/                         ← مضاف إلى .gitignore
├── ios/
│   ├── AqariDistribution.p12           # شهادة التوزيع (Apple)
│   ├── Aqari_AppStore.mobileprovision  # ملف provisioning للنشر
│   └── ExportOptions.plist             # خيارات التصدير من Xcode
└── android/
    ├── aqari-release.keystore          # مفتاح توقيع Google Play
    └── keystore.properties             # كلمات المرور (خارج Git)
```

أضف السطور التالية إلى `.gitignore` في جذر المشروع:

```gitignore
# Native signing — never commit
signing/
ios/App/App.xcworkspace/xcuserdata/
ios/App/Pods/
android/keystore.properties
android/app/*.keystore
android/app/*.jks
android/.gradle/
*.p12
*.mobileprovision
*.jks
*.keystore
```

### 2) iOS — إعداد التوقيع

#### أ) الحصول على الشهادات (مرة واحدة)

من **Apple Developer Portal** → Certificates, Identifiers & Profiles:
1. أنشئ **iOS Distribution Certificate** → صدّرها من Keychain كـ `.p12` بكلمة مرور قوية.
2. سجّل **App ID** = `app.hrhbs.aqari`.
3. أنشئ **App Store Provisioning Profile** → نزّله كـ `.mobileprovision`.
4. احفظ الملفَين داخل `signing/ios/`.

#### ب) متغيرات البيئة المطلوبة (للـCI أو fastlane)

| المتغير | الوصف | مثال |
|---|---|---|
| `IOS_P12_BASE64` | شهادة التوزيع مُرمَّزة base64 | `base64 -i AqariDistribution.p12 \| pbcopy` |
| `IOS_P12_PASSWORD` | كلمة مرور ملف `.p12` | `••••••••` |
| `IOS_PROVISIONING_PROFILE_BASE64` | ملف provisioning مُرمَّز | `base64 -i Aqari_AppStore.mobileprovision \| pbcopy` |
| `IOS_TEAM_ID` | معرّف فريق Apple Developer | `A1B2C3D4E5` |
| `IOS_BUNDLE_ID` | معرّف الحزمة | `app.hrhbs.aqari` |
| `APPLE_ID` | إيميل حساب Apple للنشر | `admin@hrhbs.com` |
| `APPLE_APP_SPECIFIC_PASSWORD` | كلمة مرور خاصة بالتطبيق ([appleid.apple.com](https://appleid.apple.com) → Security) | `xxxx-xxxx-xxxx-xxxx` |
| `ASC_KEY_ID` | App Store Connect API Key ID | `ABCD1234` |
| `ASC_ISSUER_ID` | App Store Connect Issuer ID | UUID |
| `ASC_KEY_BASE64` | `.p8` API Key مُرمَّز base64 | ملف من App Store Connect |

#### ج) التوقيع اليدوي في Xcode

1. افتح `ios/App/App.xcworkspace`.
2. Signing & Capabilities → **Automatically manage signing** = ON.
3. Team = فريقك، Bundle Identifier = `app.hrhbs.aqari`.
4. Product → Archive → Distribute App → App Store Connect.

### 3) Android — إعداد التوقيع

#### أ) إنشاء keystore (مرة واحدة، احفظه للأبد)

```bash
keytool -genkey -v \
  -keystore signing/android/aqari-release.keystore \
  -alias aqari \
  -keyalg RSA -keysize 2048 -validity 10000
```

**تحذير:** فقدان الـkeystore = عدم القدرة على تحديث التطبيق على Google Play إلى الأبد. خذ نسخة احتياطية مشفّرة في مكانين مختلفين (مثلاً 1Password + قرص خارجي).

#### ب) ملف `signing/android/keystore.properties`

```properties
storeFile=../../signing/android/aqari-release.keystore
storePassword=YOUR_STORE_PASSWORD
keyAlias=aqari
keyPassword=YOUR_KEY_PASSWORD
```

#### ج) ربط `android/app/build.gradle` بالـkeystore

بعد `bun run cap:add:android`، عدّل `android/app/build.gradle`:

```gradle
def keystorePropertiesFile = rootProject.file("../signing/android/keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    signingConfigs {
        release {
            storeFile file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
        }
    }
}
```

#### د) متغيرات البيئة المطلوبة (للـCI)

| المتغير | الوصف |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | ملف keystore مُرمَّز — `base64 -i aqari-release.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | كلمة مرور الـkeystore |
| `ANDROID_KEY_ALIAS` | `aqari` |
| `ANDROID_KEY_PASSWORD` | كلمة مرور الـalias |
| `GOOGLE_PLAY_JSON_KEY_BASE64` | Service Account JSON من Google Cloud Console (لرفع تلقائي عبر fastlane/Gradle Play Publisher) |

#### هـ) البناء اليدوي

```bash
cd android
./gradlew bundleRelease
# الناتج: android/app/build/outputs/bundle/release/app-release.aab
```

ارفع `.aab` إلى Google Play Console → Production → Create new release.

### 4) الأتمتة عبر سكربتات جاهزة

المشروع يتضمّن سكربتات في `scripts/signing/` تفكّ تشفير المتغيرات وتضع الملفات في مكانها الصحيح تلقائياً:

| السكربت | الأمر المختصر | ما يفعله |
|---|---|---|
| `scripts/signing/restore-ios.sh` | `bun run signing:restore:ios` | يفك `IOS_P12_BASE64` و`IOS_PROVISIONING_PROFILE_BASE64` إلى `signing/ios/`، ويستورد الشهادة في keychain مؤقّت على macOS |
| `scripts/signing/restore-android.sh` | `bun run signing:restore:android` | يفك `ANDROID_KEYSTORE_BASE64` إلى `signing/android/aqari-release.keystore` ويُنشئ `keystore.properties` تلقائياً + التحقق عبر `keytool` |
| `scripts/signing/restore-all.sh` | `bun run signing:restore` | يستدعي الاثنين (يتخطّى iOS خارج macOS إلا مع `FORCE_IOS=1`) |

سكربتات البناء الجاهزة أصبحت تستدعيها تلقائياً قبل `cap sync`:

```bash
bun run mobile:release:ios      # signing:restore:ios → cap sync ios → cap open ios
bun run mobile:release:android  # signing:restore:android → cap sync android → cap open android
bun run mobile:ci:android       # للـCI: restore → cap sync → gradlew bundleRelease
```

#### مثال GitHub Actions

```yaml
- name: Restore signing artifacts
  run: bun run signing:restore
  env:
    IOS_P12_BASE64:                  ${{ secrets.IOS_P12_BASE64 }}
    IOS_P12_PASSWORD:                ${{ secrets.IOS_P12_PASSWORD }}
    IOS_PROVISIONING_PROFILE_BASE64: ${{ secrets.IOS_PROVISIONING_PROFILE_BASE64 }}
    ANDROID_KEYSTORE_BASE64:         ${{ secrets.ANDROID_KEYSTORE_BASE64 }}
    ANDROID_KEYSTORE_PASSWORD:       ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
    ANDROID_KEY_ALIAS:               ${{ secrets.ANDROID_KEY_ALIAS }}
    ANDROID_KEY_PASSWORD:            ${{ secrets.ANDROID_KEY_PASSWORD }}
    GOOGLE_PLAY_JSON_KEY_BASE64:     ${{ secrets.GOOGLE_PLAY_JSON_KEY_BASE64 }}

- name: Build Android release bundle
  run: bun run mobile:ci:android
```

السكربتات ترفض العمل إن كان أي متغير مطلوب مفقوداً، وتضبط أذونات الملفات على `600` تلقائياً، وتتحقق من صحة الـkeystore عبر `keytool` قبل المتابعة.


### 5) قائمة تحقق قبل أول نشر

- [ ] `.gitignore` يحجب مجلد `signing/` و`*.keystore` و`*.p12`
- [ ] نسخة احتياطية مشفّرة من الـkeystore محفوظة في مكانين
- [ ] كلمات المرور محفوظة في مدير كلمات مرور (1Password/Bitwarden)
- [ ] `IOS_TEAM_ID` و`IOS_BUNDLE_ID` مطابقان لما في Apple Developer
- [ ] Google Play Console: تم إنشاء التطبيق بنفس `app.hrhbs.aqari`
- [ ] Apple App Store Connect: تم إنشاء التطبيق بنفس Bundle ID
- [ ] `Aqari` مضاف كـ App Name في المنصّتين



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
