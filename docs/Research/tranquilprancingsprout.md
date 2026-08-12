# תוכנית המשך — VetTrack RN אל שתי החנויות (G3 → G4 → G5)

> **סטטוס:** מוכן לאישור. שני חלקים:
> **חלק א'** — מפת-דרכים G3→G4→G5 אל שתי החנויות (הנתיב-הקריטי; ההחלטות שלך מסגרות אותו).
> **חלק ב'** — ADR מוצע: חיבור מד-הספק הפיזי ל-app דרך backend + middleware (מסלול docking-P4, **מחוץ** לנתיב-הקריטי של החנות).
> כל העובדות אומתו מול קוד אמיתי בשני המאגרים (אודיט מקצה-לקצה).

---

## Context — למה התוכנית הזו, ומה הפלט הרצוי

**במשפט אחד:** אנחנו לוקחים את אפליקציית ה-React Native (היורשת של VetTrack) מהמצב הנוכחי — G3 גמור-בקוד אבל לא-מאושר-על-מכשיר — ומריצים אותה דרך סדר השערים הקפוא עד לנקודה שבה **הדבר היחיד שנשאר הוא שהבעלים ילחץ "העלה"** בשתי החנויות (App Store + Google Play), כשאנדרואיד הוא הערוץ המוביל.

**מה הניע את זה:** ה-NORTH_STAR של הפרויקט הוא "שתי הגשות לחנויות ב-review → ואז ממשיכים את תוכנית 2.0 (Task 1.2 — Case Spine)". תוכנית 2.0 קפואה עד ששתי ההגשות ב-review. המשימה: לבסס איפה אנחנו עומדים, ולכתוב תוכנית המשך שסופה "מוכן-להעלאה", כולל **אודיט ודיבאג מקצה-לקצה** על שני המאגרים.

**שני מאגרים מעורבים:**
- `/Users/dan/VetTrack-RN-Migration` — אפליקציית ה-RN/Expo SDK 57 (היעד; ה-frontend + client).
- `/Users/dan/vettrack` — השרת (Express/Postgres/Drizzle), ה-`packages/contracts` המשותף, וכל תיעוד היעד/החנויות. עבודת השרת של G4 (push) נעשית כאן.

**הבר המדויק (מ-NORTH_STAR):** "ב-review", לא "live". זה חשוב — התוכנית לא צריכה להביא לאפליקציה מפורסמת, אלא להגשה שנכנסה לתור הביקורת.

---

## החלטות בעלים (נלקחו בסשן הזה — מסגרות את כל התוכנית)

1. **סדר עבודה = הסולם הקפוא במלואו, G3 → G4 → G5, לפי הסדר.** לא מקדימים את G5 (חנויות) לפני G4. בונים native push, Code Blue ו-offline מלא **לפני** ההגשה. הבעלים דחה במפורש את האופציה לשחרר את אפליקציית ה-RN מוקדם, לפני שלמות G4.
2. **זהות בחנות = מחזור `uk.vettrack.app`.** כשאפליקציית ה-RN תעלה, היא יורשת את הרשומה הקיימת ב-App Store Connect וב-Google Play (שוק עברי, ביקורות, דירוג). לכן:
   - ה-bundle id / package של אפליקציית ה-RN משתנה מ-`uk.vettrack.rnmigration` ל-`uk.vettrack.app`.
   - מספר ה-build ב-iOS חייב לעלות ל-**≥27** (האפליקציה החיה נמצאת ב-build 26).

**משמעות:** זו **מפת-דרכים המשך** (G4 הוא הנדסה אמיתית — push הוא עבודת-שרת חדשה), לא טענה שסשן יחיד מגיע ל"מוכן-להעלאה". הסשן הזה מייצר את התוכנית והאודיט; הביצוע נפרש על פני השערים.

---

## מצב נוכחי — מאומת (לא לגזור מחדש)

**סטאק (מ-`package.json` + native מיוצר):** Expo SDK ~57.0.9 · React Native 0.86.2 · React 19.2.3 · New Architecture (Bridgeless) — **חובה** · זרימת **CNG/prebuild** · npm · Node ≥22.13.

**עובדה קריטית שאומתה ידנית:** תיקיות ה-native `android/` ו-`ios/` הן **gitignored** (`.gitignore:42-43`, "generated native folders") ו-`git ls-files android ios` = **0**. כלומר הן **תוצר של prebuild — לא מקור-אמת**. כל תצורת ה-native (bundle id, versionCode/buildNumber, מפתחות Info.plist, entitlements, privacy manifest, signing) נשלטת מ-**`app.json` + config-plugins + `expo-build-properties` + EAS credentials**, ולעולם לא ע"י עריכת קבצים תחת `android/`/`ios/` (prebuild מוחק אותם). *(תיקון לדוח אודיט אחד שהניח בטעות שקבצי ה-native מחויבים.)*

**סטטוס השערים (G0→G5, מקור-אמת = `~/.claude/plans/goofy-mapping-hellman.md` — ה-Master Anchor):**
- **G1 (יסודות)** — ✅ גמור. סלייסים 0–7 מוזגו, CI ירוק. פתוח יחיד: קריאת NTAG אמיתית (חסום-חומרה).
- **G2 (Hero flow)** — ✅ עבר 2026-08-07 (PR #17). p95 UI 11.09ms; 0/2886 dropped; cold-to-Home 260ms; פסק-דין עיוור של הבעלים = "RN".
- **G2.5 (שפת עיצוב Aurora)** — ✅ מימוש הושלם 2026-08-07; exit bar עבר על מכשיר.
- **G3 (Daily-driver parity)** — 🟡 **גמור-בקוד, השער לא עבר.** כל 13 הסלייסים מוזגו (כולל Slice-13 iPad). שערים אוטומטיים ירוקים: tsc 0 שגיאות, eslint 0 אזהרות, 72 חבילות/667 טסטים, `expo export` iOS נקי. **השער היחיד שנותר: פסק-דין daily-driver של הבעלים על מכשיר — Pixel 7 (Android) + iPhone 16 Plus (iOS)** — לא-רץ (`docs/g3-results.md` §5, שורות הפסק-דין ריקות). נלווים: סריקת RTL (he+en), נקודתי G2Measure על artifact של release, וצילומי Slice-13 landscape/en-LTR.
- **G4 (Code Blue + offline + parity)** — 🔴 **כמעט לא בנוי.** רק חתיכה אחת "zero-regret" בתהליך: emergency-block classifier, ענף `feat/g4-emergency-block-classifier` / PR #24. Native push (APNs+FCM) = עבודת-שרת חדשה. **Critical Alerts entitlement — נעדר, מעולם לא הוגשה בקשה** (אישור אפל בזמן לא-חסום → יש להתחיל עכשיו).
- **G5 (RN אל החנויות)** — 🔴 לא התחיל.

**כלים / auth:**
- `asc` (Apple) — ✅ **מאומת.** האישור נקרא ממש `vettrack-resubmit`; הרשומה היחידה ב-ASC היא `uk.vettrack.app` (id 6778937527), builds עד 26. → תומך בהחלטת "מחזור".
- `gplay` (Google Play) — ⚠️ **לא-מאומת** (0 פרופילים). הבעלים חייב לספק Service-Account JSON. **לא המשימה שלי** (הנפקת סודות = של הבעלים).
- **אין `eas.json`** בשום מקום; אין קישור EAS project. מסלול ה-build צריך להיווצר מאפס (מומלץ EAS — פותר את חסם ה-signing; חלופה מקומית: gradle/Xcode + gplay/asc).

**הסיכון הפונקציונלי הגבוה ביותר (עמוד-שדרה לדיבאג):** `authFetch` נכשל-סגור — בלי Clerk JWT תקף הוא זורק `AUTH_INVALID` לפני כל קריאת-רשת, ו-`BootstrapGate` חוסם מתחת ל-Home. **בודק בחנות שפותח את האפליקציה בלי login עובד יראה מסך re-auth / רשימות ריקות → דחיית App Review 4.2 ("האפליקציה לא עובדת").** נתיב reviewer/demo עובד עם `EXPO_PUBLIC_API_ORIGIN` production הוא **deliverable מדרגה-ראשונה**, לא הערת-שוליים.

---

## פלט האודיט — רשימת החסמים לחנות (מתוקנת למיקומי-תיקון נכונים)

כל אלה הם חוסרים אמיתיים; המיקום לתקן כל אחד הוא app.json/plugin/EAS (לא קבצי native):

| # | חוסר | מיקום תיקון נכון |
|---|---|---|
| P0 | bundle-id → `uk.vettrack.app` | `app.json` `ios.bundleIdentifier` + `android.package` |
| P0 | iOS buildNumber ≥27 · Android versionCode strategy | `app.json` `ios.buildNumber` / `android.versionCode` (או EAS remote versioning) |
| P1 | `ITSAppUsesNonExemptEncryption=false` | `app.json` `ios.infoPlist` |
| P1 | iOS Privacy Manifest `PrivacyInfo.xcprivacy` | `app.json` `ios.privacyManifests` |
| A1 | Android release **signing** (כרגע debug keystore בקובץ מיוצר) | EAS-managed credentials **או** config-plugin / `expo-build-properties` — **לא** app.json, **לא** עריכת `build.gradle` המיוצר |
| A4 | לעקוב ולהסיר `SYSTEM_ALERT_WINDOW` (מגיע מ-manifest-merge של תלות/plugin) | trace המקור, ואז blocklist דרך `android.permissions` או plugin |
| P6 | Data Safety form + privacy-policy URL + account-deletion URL | Play Console (owner) + wiring ב-RN |
| P9 | חיווט `DELETE /api/users/delete-account` באפליקציית ה-RN | קוד RN + `wiring` skill |
| P8 | צילומי מסך 6.9" iPhone + 13" iPad (חובה בגלל `supportsTablet:true`) | argent על מכשיר |
| — | build עם Xcode 26 / iOS 26 SDK — שדרוג-ה-SDK המכוון היחיד שהסטאק הקפוא מתיר | חלון G5 |
| — | targetSdk 36 | ✅ כבר מתקיים (אומת ב-merged manifest) |

---

## Owner-remainder — מה נשאר בידי הבעלים בלבד (לא לתת הבטחת-יתר)

פריטים שאני **לא** יכול לסגור — הם ports/credentials/calendar/מכשיר-פיזי:
- פסקי-הדין על מכשיר: G3 daily-driver (Pixel 7 + iPhone 16 Plus), ואחר כך G4.
- `gplay` auth (Service-Account JSON).
- מפתח ה-release keystore + סיסמאות + הרשמה ל-Play App Signing.
- **מכשיר Android פיזי 10+** (דווח שלבעלים אין — נדרש ל-Play device-access ולשער-על-מכשיר; emulators נדחים).
- אימות זהות ב-Google Play (ימים).
- **12 בודקים × 14 ימים רצופים** בבדיקה סגורה (חל רק אם חשבון ה-Play אישי/אחרי 2023-11-13 — הבעלים חייב לאשר סוג-חשבון; זה הפריט עם ה-lead הארוך ביותר).
- אישור Critical Alerts מאפל (זמן לא-חסום).
- פעולות ההעלאה הסופיות עצמן.

---

## תיקוני-מצב שמשנים היקף (אמת מול הקוד — אל תחזור על עבודה סגורה)

1. **ה-emergency-block classifier כבר מוזג ל-`main`** (`src/lib/emergency-block.ts`, מחווט ב-`src/lib/auth-fetch.ts:120`). PR #24 מיושן. חתיכת ה-"zero-regret" של G4 **גמורה**; עבודת ה-Code Blue הנותרת מתחילה מה-viewer.
2. **בקשת Critical Alerts כבר הוגשה** (2026-08-07, Apple Request ID `763HU9ZH38`). הפריט מתפצל לשלושה חוטים נפרדים: (a) אישור אפל — *הוגש, זמן לא-חסום, לעקוב ב-ASC*; (b) חיווט מפתח ה-entitlement ב-`app.json` `ios.entitlements` — **לא בוצע**, תלוי ב-(a); (c) פרויקט FCM + credentials של APNs `.p8` — **לא בוצע**, lead ארוך.
3. **P3 (Xcode 26 / iOS 26 SDK) — מסופק (מאומת קשיח 2026-08-10).** `xcode-select -p` → `/Applications/Xcode.app`; `xcodebuild -version` → **Xcode 26.5 (build 17F42)** פעיל. סביבת ה-build כבר נושאת את iOS 26 SDK (עולה בקנה אחד עם `docs/g3-results.md` §7.3, בנייה על סים iOS 26.4). → **P3 מסומן; שדרוג ה-RN/Expo המכוון יורד מהנתיב-הקריטי** (נשאר היגיינת support-window אופציונלית). לאמת ב-archive עצמו ב-G5.
4. **חשבון reviewer הוא חסם מדרגה-ראשונה** — `BootstrapGate` דורש `role ≥ student` + `currentUserId`, ומסכים תלויי-משמרת מחזירים ריק/403 כשהחשבון לא משובץ למשמרת חיה. reviewer שנכנס לחשבון לא-משובץ רואה קיר של מסכים ריקים → דחיית 4.2. ה-`dev-auth` seam לא עוזר (הוא `__DEV__`-only ומסרב כשיש Clerk key).

---

## Phase G3-CLOSE — להפוך את פסק-הדין-על-מכשיר של הבעלים לבר-הרצה ומתועד

G3 גמור-בקוד; השער הוא פסק-דין daily-driver בכתב על Pixel 7 + iPhone 16 Plus מול production, + שלושה artifacts פתוחים. הכול כאן הוא הכנה כדי שהבעלים יוכל להריץ את השער.

- **G3C-1 — נתיב reviewer/demo מול production (חסם; שורש עמוד-שדרה הדיבאג).** ב-vettrack/Clerk: חשבון demo ייעודי least-privilege, role `technician`, **משובץ למשמרת סינתטית חיה**, נתוני-קליניקה זרועים, אימייל/סיסמה (לא OAuth). לוודא ש-`EXPO_PUBLIC_API_ORIGIN=https://vettrack.uk` צרוב ב-artifact ושה-Clerk key אמיתי (כדי ש-`dev-auth` יישאר inert). **Skills:** `wiring`, `clerk-expo`, `systematic-debugging`, `verification-before-completion`.
- **G3C-2 — סריקת סימולטור עם argent ל-artifacts.** צילומי landscape (iPad 11"+13") + מעבר `en` LTR + סריקת `he` RTL של זרימות Grade-A. auth בסים דרך `EXPO_PUBLIC_DEV_AUTH=1` + dev-bypass מקומי (dev-only). **Skills:** `argent-test-ui-flow`, `argent-device-interact`, `hebrew-rtl-best-practices`, `react-native-design`.
- **G3C-3 — הכנת נקודתי G2Measure.** לאמת שחוזה ה-harness שלם ב-`main`; לתעד את פרוטוקול הבעלים (השוואה מול הרצפה ≈11.08ms). מדידת-רצפה היא **על מכשיר פיזי** (הרצת-סים מנפחת renders ~×3). **Skills:** `argent-react-native-profiler`, `react-native-best-practices`.
- **G3C-4 — run-book + שתי שורות פסק-הדין.** בנייות RN חתומות מותקנות על שני המכשירים, מכוונות ל-production, חשבון demo מוכן → הבעלים ממלא `docs/g3-results.md` §5.3.
- **Exit:** §5.3 שתי שורות פסק-דין מלאות; §7.4 captures מצורפים; שערים אוטומטיים ירוקים.

---

## Phase G4 — Code Blue + native push + offline מלא (נבנה **לפני** ההגשה)

דוקטרינה קפואה: אין תור-offline לחירום; מוטציות Code Blue נכשלות-בקול offline; אין התאוששות-polling; אין סיום-מקומי אופטימי (ה-UI עוקב אחר אישור-שרת); push = התראה בלבד, לעולם לא ערוץ-מצב (ADR-009). כל סלייס טוען Tier-1 RN קודם + סעיף Skills-compliance ב-PR. הניווט הוא `@react-navigation` v7 (לא `expo-router`).

- **G4-0 — חוט credential/החלטה ארוך-lead (להתחיל עכשיו, רובו של הבעלים).** (a) לעקוב אחר אישור Critical Alerts; (b) **החלטת-בעלים פתוחה: מה זה "דחוף" באנדרואיד** — אין מקבילה ל-Critical Alerts; ערוצי-notification בלתי-משתנים אחרי יצירה (דלת חד-כיוונית) → אי-אפשר לבנות את ערוץ ה-production/FCM לפני ההחלטה; (c) פרויקט FCM + APNs `.p8` בשרת. **Skills:** `eas-app-stores`, `asc-cli-usage`, `evaluating-trade-offs`.
- **G4-1 — Code Blue read-only viewer (בטוח-דוקטרינה, בלי תלות-שרת).** קריאות לא-חסומות; טריות = SSE + reconciliation חסום בלבד; לעולם לא לשמור תגובות-חירום ב-cache. **Skills:** Tier-1 RN, `wiring`, `expo-data-fetching`.
- **G4-2 — native push: נתיב-שרת דו-כיווני (vettrack) + contracts bump.** החתיכה הגדולה: migration ל-`vt_push_subscriptions` (עמודות token מתויגות-פלטפורמה), הסתעפות ה-Zod validator (`server/routes/push.ts:28` דוחה כרגע כל non-URL), שני נתיבי-שליחה (`server/lib/push.ts` הוא web-push בלבד → להוסיף APNs+FCM), הסתעפות ~10 קוראי `sendPush*`. ADR-009 proposed→accepted. bump ל-`@vettrack/contracts` (RealtimeEnvelope + payload). **הנתיב האנדרואידי חייב להמתין להחלטת G4-0b.** **Skills:** `wiring`, `systematic-debugging`, `expo-module`.
- **G4-3 — push בצד-לקוח מאחורי `AlertingPort` (RN).** רכישת token, מכונת-מצבי-הרשאה (כולל `criticalAlert`), payload `interruption-level: critical`. **אל תיצור את ערוץ ה-production האנדרואידי** עד G4-0b. **Skills:** Tier-1 RN, `expo-dev-client`, `argent-settings-permissions`, `wiring`.
- **G4-4 — consumer של reset→snapshot resync (גנרי, equipment-first).** המכונה שה-Code Blue reconciliation ממחזר. **Skills:** Tier-1 RN, `wiring`, `expo-data-fetching`.
- **G4-5 — מסכי מוטציות Code Blue (start/log/end/presence) — תוכן שער G4.** UX של loud-offline מעל ה-classifier המחווט, סיום מאושר-שרת, התאוששות replay. **Skills:** Tier-1 RN, `systematic-debugging`, `wiring`, `verification-before-completion`.
- **G4-6 — תור-כתיבה offline / replay (parity מלא).** החוזה קיים (`packages/contracts/src/pending-sync.ts`). מנוע op-sqlite. לעולם לא לתייר endpoint חירום. **Skills:** Tier-1 RN, `react-native-architecture`, `systematic-debugging`.
- **Exit:** no-go של Code Blue נסגר (מאושר-שרת, loud-offline, replay); push מספק התראה גלויה מקצה-לקצה בשתי הפלטפורמות; יישור 16KB מחזיק ב-AAB האמיתי הראשון.

---

## Phase G5 — מוכנות-חנות (P1–P9) + הגירת-זהות + `eas.json` + נתיב reviewer

כל תצורת native מ-`app.json`/plugins/`expo-build-properties`/EAS — לעולם לא מקבצי native מיוצרים.

- **G5-1 — הגירת-זהות.** `app.json`: `ios.bundleIdentifier` + `android.package` → **`uk.vettrack.app`**; `version` `0.1.0` → **≥`1.3.0`** (חי = 1.2.0); `ios.buildNumber` → **≥`"27"`** (חי = 26); `android.versionCode` → גדול מכל ערך שהועלה אי-פעם (headroom נקי כמו `10300`). **תוצאה א-סימטרית ל-deep-links:** iOS — `server/index.ts:326` כבר `87F5G378M6.uk.vettrack.app` → אין שינוי-שרת; Android — `server/lib/well-known-assetlinks.ts` נעוץ ל-SHA-256; keystore חדש שובר קישורים עד שמוסיפים את ה-SHA-256 של Play App Signing ומ-redeploy. **Skills:** `eas-app-stores`, `asc-cli-usage`, `gplay-cli-usage`.
- **G5-2 — מפתחות iOS (הכול ב-app.json).** P1 Privacy Manifest דרך `ios.privacyManifests` (חייב מדויק לקודי-ה-API בפועל, לא נוכחות בלבד); `ios.infoPlist.ITSAppUsesNonExemptEncryption=false`; P3 בדיקת iOS-26-SDK (תיקון-מצב 3); P2 age-rating + P8 צילומים (6.9" iPhone + **13" iPad חובה** בגלל `supportsTablet`). **Skills:** `eas-app-stores`, `asc-release-flow`.
- **G5-3 — Android (plugin/EAS, לא gradle מיוצר).** **signing מומלץ EAS-managed** (פותר את חסם ה-keystore). `SYSTEM_ALERT_WINDOW`: **trace קודם** (manifest-merger report) ואז blocklist דרך `android.blockedPermissions`. targetSdk 36 כבר מתקיים. **Skills:** `gplay-gradle-build`, `eas-app-stores`.
- **G5-4 — לכתוב `eas.json`** (profile `production`: builds + `submit`; signing EAS-managed). חלופה מקומית: CNG+Xcode/gradle + `asc` (מאומת) + `gplay` (בעלים חייב לספק service-account). **Skills:** `eas-app-stores`, `eas-workflows`.
- **G5-5 — P9 מחיקת-חשבון ב-RN + P6 Data Safety.** לחווט `DELETE /api/users/delete-account` (Apple רוצה initiation בתוך-האפליקציה; Google מקבל קישור לעמוד המחיקה הקיים). טופס Data Safety (הצהרת push-token תתהפך ל-"Yes" כש-G4 push עולה). **Skills:** `wiring`, `gplay-metadata-sync`.
- **Exit:** P1–P9 סגורים ברמת-config; artifacts חתומים; **`gplay preflight` ירוק על ה-AAB**; שתי הרשומות מוכנות עם metadata+screenshots; נשארות רק פעולות ההעלאה של הבעלים.

---

## עמוד-שדרה הדיבאג הפונקציונלי (רץ לאורך שלושת השערים, לא צעד)

הסיכון העליון: להוכיח שהאפליקציה **באמת עובדת** ל-reviewer. טעינת `systematic-debugging` + `wiring` + `verification-before-completion` + `argent-*` לאורך כל הדרך.
1. **login אמיתי → נתונים אמיתיים-למראה** (מקור ב-G3C-1, מאומת בכל build): חשבון demo → עובר `BootstrapGate` → כל מסך Grade-A/B **מלא** (לא reauth, לא off-shift-ריק). על Pixel + iPhone דרך argent.
2. **push באמת מגיע** (G4-2/3): התראה גלויה מקצה-לקצה על iOS (APNs) + Android (FCM); לוודא שאינו נושא מצב-דומיין.
3. **מחיקת-חשבון באמת מוחקת** (G5-5): initiation → `DELETE` אמיתי → הנתונים נעלמים בשרת.
4. **deep-links נפתרים אחרי הגירת-הזהות** (G5-1): QR/NFC פותחים את אפליקציית ה-RN בשתי הפלטפורמות.

---

## נתיב-קריטי + רצף (פריטי lead ארוך מתחילים מוקדם, נסגרים מאוחר)

**להתחיל עכשיו אף שנסגרים מאוחר:** (1) אימות-זהות Google Play (ימים, נאכף 2026-09-30); (2) שעון 12×14 בודקים — אם החשבון אישי/אחרי 2023-11-13 (הבעלים חייב לאשר סוג-חשבון — הפריט הכי ארוך); (3) אישור Critical Alerts — לעקוב; (4) החלטת "דחוף" באנדרואיד (G4-0b); (5) חשבון demo משובץ-משמרת (G3C-1).

**נתיב מסודר:** G3C-1 → פסק-דין G3 → G4 (החלטת-0b → push שרת/לקוח, viewer → snapshot-resync → מסכי-מוטציות → תור-offline) → G5 (הגירת-זהות → מפתחות-compliance → eas.json/signing → redeploy assetlinks → מחיקת-חשבון) → הגשות מוכנות. במקביל: ארבעת פריטי-הלוח של הבעלים + טופסי P2/P6/P8.

---

## קבצים קריטיים (מפת-דרכים אל החנות)
- `VetTrack-RN-Migration/app.json` — כל תיקוני הזהות/compliance של G5.
- `VetTrack-RN-Migration/src/lib/auth-fetch.ts` — auth נכשל-סגור (שורש הדיבאג) + dispatch של emergency-block המחווט.
- `vettrack/server/routes/push.ts` + `server/lib/push.ts` — validator URL-בלבד + send lib web-push-בלבד ש-G4-2 מסתעף ל-APNs+FCM.
- `vettrack/server/lib/well-known-assetlinks.ts` + `server/index.ts:326` — מערך SHA-256 (נשבר על keystore) + AASA (כבר `uk.vettrack.app`).
- `VetTrack-RN-Migration/docs/g3-results.md` — שער הבעלים (§5 פרוטוקול, §5.3 ריק).
- קובץ חדש ל-G5: `VetTrack-RN-Migration/eas.json`.

---
---

# חלק ב' — זיהוי הסרת-ציוד: חיבור "המוצר" ל-app (מסלול מדורג — תוכנה קודם, חומרה אחר-כך)

> **מה זה, במשפט אחד:** לדעת אוטומטית שציוד "נעלם" ממיקום-המנוחה המוסכם שלו ולהתריע על כך **יזומה** — כדי שלא יחפשו אותו כשצריך אותו דחוף. זה החלק החסר של הדוקינג ("P4").
>
> **המסקנה משלושת מסמכי-המחקר:** השאלה אינה "איזה חיישן" אלא **"האם צריך חיישן בכלל בשלב הזה" — והתשובה: עדיין לא.** פאזה 1 = **תוכנה בלבד** (אות שכבר קיים אצלכם), אפס חומרה. רק אם לא מספיקה → פאזה 2 מוסיפה חיישן-מגע Zigbee. **שתי הפאזות מחוץ לנתיב-הקריטי של החנות** — אפשר להגיש בלעדיהן.

## Context — משפך שלושת המסמכים

- **מסמך 1** (`…a803155f…`): המליץ על מד-חשמל (תקע Athom, שבב HLW8032).
- **מסמך 2** (`…e2960056…`): **פוסל את HLW8032 לזיהוי-נוכחות** — עיוור מתחת ל-50mA (עומס 1–6W של "טעון-מלא" מתחת לסף), וגרוע מכך מדווח רעש-פנטום עד 3W כך שמכשיר **שהוסר נראה "נוכח"**. "צריכה=נוכחות" שבירה מיסודה. לנוכחות → חיישן פיזי; מד-חשמל (שבב טוב ADE7953/CSE7766) רק לאבחון סטטוס-טעינה משני.
- **מסמך 3** (`…bc920b6f…`, הסינתזה): **אל תתחיל בחומרה בכלל.** פאזה 1 = תוכנה על אות קיים; אם חומרה — **חיישן-מגע Zigbee (SONOFF SNZB-04P) + מגנט**, לא מד-חשמל/משקל/מצלמה/BLE/UWB.
- **האינווריאנטה שמגבילה כל חומרה:** "הוסר מהמקום" ≠ "יצא מהמחלקה". כל חיישן יורה גם על ניגוב / הזזה של 30 ס"מ / החלפת-סוללה. הפתרון **לוגי, לא פיזי**: debounce + מתאם עם checkout פעיל + grace. הלוגיקה נדרשת בכל מקרה → באה **ראשונה** → ולבדה עשויה להספיק. זו פאזה 1.
- **מה שביקשת — החיבור backend + middleware — הוא agnostic לחיישן** (תבנית ה-RFID). מסמך 3 מאשר במפורש: "Zigbee2MQTT → MQTT מקומי → adapter seam קיים → POST חתום HMAC-SHA256". לכן ויכוח-החומרה לא זז את עיצוב-החיבור.

## Phase 1 — תוכנה קודם (מאומת מול קוד; אפס חומרה; ROI הכי גבוה)

**Verdict מאומת (wiring audit):** האות `sweep_missing` **קיים ונורה, אבל מת ללא התראה יזומה.**
- מוגדר `server/services/equipment-anchor.service.ts:7` (אחד מ-4 `InvalidationReason`). נורה `server/routes/docking.ts:573` ו-`:588` (בטרנזקציית סריקת-חדר). **מת:** הנתיב מסתיים `docking.ts:606` אחרי `logAudit("room_swept")` בלבד — אין push/realtime/outbox. נראה **רק במשיכה** (bucket `missing`, `docking.service.ts:74`, דרך GET). `not_found_here` מת באותו מקום → אותו תיקון מכסה את שניהם.
- **התיקון (מתוקן מול ניסוח המסמך): emit קטן חדש על תשתית ה-push/realtime הקיימת — לא "חיבור-מחדש".** ה-worker היחיד שנוגע ב-`sweep_missing` (sweep-escalation) צורך את המשמעות ההפוכה (סימן = "נסרק" → **עוצר** הסלמה); לחבר אליו היה **משתיק** התראה. המודל להעתקה: **`server/workers/stale-returned-sweep.worker.ts`** (סורק anchors → `sendPushToRole`).
- **שתי נקודות-emit:** (1) **סינכרוני בראוט** — אחרי הטרנזקציה כש-`missingCount>0` (ה-IDs כבר ספורים `docking.ts:572-591`) → `sendPushToRole` + `insertRealtimeDomainEvent`. הזול, אפס scanner חדש. (2) **worker מתוזמן** במודל `stale-returned-sweep`.
- **משטחים קפואים:** להוסיף audit kind (למשל `equipment_missing_alerted`) ל-union הסגור `server/lib/audit.ts`; type realtime עם `category`/`level` חסומים; כל שאילתה `clinicId`; **למחזר nag-ceiling/de-dupe קיים** (tags-לפי-שלב + סף `DEFAULT_ESCALATION_THRESHOLDS`, `sweep-escalation-stage.ts`) כדי לא להציף.
- **צד-app:** RN/web/board מטפלים ב-type ה-ALERT החדש → התראה יזומה "ציוד X חסר מהעמדה".
- **סף-הכרעה (מסמך 3):** להריץ 2–4 שבועות, למדוד false-positives ואם הסריקות תופסות יציאות בזמן. מספיק → **סיימנו, בלי חומרה.** לא מספיק → הצדקה כמותית לפאזה 2.
- **Skills:** `wiring` (בוצע — האודיט) · `systematic-debugging` · `database-reviewer` (audit-union/telemetry/tenancy) · צד-RN להתראה.

## Phase 2 — חומרה (רק אם פאזה-1 לא מספיקה): חיישן-מגע Zigbee + מגנט

- **ברירת-מחדל (מסמך 3): SONOFF SNZB-04P** (~$11–13) + מגנט על תחתית המכשיר. מקומי דרך **Zigbee2MQTT** → MQTT מקומי. עונה על **כל** האילוצים: אין חשמל במכשיר, אין פעולת-צוות, אין dock-scanning, מקומי לגמרי. פיילוט 4 עמדות < ₪340 (כולל coordinator ZBDongle-E). סיכון-ביצוע: יישור מגנט-חיישן <20 מ"מ + "אזור-הנחה" מסומן; חלופה לאוריינטציה משתנה: ToF (VL53L1X).
- **נדחו (מסמך 3):** מד-חשמל לנוכחות (HLW8032 עיוור — שבב טוב רק לסטטוס-טעינה משני); משקל HX711 (creep/drift); **מצלמה — חסם רגולטורי בישראל** (תיקון 13, הנחיית PPA, פסיקת Elkaner); UWB (עלות); BLE RSSI (לא מבחין 30 ס"מ מיציאה); AirTag (אין API מקומי חוקי).
- **החיבור = קלון תת-מערכת ה-RFID (agnostic לחיישן; מאושר ע"י מסמך 3).** הקלט עכשיו **בוליאני-נוכחות** (contact) במקום וואט; שאר השרשרת זהה. ESP/Zigbee לא יכולים לחשב HMAC → החתימה בקוד שלנו; ה-Pi הוא "central middleware box" (ADR-005 Option B); מתאם Zigbee2MQTT = adapter של ADR-006 (השרת vendor-neutral).

## Architecture — השרשרת (קלון RFID, agnostic לחיישן)

```
חיישן-מגע Zigbee (SNZB-04P) [+ מד-חשמל אופציונלי לסטטוס] ──Zigbee2MQTT / MQTT מקומי──▶ dock-sensor-controller על Pi
   (adapter [חדש] → debounce → aggregate ל-state-transitions → envelope → HMAC-sign)
        │  POST /api/dock-sensor/readings  (X-VetTrack-Clinic + X-VetTrack-Signature)
        ▼
   server/routes/dock-sensor.ts  (raw body לפני express.json → rate-limit → HMAC → secret per-clinic → feature-flag → schema)
        ▼
   dock-sensor-ingest.ts (טרנזקציה, clinic-scoped) → vt_dock_sensor_readings + עמודות advisory על vt_equipment
        │  present:false + anchor פתוח → אותו "missing" של פאזה 1 → אותו נתיב-התראה
        ▼
   vt_event_outbox → event-publisher → GET /api/realtime/stream (SSE, קפוא) ──▶ RN/web/board
```

1. **Middleware — `packages/dock-sensor-controller/`:** קלון `packages/rfid-controller/` (zero-deps, `bin` CLI, vitest + `test:dock-sensor` root script). pipeline זהה. **החדש: מתאם Zigbee2MQTT** (מנוי `contact`/`battery` → `{sensorId, dockCode, present, at}`; אופציונלית watts משבב טוב). מצבירים ל-**אירועי-מעבר** (present→absent). secret מ-env בלבד. HMAC byte-identical ל-`verifyVetTrackWebhookSignature` + `contract-parity.test.ts` מול סכמת-הראוט.
2. **Ingest — `POST /api/dock-sensor/readings`:** קלון `server/routes/rfid.ts`. mount **לפני** `express.json` (260 מול 262). rate-limiter לפני HMAC. **reuse `verifyVetTrackWebhookSignature` + `readRfidClinicId`** (גנריים). ללא Clerk session. feature-flag `dock_sensor.ingest_enabled.<clinicId>`.
3. **Schema — מיגרציה מ-`180`:** `vt_dock_sensor_readings` (קלון `vt_equipment_rfid_reads`: clinicId, equipmentId, dockId, sensorCode, present bool, watts?/chargeState?, readAt, batchId + אינדקסים); אופציונלי `vt_dock_sensor_signals` (קלון `vt_rfid_egress_signals`, UNIQUE dedup); `vt_dock_sensors` (קלון `vt_rfid_readers` — heartbeat/provisioning/`UNIQUE(clinicId, sensorCode)`); עמודות advisory על `vt_equipment`: `lastPresenceState`, `lastPresenceAt` (+ אופציונלי charge). **SQL בכתב-יד מקור-אמת.**
4. **Provisioning/rotation — למחזר `server/lib/rfid/provisioning.ts`** (adapter `"dock_sensor"`; סוד מוצפן; rotation exactly-once; sweep מכשיר-offline מ-heartbeat; batch מתקבל = heartbeat). admin: קלון `admin-rfid-provisioning.ts`.
5. **דוקטרינה advisory:** ה-presence הנמדד הוא **עדות** מול ה-**anchor/checkout שאדם אישר** (בדיוק כמו RFID last-seen מול `roomId`) — **לעולם לא דורס.** `present:false` בעוד anchor פתוח = אותו "missing" של פאזה 1 → מזין את **אותו נתיב-התראה** (החומרה רק מקדימה ומצפיפה את האות). אם מתווסף מד-חשמל: סטטוס-טעינה advisory מול `isPluggedIn`, badge `dock_charge_conflict`. enum ב-`shared/equipment-board.ts`.
6. **SSE (קפוא — לרכוב):** רק type-string חדש (`EQUIPMENT_PRESENCE_CHANGED` / `EQUIPMENT_MISSING_ALERT`, ALERT/WARNING). `event-publisher.ts`/`realtime.ts` **ללא שינוי**.

## Register-here (התבנית פעם אחת, נציגים)
**פאזה 1:** `server/routes/docking.ts` (emit אחרי הסריקה) או worker חדש במודל `stale-returned-sweep.worker.ts` + register `server/app/start-schedulers.ts` · `server/lib/audit.ts` (audit kind) · צד-RN (type ALERT).
**פאזה 2:** schema (`server/schema/equipment.ts`/`power.ts` + `schema/index.ts`) · migration `180_*.sql` · `server/routes/dock-sensor.ts` + mount לפני `express.json` · `rate-limiters.ts` · `server/lib/dock-sensor/*` (ingest, provisioning, config, offline-sweep) · `start-schedulers.ts` · `audit.ts` · `shared/equipment-board.ts` · `packages/dock-sensor-controller/` + root `test:dock-sensor`. **לא לגעת:** `event-publisher.ts`, `realtime.ts`, SSE; `verify-signature.ts`; `clinic-header.ts`.

## Skills לפי המנדט (לפני כל כתיבה)
`wiring` (בוצע — audit פאזה 1) · `systematic-debugging` · `architecture` (ADR — נכתב) · `database-reviewer` agent (סכמה/מיגרציה/tenancy) · `react-native-architecture` (צד-RN: התראה/badge צורכים SSE). **multi-tenancy:** כל שאילתה מסננת `clinicId`.

## Open questions
1. **פאזה 1 (המלצה חמה):** לאשר את ה-emit הקטן ל-`sweep_missing`/`not_found_here` (bucket `missing`)? זול, אמיתי, מחוץ לנתיב-החנות — quick-win עכשיו או אחרי G5.
2. **אחרי מדידת 2–4 השבועות:** האם חומרה בכלל מוצדקת?
3. **אם חומרה:** חיישן-מגע Zigbee (ברירת-מחדל) — לאשר, או גישה אחרת?
4. **תזמון מול החנות:** פאזה 1 קטנה; פאזה 2 מאוחר יותר.
5. **ADR מספר:** להקצות מ-`docs/architecture/adr/` ולקשר מ-PR המימוש.
