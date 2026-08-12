# VetTrack — G4, G5, Slice 13 (פריסת-iPad) ו-pre-G5

**סטטוס: מאומת מול הקוד.** שני ה-repos ציבוריים ונקראו במלואם (`git clone`). כל ההנחות מהגרסה הקודמת של הדוח הוחלפו בממצאים עם נתיב ושורה. חומר רגולטורי חיצוני מצוטט בנפרד.

---

## TL;DR — חמישה תיקונים לתמונה שהייתה לך

1. **אתה לא צריך לשנות `orientation`.** iPad כבר מקבל את כל ארבעת הכיוונים דרך `UISupportedInterfaceOrientations~ipad`, ש-Expo כופה אוטומטית כש-`supportsTablet: true`. `"portrait"` נועל רק iPhone.
2. **PR #31 לא נגע ב-`app.json`.** הוא היה PR של תיעוד בלבד (`docs/g3-plan-ipad-slice`) שהוסיף את Slice 13 לתוכנית.
3. **Slice 13 הוא pre-G5 gate בסוף G3** — אחרי Slice 12. לא ב-G4.
4. **G4 = Code Blue, crash-cart, native push, offline write queue.** לא "hardening". הפריט הקריטי בו הוא בקשת entitlement מ-Apple שהתוכנית עצמה מגדירה כ-overdue.
5. **ה-breakpoint בתוכנית סותר את התקדים שהיא מצטטת**, והתקדים שגוי (מוציא iPad mini ב-portrait). קח את גרסת התוכנית.

---

## 1. סטאק מאומת

מתוך `package.json` + `AGENTS.md`:

| רכיב | גרסה |
|---|---|
| Expo SDK | `~57.0.9` |
| React Native | `0.86.2` |
| React | `19.2.3` |
| ניווט | React Navigation 7 (`native-stack` + `bottom-tabs`) — **לא Expo Router** |
| עיצוב | **Uniwind 1.10.0** (Tailwind v4, CSS-first) — NativeWind נדחה, לא תואם Metro של SDK 57 |
| Reanimated | `4.5.1` + `react-native-worklets` |
| רשימות | FlashList `2.0.2` (חובה) |
| State | Zustand + TanStack Query |
| ארכיטקטורה | New Architecture **חובה** (Bridgeless: Fabric + TurboModules) |
| workflow | Bare RN under Expo Prebuild (CNG) — `ios/`+`android/` נוצרים ו-gitignored |
| מנהל חבילות | npm (לא pnpm) |

**השלכה:** `app.json` + config plugins הם מקור האמת לקונפיגורציה הנייטיבית. **אסור לערוך `ios/` ידנית.**

---

## 2. הגדרות הגייטים — verbatim מה-repo

### G3 — `docs/G3-PLAN.md:16`
> **G3 = staff can use the RN app as their daily driver for a full shift.**

הפסק הוא הכרעה בכתב של הבעלים אחרי משמרת אמיתית על ה-Pixel שלו, מול production `https://vettrack.uk`.

### מטריצת הפלטפורמות — `G3-PLAN.md:22-31`
ארבעה יעדים. RN מקדם רק את שניים מהם:

| יעד | מה משלח | סטטוס |
|---|---|---|
| Mobile iOS + Android | אפליקציית RN זו | כל G3 |
| **Tablet iOS (iPad)** | אותה אפליקציה **+ פריסת iPad** | **Slice 13** (pre-G5 gate) |
| Web management console | `vettrack` (React + Vite) | ללא שינוי |
| TV ward board | `/board` kiosk | ללא שינוי |

ציטוט מהתוכנית: *"Tablet-iOS is **not** a separate submission: it rides the **same Apple binary** as Mobile-iOS, which is exactly why Apple reviews the iPad layout once `ios.supportsTablet` is declared."* — זה בדיוק המסגור שביקשת, והוא כבר כתוב בתוכנית.

### Slice 13 — `G3-PLAN.md:269`
> **Slice 13 — Tablet-iOS layout (pre-G5 gate) — after Slice 12, before any store submission**

היקף מדויק (סעיפים a–d):
- **(a)** הכרזת תמיכה — **כבר קיימת**, רק לאמת.
- **(b)** התאמות רספונסיביות בתוך המסכים הקיימים — **בלי מסלולים חדשים או משולבים**.
- **(c)** אימות בסימולטור iPad = ראיית השער.
- **(d)** אפס עבודת שרת.

### G4 — `G3-PLAN.md:47` + `§4`
בטבלת הכיסוי, G4 מוגדר כ-out of scope ל-G3:
> **G4 — out of scope:** Code Blue flows, crash-cart check (emergency-readiness), native push, offline write queue — `/code-blue`, `/crash-cart`

### G5 — `G3-PLAN.md:33`
> **Store submission = BOTH the Apple App Store AND Google Play**

פריטים שהתוכנית דוחה מפורשות ל-G5 (`G3-PLAN.md` Slice 12):
- `DELETE /api/users/delete-account` — **App-Store-mandated**
- העלאת avatar
- שדרוג RN/Expo SDK אחד מכוון (`§4 MUST WAIT` פריט 6: *"the one deliberate upgrade is scheduled before G5 submission"*)

---

## 3. סוגיית ה-orientation — **פתורה מהקוד, לא צריך שינוי**

### מה שחשבת
ש-`expo.orientation` שונה מ-`"portrait"` ל-`"default"` ב-PR #31 בעקבות הערת CodeRabbit.

### מה שקיים בפועל
```
app.json:6    "orientation": "portrait"
app.json:10   "supportsTablet": true
```

`git log --all -- app.json` — הקובץ לא נגע מאז `f4754e1` (CodeRabbit round 1 על **PR #19**). PR #31 = `53e1a2f Merge pull request #31 from exposwifty31/docs/g3-plan-ipad-slice` — **PR של תיעוד בלבד**. ה-diff שלו ב-`docs/G3-PLAN.md` הוא 3 שורות, ואפס שינוי ב-`app.json`.

### למה זה בכל זאת בסדר — הוכחה מהקוד

קראתי את `@expo/config-plugins@57.0.6` (הגרסה המדויקת מה-`package-lock.json` שלך).

**`build/ios/RequiresFullScreen.js:57-64`:**
```js
const isTabletEnabled = config.ios?.supportsTablet || config.ios?.isTabletOnly;
if (isTabletEnabled && !requiresFullScreen) {
  const existing = resolveExistingIpadInterfaceOrientations(infoPlist[iPadInterfaceKey]);
  infoPlist['UISupportedInterfaceOrientations~ipad'] =
    [...new Set(existing.concat(requiredIPadInterface))];
}
```
כאשר:
```js
const requiredIPadInterface = [
  'UIInterfaceOrientationPortrait', 'UIInterfaceOrientationPortraitUpsideDown',
  'UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight'
];
```

**`build/ios/Orientation.js`** — `orientation: "portrait"` כותב **רק** את המפתח הבסיסי `UISupportedInterfaceOrientations` עם שני ערכי portrait:
```js
if (orientation === 'portrait') return PORTRAIT_ORIENTATIONS;
```

**`requireFullScreen` לא מוגדר ב-`app.json` שלך** (0 מופעים) → `!requiresFullScreen` הוא `true` → הכפייה מופעלת.

### התוצאה

| מכשיר | מפתח קובע | מצב בפועל |
|---|---|---|
| iPhone | `UISupportedInterfaceOrientations` | נעול portrait |
| iPad | `UISupportedInterfaceOrientations~ipad` | **כל ארבעת הכיוונים** |

**ה-iPad כבר מסתובב.** אימות ה-landscape של Slice 13(c) אפשרי כבר עכשיו.

**הסיבה שExpo כופה את זה:** הערת הקוד מצטטת `ITMS-90474` — Apple דוחה binary שמכריז `supportsTablet` בלי כל ארבעת הכיוונים ב-`~ipad`. Expo מונע את הדחייה אוטומטית.

### המלצה: השאר `"portrait"`
שינוי ל-`"default"` ישחרר landscape גם ב-**iPhone**. אף מסך ב-RN לא תוכנן ל-landscape בטלפון — תפתח חזית QA חדשה בלי תמורה. אין סיבה טכנית לשינוי.

### מה שנשאר לאמת בסימולטור (**תנאי חוסם ל-Slice 13**)
הקוד מוכיח שה-plist נכון. הוא **לא** מוכיח שה-UI לא נשבר. לכן זה נשאר תנאי:

```sh
npx expo prebuild -p ios --clear
plutil -p ios/VetTrack/Info.plist | grep -A6 "UISupportedInterfaceOrientations"
```

**Expected:** `UISupportedInterfaceOrientations~ipad` מכיל ארבעה ערכים; המפתח הבסיסי מכיל שניים.
**אם Actual שונה** — יש plugin או `infoPlist` override שדורס, ורק אז נדרש שינוי ב-`app.json`.

---

## 4. חור בתוכנית: Slice 13 לא מזכיר orientation בכלל

`grep -rn "orientation"` על כל ה-repo מחזיר רק:
- `app.json:6` — הערך עצמו
- `G3-PLAN.md:282` — דרישת האימות "portrait + landscape"
- `G3-PLAN.md:289` — טסט "orientation flip" ל-`use-is-tablet`

**התוכנית דורשת אימות בשני כיוונים אבל אף פעם לא מסבירה איך הכיוון השני מופעל.** זה עבד במקרה, כי Expo כופה את זה. הוסף שורה ל-Slice 13(a) שמתעדת את המנגנון — אחרת מישהו "יתקן" את `orientation` ל-`"default"` בעתיד וישבור את ה-iPhone.

---

## 5. ה-breakpoint — התוכנית סותרת את התקדים, והתקדים שגוי

### מה שהתוכנית אומרת (`G3-PLAN.md:277`)
> `src/lib/use-is-tablet.ts` — RN analog of `useIsNativeTablet`, keyed on `useWindowDimensions()` short-side ≥ ~600 dp

### מה שהתקדים אומר בפועל
`vettrack/src/lib/use-tablet-viewport.ts`:
```ts
export const TABLET_MIN_WIDTH = 768;
export const TABLET_MIN_HEIGHT = 500;
export function isTabletViewport(width: number, height: number): boolean {
  return width >= TABLET_MIN_WIDTH && height >= TABLET_MIN_HEIGHT;
}
```

### הבאג בתקדים
ההערה בקוד טוענת שהכלל מפריד מחלקות *"without reclassifying any iPad (mini included)"*. זה לא נכון:

| מכשיר | מידות | `width≥768 && height≥500` | `short-side ≥ 600` |
|---|---|---|---|
| iPad mini portrait | 744×1133 | ❌ **phone** | ✅ tablet |
| iPad mini landscape | 1133×744 | ✅ tablet | ✅ tablet |
| iPhone Pro Max landscape | 932×430 | ❌ phone | ❌ phone |

**iPad mini ב-portrait נופל למחלקת phone** ב-Capacitor, בניגוד לכוונה המוצהרת. בנוסף הכלל לא יציב ברוטציה — אותו מכשיר מחליף מחלקה.

### המלצה: קח את גרסת התוכנית (short-side ≥ 600)
- יציב ברוטציה — מכשיר לא מחליף מחלקה כשמסובבים אותו
- כולל iPad mini בשני הכיוונים
- מוציא כל טלפון (הצד הקצר של Pro Max הוא ~430)
- תואם את מוסכמת `sw600dp` של אנדרואיד

**מודעות לפער:** אותו iPad mini ב-portrait יקבל two-pane ב-RN ו-one-pane ב-Capacitor. מקובל — Capacitor הוא רשת הביטחון שנזרקת בסוף המיגרציה.

**הערה על multitasking:** התוכנית לא מממשת Split View בין אפליקציות, אבל `UIRequiresFullScreen` יוצא `false` (כי לא הוגדר), כלומר **iPadOS יכול לכפות רוחב צר**. השימוש ב-short-side מטפל בזה נכון: ברוחב מצומצם ה-short-side יורד מתחת ל-600 ואתה חוזר ל-one-pane אוטומטית.

---

## 6. מבנה Slice 13 — מאומת

### מצב נוכחי בקוד
```
grep -rn "useWindowDimensions|Dimensions\.|isTablet|TwoPane" src/
→ src/components/home/AuroraBackground.tsx:8,43   (בלבד)
```
אין hook של breakpoint. אין קומפוננטת two-pane. Slice 13 מוסיף **hook אחד + primitive אחד**.

### מה שהתוכנית קובעת
- `src/lib/use-is-tablet.ts` — השער היחיד
- `src/components/tablet/TwoPane.tsx` — presentational + `SelectPlaceholder`
- **בלי מסלולים חדשים** — חוזה המסלולים של Slice 1 קפוא. בטלפון עדיין `push`; בטאבלט אותו detail נטען ב-pane.

**הערה:** התקדים ב-Capacitor **כן** השתמש במסלולים משולבים (`/rooms/:id?` דרך `RoomsMasterDetail`). התוכנית ב-RN **סוטה מזה במכוון**. הסטייה נכונה — היא מונעת התנגשות עם כלל ה-one-writer-per-file של Slice 1.

### ארבעת המסכים
| מסך | התאמה |
|---|---|
| Equipment → detail | master-detail אמיתי |
| Rooms → room detail | master-detail אמיתי |
| Tasks | master-detail; ה-`BottomSheet` של create/edit נשאר overlay |
| **Home** | **לא** master-detail — reflow רב-טורי/bento |

### אילוצי Aurora (קפואים)
- משטחי two-pane **אטומים**, טוקנים בלבד
- **≤1 שכבת blur למסך** — ה-frame של two-pane מוסיף **אפס**
- **אפס אנימציה** על החלפת pane — מיידי. משוב מגע רק דרך `PressableScale`
- משטחי danger לעולם לא מזוגגים ולא מונפשים

### רשת RTL
התקדים משתמש ב-`borderInlineEnd` + flex row. ב-RN המקבילה היא props לוגיים (`start`/`end`) שהתוכנית כבר מחייבת ב-`§1.3`. עם `I18nManager.isRTL === true` ה-`flexDirection: 'row'` כבר מסודר ימין-לשמאל — **אל תוסיף `row-reverse`**, זה היפוך כפול.

### חוזה המדידה
Slice 13 נוגע ב-**Home וב-Equipment list**, ולכן `§5 risk 4` מחייב **הרצת G2Measure export מחדש** ואיסור רגרסיה ברצפת הפריימים (pooled UI p95 11.08ms מול רצפה 11.11ms — `docs/g2_5-results.md`).

---

## 7. צ'קליסט QA ל-Slice 13

סימולטורים: iPad mini · iPad 11" · iPad 13" — כל אחד portrait + landscape. פלוס iPhone לרגרסיה. שתי שפות (he + en). פורמט: **Screen / Expected / Actual / Pass-Fail**.

| # | בדיקה | Expected (Pass) |
|---|---|---|
| 0 | Info.plist | `~ipad` = 4 ערכים; בסיסי = 2 |
| 1 | Equipment | two-pane; הרשימה נשארת mounted; בחירה מחליפה detail בלי push |
| 2 | Rooms | כנ"ל |
| 3 | Tasks | two-pane; sheet של create/edit עדיין overlay |
| 4 | Home | reflow רב-טורי; GlassTopBar (T1) לא נגע; latch `screenInteractive` שלם |
| 5 | Placeholder | `tablet.selectEquipment/selectRoom/selectTask` מוצג כשאין בחירה |
| 6 | iPad mini portrait | **two-pane** (744 ≥ 600) |
| 7 | רוטציה | הבחירה שורדת; אין crash; אין double-render |
| 8 | iPhone | one-pane; push לא השתנה; **עדיין נעול portrait** |
| 9 | RTL | master מימין; אייקונים ממורים; אין `left`/`right` קשיח |
| 10 | Blur | ≤1 שכבה למסך; ה-frame מוסיף אפס |
| 11 | Motion | אפס אנימציה בהחלפת pane |
| 12 | G2Measure | אין רגרסיה ברצפת פריימים על Equipment list |
| 13 | i18n | `parity.test.ts` ירוק; אפס עברית קשיחה |

---

## 8. G4 — מה שבאמת עומד על הפרק

מתוך `§4 G4 Readiness Memo`.

### דוקטרינה קפואה (verbatim)
> *"No offline emergency queueing. Code Blue mutations must fail loud when offline."*
>
> *"No polling-based recovery for Code Blue."*
>
> *"No optimistic local termination of emergency state. UI follows server confirmation."*
>
> KEEPALIVE נושא `{activeCodeBlueSessionId, stormHint}` ו**לעולם לא מבטל query caches**.
>
> ADR-009 (proposed): **push = alert only, never a state channel**.

### ניתן להתחיל עכשיו במקביל ל-G3
1. **בקשת Critical Alerts entitlement — התוכנית מגדירה כ-"overdue, not merely startable".** תוזמן ל-G0, עדיין לא הוגש נכון ל-2026-07-31. אין מפתח entitlement ב-`ios/App/App/App.entitlements`. אישור Apple **בלתי-חסום בזמן ואולי יידחה** — פריט זמן-ההובלה הארוך ביותר בכל G4. אותה מחלקה: יצירת פרויקט Firebase, FCM service-account, APNs `.p8`.
2. פורט של ה-emergency-block classifier ל-fetch layer
3. Code Blue read-only viewer
4. Offline read-cache (מסלול מקבילי ל-G3)
5. Push scaffolding מאחורי `AlertingPort` — **עם איסור מוחלט אחד: אל תיצור production Android notification channel** (channels אימוטביליים אחרי יצירה, על כל מכשיר מותקן)
6. קידום contracts
7. Reset→snapshot resync consumer

### חייב לחכות
מסכי mutation של Code Blue · בניית server push · יצירת channel · offline write queue · עריכות AASA/assetlinks · **שדרוגי RN/Expo SDK (הסטאק קפוא עד G4; השדרוג המכוון היחיד מתוזמן לפני הגשת G5)**.

### חוסר עקביות שהתוכנית עצמה מסמנת
פער התרעות החירום הוא **פגם production קיים באפליקציית Capacitor המשולחת**, לא עלות מיגרציה. סולם הגייטים בכל זאת מתזמן את התיקון ל-G4. אם אתה רוצה את נתיב ה-wake מוקדם יותר — עבודת השרת זהה בכל מקרה, מה שמחזק את ההתחלה המיידית של הפריטים חסרי-החרטה (entitlement, credentials, החלטות).

---

## 9. G5 ו-pre-G5

### 9.1 מה שהתוכנית כבר מכסה
- הגשה לשתי החנויות
- `DELETE /api/users/delete-account` (חובת App Store)
- avatar
- שדרוג SDK מכוון אחד

### 9.2 מה שהתוכנית **לא** מכסה — פערים אמיתיים

מקורות חיצוניים, לא ב-repo:

**iOS**
- **Privacy manifest (`PrivacyInfo.xcprivacy`)** — חובה מ-1/5/2024 ל-required-reason APIs (`ITMS-91053`); מ-12/2/2025 גם SDK צד-שלישי (`ITMS-91061`). RN/Expo משתמשים ב-required-reason APIs. **בדוק שקיים.**
- **שאלון age rating** — חובה לענות עד **31/1/2026**, אחרת נחסמות הגשות. אפליקציה בהקשר קליני: ענה על "Medical or wellness topics".
- **Xcode 26 / iOS 26 SDK** — חובה לבנייה מ-**28/4/2026**. מתנגש עם "הסטאק קפוא" — השדרוג המכוון חייב לנחות לפני התאריך.
- **צילומי מסך** — 6.9" iPhone (1320×2868) + **13" iPad (2064×2752)**. חובה כי `supportsTablet: true`.

**Android**
- **Target API 36 (Android 16)** — חובה מ-**31/8/2026**; ניתן לבקש הארכה עד 1/11/2026.
- **12 testers × 14 יום רצוף** — רק לחשבון אישי שנוצר אחרי 13/11/2023. **נתיב קריטי ארוך שאי אפשר לקצר.** ארגוני/ישן — פטור.
- **Data Safety form** + privacy policy URL + account-deletion URL.
- **Developer verification** — אכיפה מ-30/9/2026.

### 9.3 pre-G5 — רשימה מסודרת

| # | תנאי | מקור |
|---|---|---|
| 1 | Slices 1–12 נחתו; הכרעת daily-driver של הבעלים נרשמה | repo |
| 2 | **Slice 13 עבר** — צ'קליסט §7 מלא, ראיות ב-`docs/g3-results.md` | repo |
| 3 | `DELETE /api/users/delete-account` מחווט | repo |
| 4 | שדרוג SDK מכוון נחת | repo |
| 5 | Privacy manifest קיים ומאמת | Apple |
| 6 | שאלון age rating נענה | Apple (31/1/2026) |
| 7 | בנייה עם Xcode 26 / iOS 26 SDK | Apple (28/4/2026) |
| 8 | Target API 36 | Google (31/8/2026) |
| 9 | Data Safety + privacy policy + account-deletion URL | Google |
| 10 | closed test של 12 testers — **אם חשבון אישי חדש** | Google |
| 11 | צילומי 6.9" iPhone + 13" iPad | Apple |

**פריטים 6, 7, 8, 10 הם נתיב קריטי עם דדליינים קשיחים.** אף אחד מהם לא מופיע ב-`G3-PLAN.md`.

---

## 10. הצעדים הבאים

1. **הרץ `npx expo prebuild -p ios --clear` ואמת את `~ipad` ב-Info.plist** (הפקודה ב-§3). ההוכחה מהקוד חזקה, אבל plugin או override יכולים לדרוס.
2. **הוסף ל-Slice 13(a) שורה שמתעדת את מנגנון ה-`~ipad`** ואוסרת שינוי `orientation` ל-`"default"` — אחרת מישהו "יתקן" את זה ויפתח landscape ב-iPhone.
3. **הכרע על ה-breakpoint וקבע אותו בטסט.** המלצה: short-side ≥ 600. תעד ב-Slice 13 שהתקדים ב-Capacitor שגוי ולמה סוטים ממנו.
4. **בדוק אם חשבון ה-Google Play שלך אישי-חדש.** אם כן — 12 testers × 14 יום מתחיל היום, לא ב-G5.
5. **הגש את בקשת ה-Critical Alerts entitlement.** אפס קוד, זמן אישור בלתי-חסום, והתוכנית מסמנת אותו כ-overdue מזה חודש.
6. פתח פריטי pre-G5 5–11 כ-issues ב-repo. הם לא בתוכנית, ולכולם יש דדליין.

---

## נספח — מה אומת ומה לא

**אומת מול קבצים:** מבנה שני ה-repos · `app.json` · `package.json` · `package-lock.json` · `AGENTS.md` · `SCAFFOLD-PLAN.md` · `docs/G3-PLAN.md` (397 שורות) · `vettrack/src/native/tablet/*` · `vettrack/src/lib/use-tablet-viewport.ts` · `@expo/config-plugins@57.0.6` build output · `git log --all -- app.json` · diff של PR #31.

**מקורות חיצוניים:** דרישות Apple (privacy manifest, age rating, SDK minimum, screenshots) · דרישות Google Play (target API, testers, Data Safety, verification).

**לא אומת:** ה-Master Migration Anchor (`~/.claude/plans/goofy-mapping-hellman.md`) — קובץ מקומי אצלך, לא ב-repo. הוא מקור האמת הקפוא לפי `AGENTS.md`. אם יש בו הגדרות G4/G5 שסותרות משהו כאן — הוא גובר. **בדוק אותו.**
