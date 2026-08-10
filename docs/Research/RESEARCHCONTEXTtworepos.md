# VetTrack — קונטקסט שני ה-Repos (Capacitor + RN Migration)

> מסמך-רקע לצורכי מחקר. נכתב 2026-08-10. מקצה-לקצה מאומת מול הקוד בשני המאגרים.
> נועד להיות **עצמאי** — אפשר להזין אותו לכלי-מחקר בלי הקשר נוסף.

---

## תמונה במשפט אחד

VetTrack היא פלטפורמת תפעול לבית-חולים וטרינרי (מעקב-ציוד ומשמורת, Code Blue, מלאי/ניפוק, משימות/משמרות, אינטגרציות PMS). קיימים **שני מאגרי-קוד חיים במקביל**: מאגר ה-**Capacitor** (המוצר בייצור — iOS חי ב-App Store) ומאגר ה-**RN Migration** (היורש הנייטיבי — Expo SDK 57). הם **מקבילים, לא cutover**: ה-Capacitor הוא רשת-הביטחון תמיד-שמישה, וה-RN מחליף אותו רק אחרי שער **G5** ובקריטריונים מוגדרים.

---

## Repo 1 — Capacitor (המוצר בייצור)

- **נתיב:** `/Users/dan/vettrack`
- **מה זה:** monorepo מלא (pnpm workspace). React 18 + Vite frontend (port 5000) · Express + TypeScript backend (port 3001) · PostgreSQL + Drizzle ORM · BullMQ + Redis · Clerk auth · **SSE realtime** + Socket.io collab (ephemeral בלבד) · PWA / offline-first · **Capacitor 8 native shell** (iOS חי ב-App Store) · Sentry · Railway deploy.
- **זהות בחנות:** `uk.vettrack.app`. **iOS build 26 מאושר** (מוחזק על שחרור-ידני של הבעלים). **אנדרואיד = הערוץ המוביל**, טרם ב-review.
- **מה הוא מכיל שה-RN צורך:**
  - **השרת** — ה-API היחיד לכל הלקוחות (Mobile/Tablet/Web/TV).
  - **`packages/contracts`** (`@vettrack/contracts`) — שכבת-החוזה המשותפת (framework-free).
  - **`packages/rfid-controller`** — ליבת ה-middleware החתום (vendor-agnostic, zero-deps), התבנית לכל חיבור-חומרה.
- **חוק-על:** **multi-tenancy** — לכל טבלה יש `clinicId`, וכל שאילתה מסננת לפיו. אין יוצא מהכלל.
- **משטחים קפואים (load-bearing, לא לגעת):** SSE realtime transport · Code Blue fail-loud-offline (אין תור-offline לחירום) · RFID **advisory-only** (ADR-006 — קריאת-חיישן לעולם לא דורסת מצב שאדם אישר) · `appointmentsPage.*` i18n namespace · enforcement envelope (`off | shadow | enforce`) · telemetry bounded-enums.
- **הקשר תיעודי מרכזי:** `CLAUDE.md` (שורש), `NORTH_STAR.md`, `docs/design/program-plan.md`, `docs/vettrack-2.0-roadmap.md`.

---

## Repo 2 — RN Migration (היורש הנייטיבי)

- **נתיב:** `/Users/dan/VetTrack-RN-Migration` · remote `exposwifty31/VetTrack---RN-Migration-` (ציבורי)
- **מה זה:** אפליקציית **React Native / Expo SDK 57** (RN 0.86.2, React 19.2.3). **New Architecture (Bridgeless) חובה.** זרימת **CNG / prebuild** — תיקיות `android/` ו-`ios/` **gitignored ומיוצרות** (מקור-האמת = `app.json` + config-plugins). npm.
- **סטאק לקוח:** ניווט `@react-navigation` v7 (**לא** expo-router) · styling **uniwind** + Tailwind 4 · `@tanstack/react-query` · `@shopify/flash-list` · Reanimated 4 · MMKV · `react-native-nfc-manager` (+patch) · **realtime `react-native-sse`** · Clerk (`@clerk/clerk-expo`).
- **מציאות ה-auth (סיכון-מפתח לחנות):** `authFetch` **נכשל-סגור** — בלי Clerk JWT תקף הוא זורק `AUTH_INVALID` לפני כל קריאת-רשת, ו-`BootstrapGate` חוסם מתחת ל-Home. בודק בחנות בלי login עובד → מסכים ריקים → דחיית App Review 4.2.
- **זהות (טרם הגירה):** `uk.vettrack.rnmigration` (מובחן בכוונה מהייצור). **כשיעלה — ימחזר `uk.vettrack.app`** (החלטת-בעלים 2026-08-10), ו-iOS build יעלה ל-≥27.
- **מה הוא צורך מ-Repo 1:** vendored `@vettrack/contracts` + `@vettrack/shared` (sparse-clone ב-`preinstall` דרך `scripts/vendor-vettrack.mjs`), וה-API של השרת.
- **הקשר תיעודי מרכזי:** `README.md`, `AGENTS.md` (frozen-stack governance), `docs/G3-PLAN.md`, `docs/g3-results.md`.

---

## היחס בין השניים

- **מקבילים, לא cutover.** ה-README של ה-RN: *"ה-Capacitor נשאר רשת-הביטחון תמיד-שמישה; המאגר הזה מבודד ולא נוגע בו."* פרישת ה-Capacitor = החלטה מפורשת **אחרי G5** ובקריטריונים (N שבועות חי בלי Sev-1, error-rate ≤ baseline, אישור קליניקת-פיילוט, סיפור-rollback).
- **סולם השערים G0→G5** מנהל את המעבר. **מקור-האמת הקפוא:** `~/.claude/plans/goofy-mapping-hellman.md` ("Master Migration Anchor"). ה-`AGENTS.md` של ה-RN מכנה אותו "frozen source of truth — לא לוויכוח; רק רצף-הסלייסים פתוח".
- **`packages/contracts` = התפר המשותף.** bump בחוזה עשוי לדרוש PR נלווה במאגר ה-RN.
- **שרת אחד, ארבעה לקוחות:** Mobile (RN, שתי חנויות) · Tablet (iPad) · Web console (management-only) · TV board (ward Command Center). ה-seam בצד-הווב הוא `PlatformTarget` (`mobile | desktop | marketing | board`).
- **north-star:** **שתי הגשות לחנויות ב-review** (Apple + Google, אנדרואיד מוביל) → ואז ממשיכים את תוכנית 2.0 (Task 1.2 — Case Spine). הבר הוא "ב-review", לא "live".

---

## סולם השערים G0→G5 — היכן אנחנו (2026-08-10)

| שער | הגדרה (Master Anchor) | סטטוס |
|---|---|---|
| **G0** | דדליינים חיצוניים + תורי-אישור (targetSdk 36, 16KB, push-gap, הגשות) | "כמעט גמור"; הגשות בהחזקה מכוונת |
| **G1** | יסודות — de-risk NFC תחת New Arch; contracts; scaffold SDK 57 | ✅ done (סלייסים 0–7) |
| **G2** | Hero flow — רצפות-ביצוע + העדפה עיוורת ≥70% RN | ✅ passed 2026-08-07 |
| **G2.5** | שפת-עיצוב Aurora | ✅ done 2026-08-07 |
| **G3** | Daily-driver parity — שימוש יומיומי מלא כמשמרת | 🟡 גמור-בקוד; **ממתין לפסק-דין על-מכשיר** (Pixel 7 + iPhone 16 Plus) |
| **G4** | Code Blue + native push (APNs+FCM) + offline מלא | 🔴 כמעט לא-בנוי (חתיכה אחת מוזגה) |
| **G5** | RN אל החנויות + שדרוג-SDK מכוון + פרישת Capacitor בקריטריונים | 🔴 לא התחיל |

**נתונים קשיחים מאומתים בסשן זה:** Xcode 26.5 (build 17F42) מותקן ופעיל → שער P3 (iOS 26 SDK) מסופק. `asc` מאומת (רשומה `uk.vettrack.app`, builds עד 26). `gplay` לא-מאומת (של הבעלים). אין `eas.json`. תיקיות native gitignored (CNG).

---

## מפת המסמכים (לניווט מהיר)

- **קונטקסט שני ה-repos** ← המסמך הזה.
- **אינדקס כל התוכניות** ← `RESEARCH-INDEX-all-plans.md` (מקטלג כל תוכנית + סטטוס + נתיב).
- **התוכנית הנוכחית** (המשך אל החנות + זיהוי-הסרת-ציוד) ← `~/.claude/plans/tranquil-prancing-sprout.md`.
- **מקור-האמת של ההגירה** ← `~/.claude/plans/goofy-mapping-hellman.md` (Master Anchor).
- **north-star** ← `vettrack/NORTH_STAR.md`.
- **קורפוס-מחקר החומרה** (זיהוי-הסרת-ציוד) ← שלושת `docs/compass_artifact_*.md`.
