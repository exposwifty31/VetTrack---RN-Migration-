# התראה על מכשיר שעזב עגינה ללא סריקה — מחקר, תיקוני יסוד ותוכנית

> משובץ ל-**G4** בתוכנית המיגרציה. שלב א' (תיקוני יסוד) מאושר לביצוע; שלבים ב'–ד' ממתינים להחלטה.

## Context

מכשיר יושב בעגינה, מישהו לוקח בלי לסרוק, אף אחד לא יודע. כשמחפשים — הוא נעלם, והמערכת עדיין מציגה "בתחנה".

**המערכת לא מזהה את זה היום, וזו החלטת תכנון מכוונת.** `docs/design/docking-first-class.md:187`:
> **Never:** per-dock NFC tags, per-dock readers, dock scanning of any kind.

החומרה היחידה שאושרה לעגינות: **עמדות טעינה חכמות** עם חישת הספק לכל שקע (§7, P4, D-15/D-16).

### מה קיים בקוד (מאומת)

| רכיב | מצב |
|---|---|
| `vt_equipment_anchors` | עוגן נפסל **רק** ע"י סתירה, לעולם לא ע"י זמן (D-13) |
| ארבע הסתירות | `checkout` · `rfid_elsewhere` · `sweep_missing` · `not_found_here` — [`equipment-anchor.service.ts:7`](server/services/equipment-anchor.service.ts:7) |
| אירוע "undock" | **לא קיים** — `grep -rin "undock"` מחזיר רק שורת changelog |
| `untrackedDepartureAt` | עמודה מתה — [`equipment.ts:164`](server/schema/equipment.ts:164), אפס קוראים/כותבים |
| `AnchorSource: "smart_charger"` | **שמור, לא ממומש** — [`equipment-anchor.service.ts:8`](server/services/equipment-anchor.service.ts:8) + CHECK מיגרציה 165 |
| `vt_rfid_readers.gateType='dock'` | **לא חיישן עגינה** — שער יציאה מהבניין, אין FK ל-`vt_docks` |
| קוראי RFID מותקנים | **אפס** — `provisioningState` ברירת מחדל `legacy_unconfigured` |

---

# חלק 1 — מחקר Tech Stack

**המסקנה: טכנולוגיה כן קיימת.** יש מוצרים מסחריים שעושים בדיוק "זיהוי הוצאת פריט ללא סריקה". השאלה היא איזה מתאים לציוד רצפתי בתקציב של בית חולים וטרינרי בודד.

| # | טכנולוגיה | מנגנון | עלות ליחידה | פסק דין |
|---|---|---|---|---|
| 1 | **חישת הספק פר-שקע, ללא ממסר** | ניתוק = זרם לאפס | **~$15–25** [הערכה] | ✅ **מומלץ** — היחיד שהתכנון מאשר; `smart_charger` שמור בסכימה |
| 2 | ארון RFID חכם (Terso / LogiTag) | RAIN RFID רציף בארון סגור; הוצאה מדווחת אוטומטית, API פתוח | enterprise, quote-only | 🟡 **עושה בדיוק את הדרוש** — אבל לפריטים קטנים בארון סגור, לא לאולטרסאונד רצפתי |
| 3 | RFID UHF ברמת חדר | קורא בשער מזהה מעבר חדר | ₪11,800–15,000 לשער | 🟡 רמת חדר, לא רמת עגינה. מחקר מלא ב-[`VetTrack-RFID-מחקר-פריסה.md`](docs/architecture/VetTrack-RFID-מחקר-פריסה.md) |
| 4 | תג BLE עם מד-תאוצה (wake-on-motion) | התג מתעורר בתנועה ומדווח | **$25–29** + gateway ~$150 | 🟡 תנועה ≠ עזיבה; RSSI זולג בין חדרים; סוללה בכל תג |
| 5 | PDU ממודד פר-שקע (SNMP) | אותו עיקרון כמו #1, ברמת מסד | **~$87–94 לשקע** ($755 ל-8, $1,390 ל-16) | 🔴 פי 4–6 מ-#1 על אותה פונקציונליות |
| 6 | **NILM — מדידה בלוח החשמל** | פירוק חתימת צריכה מצטברת | ~$200 ללוח שלם | 🔴 **נפסל — ראו למטה** |
| 7 | עגלות טעינה רפואיות (Ergotron LiFeKinnex) | dashboard ענן לסוללות | חלק מהעגלה | 🔴 טלמטריית **סוללה**, לא נוכחות מכשיר בעגינה |
| 8 | חיישן נוכחות פר-משבצת (IR / reed / משקל) | חיישן מכני במשבצת | $10–30 | 🟡 עובד גם ללא חשמל, אך לא מזהה **איזה** מכשיר |
| 9 | NFC / QR בעגינה | סריקה ידנית | ₪5 | 🔴 **פסול ב-§9**, וגם לא פותר — הבעיה היא שאף אחד לא סורק |

### שני ממצאים ששוללים את המסלולים הזולים

**א. NILM נפסל בגלל שיש הרבה מכשירים זהים.** מדידה אחת בלוח לא יכולה להגיד **איזו** משאבה נותקה כשיש שמונה זהות. [מחקר NILM](http://www.sdewes.org/jsdewes/pid11.0471) מנסח זאת כמגבלה יסודית: *"an essential lack of sufficient information to separate out the contributions of similar loads"*. בבית חולים עם צי משאבות זהות — קטלני. המסקנה: **חייבים מדידה פר-שקע**, ומכאן העלות.

**ב. אסור ממסר במסלול החשמל של ציוד קליני.** לפי [UL Solutions](https://code-authorities.ul.com/hospital-grade-power-strips-health-care-facility-outlet-assemblies/), מכלולי שקעים במוסד רפואי אינם רשאים לכלול מתגים או התקני ניתוק זרם; בקרבת מטופל מותרים רק UL 1363A / UL 60601-1. **Shelly Pro 4PM נפסל** — ארבעה ממסרים פיזיים. הבחירה: **מד ללא ממסר** ([Athom no-relay](https://www.athom.tech/blank-1/no-relay-power-monitoring-us-plug-for-esphome), HLW8032 + ESP8285, ESPHome/Tasmota). לאמת תקע ישראלי SI 32 לפני רכש.

### עלות בקנה מידה של בית חולים

שער ₪3.00/$ (כמו במסמך ה-RFID). **הכל [הערכה]** עד להצעת מחיר.

| היקף | מדים | חומרה | בקר + רשת | **סה"כ** |
|---|---|---|---|---|
| פיילוט — עגינה אחת | 4 | ₪240–300 | ₪300 (Pi) | **₪540–600** |
| מחלקה — ER/ICU | ~30 | ₪1,800–2,250 | ₪600 | **₪2,400–2,850** |
| בית חולים — צי מלא | ~120 | ₪7,200–9,000 | ₪1,200 | **₪8,400–10,200** |

**ההשוואה שקובעת:** ציוד לכל **צי בית החולים** ≈ **פחות מעלות שער RFID בודד** (₪11,800–15,000). פי 15–25 זול יותר לכיסוי רחב.

⚠️ **לא כלול: עבודת חשמלאי.** ב-120 נקודות זה עשוי לעלות על עלות החומרה. **חייב הצעת מחיר לפני החלטה.**

### Middleware — כבר פתור בריפו

VetTrack דורשת POST חתום HMAC-SHA256. אומת: **ל-Shelly אין API קריפטו מתועד בסקריפטים** ([תיעוד רשמי](https://shelly-api-docs.shelly.cloud/gen2/0.14/Scripts/ShellyScriptLanguageFeatures/)) — אותה מסקנה כמו במסמך ה-RFID לגבי קוראים.

הפתרון קיים: [`packages/rfid-controller`](packages/rfid-controller/) — בקר חתימה vendor-agnostic ללא תלויות runtime. ה-`ReaderAdapter` seam ב-[`adapter.ts:22`](packages/rfid-controller/src/adapter.ts:22) הוא נקודת ההרחבה המתועדת; [`signer.ts`](packages/rfid-controller/src/signer.ts), `sender.ts`, `envelope.ts`, `config.ts` agnostic לסוג האירוע.

**ארכיטקטורה:** מדי הספק → MQTT מקומי → בקר Node (מארח `rfid-controller` + adapter חדש) → POST חתום.

---

# חלק 2 — התוכנית

## שלב א' — שני תיקוני יסוד (מאושר, מתחילים כאן)

בלעדיהם כל התראת-עזיבה תייצר **false negatives**. שניהם שקטים — לא מפילים כלום, פשוט משקרים לגבי איפה הציוד נמצא.

### באג 1 — השאלת חירום משאירה עוגן פתוח

מסלול ההשאלה הרגיל מבטל את העוגן ([`equipment-custody-toggle.service.ts:348`](server/services/equipment-custody-toggle.service.ts:348), fire-and-forget על `db` ולא `tx` בכוונה). מסלול החירום ב-[`equipment.ts:533-588`](server/routes/equipment.ts:533) עוקף את `performEquipmentCheckout()` ולא קורא ל-`invalidateCurrentAnchor`.

**למה זה מתפוצץ מאוחר:** הסולם ב-[`docking.service.ts:65`](server/services/docking.service.ts:65) בודק `checkedOutById` ראשון, אז העוגן היתום מוסתר בזמן ההשאלה. אחרי ההחזרה `checkedOutById` הופך null והפריט חוזר ל-`at_home` על סמך עוגן שקדם לחירום. בנוסף `stale-returned-sweep` מדלג עליו (מסנן פריטים עם עוגן פתוח) — ירוק שקרי כפול.

**התיקון:** `invalidateCurrentAnchor(db, { reason: "checkout" })` אחרי סיום הטרנזקציה, לפני `logAudit`. **לא בתוך `db.transaction`** — לשמר את ההפרדה שהמסלול הרגיל שמר עליה בכוונה. ~4 שורות + import.

### באג 2 — Undo משאיר `custodyState` לא מסונכרן

`snapshotEquipmentState()` ([`equipment-undo-tokens.ts:26`](server/routes/equipment/equipment-undo-tokens.ts:26)) שומר 9 שדות, בלי `custodyState`. אחרי undo: `checkedOutById = null` אבל `custodyState = "checked_out"`. שלוש תוצאות: סיווג `returned_unverified` · **סריקת חדר מסננת `ne(custodyState,"checked_out")` ב-[`docking.ts:520`](server/routes/docking.ts:520) → לא ניתן לעיגון מחדש לעולם** · `stale-returned-sweep` מסנן `= "returned"` → לא מנדנד.

**ההחלטה — לא מחיים את העוגן.** `nextAnchorState()` ([`equipment-anchor.service.ts:19`](server/services/equipment-anchor.service.ts:19)) מגדיר ביטול כמצב **סופי ואידמפוטנטי**. "לבטל ביטול" שובר את D-13.

**נבחר: שחזור `custodyState` בלבד, עם תוספת אחת** — אם המצב השמור הוא `docked` ואין עוגן פתוח, לשחזר `returned`. לפי `docking-first-class.md:117-118`, `docked` = "resting **with** a current anchor", `returned` = "resting without a current anchor — the open loop". שחזור עיוור ל-`docked` היה יוצר מצב סותר. הבחירה גם פותרת את שתי התוצאות השבורות: הפריט עובר את מסנן הסריקה **וגם** מנודנד.

**תאימות לאחור קריטית:** `previousState` הוא JSON ב-DB; טוקנים שכבר הונפקו (TTL 90 שניות) לא יכילו `custodyState`. השדה חייב להיות אופציונלי וה-handler חייב לדלג עליו כשהוא `undefined` — אחרת נכתוב null לעמודה `NOT NULL`.

### סדר עבודה — TDD, RED לפני GREEN

1. RED באג 1: חירום ← החזרה ← לא `at_home`. חייב להיכשל לפני התיקון
2. GREEN + `pnpm test` + `pnpm typecheck`
3. RED באג 2: השאלה ← undo ← `custodyState !== "checked_out"` + עובר מסנן sweep; ומבחן תאימות לטוקן ישן
4. GREEN + בדיקות
5. קומיט נפרד לכל באג

קודם אחפש כיסוי קיים ב-`tests/` ל-`classifyReconciliationBucket` ול-undo ואַרחיב, במקום לשכפל.

**גודל:** small tier לכל באג (~2 קבצים + מבחן). אין מיגרציה, אין שינוי סכימה.

## שלב ב' (מוצע) — התראה בתוכנה, אפס חומרה

**הטריגר:** עוגן בתחנת הבית נפסל **ואין השאלה פעילה**.

**עובד היום — אבל שני הטריגרים יזומי-אדם:**

| סיבה | מצב |
|---|---|
| `sweep_missing` | ✅ יורה — **ואף אחד לא מקבל הודעה.** זה הפער האמיתי |
| `not_found_here` | ✅ יורה, שקט |

**רדום עד שתהיה חומרה:** `rfid_elsewhere` · `possible_egress` (מוצג היום רק על ה-Command Board, בלי push).

**קבצים:**
- **חדש** `server/workers/undocked-departure.worker.ts` — תבנית [`stale-returned-sweep.worker.ts`](server/workers/stale-returned-sweep.worker.ts): 3 פאזות (זכאות תחת `pg_advisory_xact_lock` salt חדש → push מחוץ לטרנזקציה → ack), תקרת נדנודים, batched queries
- **שימוש חוזר** `vt_alert_acks` עם `alert_type` חדש. אומת: `VARCHAR(30) NOT NULL` ללא CHECK ([`001_initial_schema.sql:74`](migrations/001_initial_schema.sql:74)); `undocked_departure` = 18 תווים → **בלי מיגרציה**
- **נמענים:** `MANAGER_NOTIFY_ROLES` ([`notification-roles.ts:10`](server/lib/notification-roles.ts:10)) **+ רכז הציוד** דרך `resolveShiftCoordinator()` ([`equipment-coordinator.service.ts:111`](server/services/equipment-coordinator.service.ts:111)). לולאת `sendPushToUser` ולא `sendPushToRole` — locale פר-נמען, ו-`sendPushToRole` **עוקף `alertsEnabled`**
- רישום ב-`start-schedulers.ts` · audit kind ב-[`audit.ts:227`](server/lib/audit.ts:227) · counter ב-`metrics.ts` · מפתחות i18n he+en

**גודל:** feature tier, ללא מיגרציה.

## שלב ג' (מוצע) — פיילוט חומרה, ₪540–600

4 מדים ללא ממסר על עגינה אחת. **מטרה עיקרית: למדוד אמפירית את הסף שמבחין "נותק" מ"סוללה מלאה"** — סוללה מלאה צורכת מעט אך לא אפס. זו נקודת הכישלון העיקרית; אין לקבוע ערך בלי מדידה.

## שלב ד' (מוצע) — הרחבה + צד שרת

Adapter חדש ב-`packages/rfid-controller`; ingest שיוצר anchor `source: "smart_charger"` בחיבור ומפעיל את טריגר שלב ב' בניתוק. `smart_charger` כבר עובר את ה-CHECK — **אפס שינוי סכימה**.

**מגבלה שאומרים בקול:** חישת הספק מזהה **ניתוק**, לא **עזיבה**. מכשיר שנותק והושאר ליד העגינה ייראה כאילו עזב. ניסוח ההתראה: "אולי עזב — בדוק", לא "נעלם".

---

# חלק 3 — אימות E2E

## א. חיווט קוד — ארבעת השלבים (skill `wiring`)

הסיכון הממשי הוא **קוד מת** — הריפו כבר מכיל `untrackedDepartureAt` ו-`smart_charger` שנבנו ומעולם לא חוברו. אסור להוסיף שלישי.

- [ ] **נקודת כניסה קיימת** — `grep "startUndockedDepartureWorker" server/app/start-schedulers.ts` מחזיר תוצאה
- [ ] **מסלול קריאה מתועד** — סתירת עוגן → worker → `resolveShiftCoordinator` → `sendPushToUser` → `vt_alert_acks`
- [ ] **מבחן אינטגרציה מריץ את המסלול המלא** — לא רק unit; מבחן שמתחיל מ-`POST /api/docking/rooms/:roomId/sweep` עם פריט לא-מאושר ומסתיים בבדיקת שורת ack
- [ ] **אפס יתומים** — כל מפתח i18n, counter ו-audit kind שנוסף באמת נקרא

## ב. חיווט פיזי (שלב ג')

- [ ] כל מד ממופה ל-`dockId` הנכון בקונפיגורציה — **ולא לפי מיקום פיזי משוער**
- [ ] מבחן ניתוק פר-שקע: לנתק מכשיר אחד → האירוע מגיע עם ה-`dockId` הנכון ולא של השכן (**טעות החיווט הנפוצה ביותר**)
- [ ] מבחן סוללה מלאה: להשאיר מחובר עד סיום טעינה → **אין** התראת שווא
- [ ] הפסקת חשמל/רשת: הבקר לא מייצר גל התראות שווא כשהוא חוזר

## ג. שלוש השכבות (כלל 1 ב-`code-quality-and-skills.md`)

- **Backend** — `pnpm test` · `pnpm typecheck` (שני tsconfig) · `pnpm architecture:gates` · `pnpm tenant:lint:touched`. מקרים: השאלה פעילה → אין התראה · cooldown → נחסם · תקרת נדנודים · push נכשל → אין ack · **בידוד רב-דיירי**
- **Frontend** — ה-push נפתח ב-`/equipment/:id` הנכון; אימות במכשיר עם `argent-device-interact`
- **UX/UI** — צילום מסך של ההתראה בעברית, RTL תקין, `pnpm i18n:check` ירוק

**רישום ראיות:** `docs/audit/PROOF_ALIGNMENT_LOG.md` לכל שלב — מה נבדק בפועל, לא מה אמור להיות נכון.

---

# חלק 4 — שמירה כחלק מ-G4

## הקובץ שנוצר

**`docs/plans/g4-undocked-departure-alert.plan.md`** — התוכנית הזו נשמרת בריפו לפי תבנית ה-plan הקיימת (`docs/plans/rfid-controller-package.plan.md`, `docs/plans/consolidated-audit-10x/subspecs/R-*.plan.md`). כותרת המסמך תסמן במפורש **Scope: G4** ו-**Status: proposed**.

## עוגן ה-G4 בריפו

[`ADR-009`](docs/architecture/adr/ADR-009-native-push-and-emergency-alerting.md) הוא מסמך ה-G4 בריפו הזה — הוא קובע את ארכיטקטורת ה-push (APNs/FCM) ואומר במפורש *"the BUILD is G4 work"*. ההתראה שלנו היא **צרכן** של התשתית הזו, לא התשתית עצמה.

לכן: **שורת הפניה אחת** ב-ADR-009 תחת §5 (Server changes, BUILT at G4), שמקשרת למסמך התוכנית החדש כצרכן נוסף של מסלולי השליחה. **לא משנים את ההחלטות של ה-ADR** ולא מזיזים אותו מ-proposed.

## חלוקת השלבים

- **שלבים א'+ב' נכנסים ל-G4** — worker + push, אותה תשתית התראות. אין UI חדש ב-RN
- **שלבים ג'–ד' הם מסלול חומרה נפרד** ולא חוסמים את G4; משלימים אותו כשהחומרה תגיע
- **תלות שכדאי לציין:** שלב ב' שולח דרך `sendPushToUser`. אם G4 יחליף את מסלול ה-Web Push ב-APNs/FCM לפי ADR-009 — ההתראה שלנו עוברת איתו אוטומטית, כי היא משתמשת באותן פונקציות fan-out
- **מנדט הכישורים:** כל עבודת RN טעונה טעינת הכישורים מ-`rn-migration-skills-mandate.md` לפני כתיבת קובץ, וסעיף **"Skills compliance"** בגוף ה-PR

---

## מה לא עושים

❌ לא מחיים את `untrackedDepartureAt` · ❌ לא כותבים `custodyState = "untracked"` (legacy לפי §9; ADR-006 אוסר על RFID לשנות custody) · ❌ לא נוגעים במסלול ההשאלה הרגיל — הוא כבר נכון · ❌ לא מרחיבים את `computeAlerts` בצד לקוח (push-only, כמו chargeAlert)

## מקורות

- [UL Solutions — Hospital Grade Power Strips / HCOA](https://code-authorities.ul.com/hospital-grade-power-strips-health-care-facility-outlet-assemblies/)
- [JSDEWES — NILM Implementation Framework Overview](http://www.sdewes.org/jsdewes/pid11.0471)
- [Athom — No-Relay Power Monitoring Plug](https://www.athom.tech/blank-1/no-relay-power-monitoring-us-plug-for-esphome)
- [Shelly — Script Language Features](https://shelly-api-docs.shelly.cloud/gen2/0.14/Scripts/ShellyScriptLanguageFeatures/)
- [Terso Solutions — RAIN RFID Cabinets](https://www.tersosolutions.com/rfid-cabinets)
- [Ergotron LiFeKinnex Smart Battery Dock](https://www.ergotron.com/en-us/products/product-details/lifekinnex)
- [ServerTech — Monitored PDUs](https://www.servertech.com/solutions/monitored-pdu/)
- [MOKOSmart — BLE Asset Tracking Tags](https://www.mokosmart.com/asset-tracking-tag/)
