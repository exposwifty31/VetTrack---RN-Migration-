# VetTrack — אינדקס כל התוכניות והמסמכים (לצורכי מחקר)

> נכתב 2026-08-10. מקטלג כל תוכנית/roadmap/מסמך-קונטקסט שהוביל למצב הנוכחי, מקובץ לפי נושא, עם **סטטוס · נתיב · למה זה חשוב**. סטטוסים אומתו מול תוכן הקבצים.
> **מקרא סטטוס:** LIVE = פעיל/מחייב · SHIPPED = מומש · HISTORICAL = תיעוד-עבר · SUPERSEDED = הוחלף · PENDING = מעוצב, טרם קוד.

---

## 0. Cross-repo / governance (התחל כאן)

| מסמך | סטטוס | נתיב | למה |
|---|---|---|---|
| **Master Migration Anchor** | LIVE (frozen SoT) | `~/.claude/plans/goofy-mapping-hellman.md` | מקור-האמת הקפוא של סולם G0→G5; שני ה-repos; no-go triggers |
| **קונטקסט שני ה-repos** | LIVE (נכתב היום) | `VetTrack-RN-Migration/docs/RESEARCH-CONTEXT-two-repos.md` | הפער שסגרתי — cross-repo *וגם* current-to-gates |
| **Native Migration Roadmap** | LIVE (pre-gate framing) | `vettrack/docs/design/native-migration-roadmap.md` | המסמך היחיד בתוך-repo שמתאר את שני המאגרים + porting rule + N0–N5 |
| **NORTH_STAR** | LIVE | `vettrack/NORTH_STAR.md` | מדד-ההצלחה: שתי הגשות ב-review → 2.0 Task 1.2 |
| **scope-change-2026** | LIVE (scope SoT) | `vettrack/docs/scope-change-2026.md` | מיגרציות 142–143 צמצמו ל-equipment-first; הסירו ER/מטופלים/תרופות |
| **AGENTS.md** (RN) · **CLAUDE.md** (שני ה-repos) | LIVE governance | RN root · שני ה-repos | כללי-עבודה + stack קפוא + "אין commit/push/PR בלי אישור בעלים" |

---

## 1. סולם ההגירה RN — G0→G5 (הליבה)

| שער | מסמך | סטטוס | נתיב |
|---|---|---|---|
| מקור | React-Native migration research | HISTORICAL (מסגרת "bare CLI" הוחלפה ב-Expo prebuild) | `vettrack/docs/design/react-native-migration-research.md` |
| G1 | SCAFFOLD-PLAN | SHIPPED (חוץ מ-slice 8 NFC, חסום-חומרה) | `VetTrack-RN-Migration/SCAFFOLD-PLAN.md` |
| G2 | G2-PLAN | HISTORICAL (עבר) — טבלת ה-pin של SDK 57 | `VetTrack-RN-Migration/G2-PLAN.md` |
| G2 | g2-preregistration (v2 lock) | LIVE (sealed) | `VetTrack-RN-Migration/docs/g2-preregistration.md` |
| G2 | g2-blind-preference-kit | SUPERSEDED (S1 עבר לפסק-דין בעלים) | `VetTrack-RN-Migration/docs/g2-blind-preference-kit.md` |
| G2 | g2-ntag-ndef-spec | LIVE (pending hardware) | `VetTrack-RN-Migration/docs/g2-ntag-ndef-spec.md` |
| G2 | מדידת G2 על Pixel — continuity | LIVE | `~/.claude/plans/where-we-last-stopped-structured-sphinx.md` |
| G2.5 | DESIGN-LANGUAGE | SHIPPED (open items) | `VetTrack-RN-Migration/DESIGN-LANGUAGE.md` |
| G2.5 | g2_5-results | LIVE (exit-bar עבר) | `VetTrack-RN-Migration/docs/g2_5-results.md` |
| G3 | G3-PLAN | LIVE (P1–P9 store-compliance) | `VetTrack-RN-Migration/docs/G3-PLAN.md` |
| G3 | g3-results | LIVE (§5 שער-בעלים ריק) | `VetTrack-RN-Migration/docs/g3-results.md` |
| G4/G5 | vettrack-g4-g5-slice13-verified | LIVE | `VetTrack-RN-Migration/docs/vettrack-g4-g5-slice13-verified.md` |
| G4 | תיקון תוכנית G4 — דוק חכם בלי חשמלאי | LIVE (מהיום 2026-08-10) | `~/.claude/plans/golden-dazzling-pancake.md` |
| **המשך (הנוכחי)** | **תוכנית ההמשך אל החנות + זיהוי-הסרת-ציוד** | **LIVE (נכתבה בסשן זה)** | `~/.claude/plans/tranquil-prancing-sprout.md` |

---

## 2. חנות / הפצה (Store / distribution)

| מסמך | סטטוס | נתיב | למה |
|---|---|---|---|
| **Pilot→Public Distribution Plan (Apple+Play)** | LIVE | `~/.claude/plans/goal-reconstruct-project-continuity-tranquil-diffie.md` | תוכנית-העל של שתי החנויות (superset) |
| Android Play First Submission (T0–T13) | LIVE (on-hold) | `~/.claude/plans/jazzy-wibbling-axolotl.md` | ה-playbook של ערוץ-אנדרואיד המוביל; שעון 12×14 |
| release-build-program | LIVE | `vettrack/docs/plans/release-build-program.md` | שער-ההגשה T-06…T-16 |
| play-console-submission-pack | LIVE (fill-ready) | `vettrack/docs/mobile/play-console-submission-pack.md` | checklist אנדרואיד, Data Safety, שערי-אימות |
| native-ship-checklist + master-prompt | LIVE | `vettrack/docs/mobile/native-ship-checklist.md` · `…master-prompt.md` | מסלול iOS |
| store-metadata · release · capacitor-native-app | LIVE (operator) | `vettrack/docs/mobile/*` · `vettrack/docs/capacitor-native-app.md` | metadata, build/install של ה-Capacitor |

---

## 3. תוכנית 2.0 + מסמכי-מוצר

| מסמך | סטטוס | נתיב | למה |
|---|---|---|---|
| program-plan (75K) | LIVE | `vettrack/docs/design/program-plan.md` | התוכנית קדימה: per-role UX, web-console, board |
| vettrack-2.0-roadmap | LIVE | `vettrack/docs/vettrack-2.0-roadmap.md` | 18 משימות; freeze/resume; Task 1.3 transfer |
| master-plan-2026-07 (74K) | LIVE | `vettrack/docs/plans/master-plan-2026-07.md` | Layers 0–6; predicates אנדרואיד |
| plan-validation-register · platform-strategy-research | LIVE (בסיס-מחקר) | `vettrack/docs/design/*` | מאמת את תזת "native מובחן, לא wrapper" (App-Review 4.2) |
| phase-7-execution-roadmap | LIVE (web) | `vettrack/docs/design/phase-7-execution-roadmap.md` | ה-Web Management Console (המשטח השלישי) |
| autopilot-policy-layer · case-spine-allowlist | PENDING (2.0 design) | `vettrack/docs/design/*` | שער-אישור-אנושי ל-Autopilot · גבול operational/PHI |
| session-recap — 2.0 corpus consolidation | LIVE (meta) | `~/.claude/plans/session-recap-vettrack-wobbly-taco.md` | "תוכנית אחת, supersede-by-reference" |

---

## 4. מודל הציוד / דוקינג / RFID (הליבה של חלק ב' בתוכנית הנוכחית)

| מסמך | סטטוס | נתיב | למה |
|---|---|---|---|
| docking-first-class | LIVE (P1 מומש, P2–P4 proposed) | `vettrack/docs/design/docking-first-class.md` | מודל evidence-stream: anchors sticky-until-contradicted, reconciliation buckets |
| Docking impl plan (P0–P4) | LIVE | `~/.claude/plans/greedy-imagining-blossom.md` | תאום-המימוש של מסמך-העיצוב |
| rfid-controller-package.plan · distributed-seal | LIVE (gated) | `vettrack/docs/plans/rfid-controller-package.plan.md` · `~/.claude/plans/rfid-controller-distributed-seal.md` | ה-middleware החתום — התבנית לכל חיבור-חומרה |
| **התראה על ציוד שיצא מדוק בלי סריקה** | LIVE | `~/.claude/plans/tranquil-soaring-owl.md` | **ישירות חלק ב'** — נתיב `sweep_missing`/undocked-without-scan |
| offline-first-architecture-plan | LIVE (approved seq.) | `vettrack/docs/offline-first-architecture-plan.md` | offline-as-transaction-log; Code Blue לעולם לא queues |
| shift-logic-plan | SHIPPED (Ph1) / parked (Ph2) | `vettrack/docs/shift-logic-plan.md` | on-shift roster-derived; authority Strategy A |

---

## 5. קורפוס-מחקר החומרה (זיהוי-הסרת-ציוד — ד)

| מסמך | תוכן | נתיב |
|---|---|---|
| compass 1 | בחירת מד-ספק per-outlet (Athom HLW8032) | `VetTrack-RN-Migration/docs/compass_artifact_wf-a803155f….md` |
| compass 2 | **פוסל HLW8032** לזיהוי-נוכחות; שבב טוב רק לסטטוס-טעינה | `…compass_artifact_wf-e2960056….md` |
| compass 3 (סינתזה) | **תוכנה קודם** (`sweep_missing`); אם חומרה — חיישן-מגע Zigbee | `…compass_artifact_wf-bc920b6f….md` |
| G4 דוק-חכם בלי חשמלאי | תוכנית G4 צד-RN | `~/.claude/plans/golden-dazzling-pancake.md` |
| התראת undocked-without-scan | הצד התוכנתי | `~/.claude/plans/tranquil-soaring-owl.md` |

**סיכום המשפך (compass 1→2→3):** בחר מד-חשמל → מד-חשמל שגוי לנוכחות → אל תתחיל בחומרה; פאזה 1 = תוכנה (`sweep_missing`, מאומת קיים-ולא-מחובר), פאזה 2 = חיישן-מגע Zigbee דרך קלון ה-RFID. פירוט מלא ב-`tranquil-prancing-sprout.md` חלק ב'.

---

## 6. HISTORICAL / superseded (לא לטעות בהם כיעדים)

| מסמך | למה היסטורי |
|---|---|
| due-diligence-report | banner: "Historical snapshot (April 2026)"; מפנה לדומיינים שהוסרו |
| PLAN.md (vettrack) | banner 2026-07-28: "התוכנית הפעילה היא 2.0 roadmap"; Phase-0 היסטורי |
| react-native-migration-research | מסגרת "bare RN CLI" הוחלפה ב-Expo SDK 57 + prebuild |
| deep-research-report (2) | על Claude Code API — לא רלוונטי ל-VetTrack (red herring) |

---

## מה נשלח בצ׳אט (החבילה)

**חדשים (נכתבו בסשן זה):** מסמך הקונטקסט של שני ה-repos · האינדקס הזה · תוכנית ההמשך.
**מקורות-מפתח:** Master Anchor · תוכנית-ההפצה Apple+Play · NORTH_STAR · native-migration-roadmap · scope-change · G3-PLAN · g3-results · vettrack-g4-g5-slice13 · README · AGENTS · play-console-submission-pack · docking-first-class.
**קורפוס-חומרה:** 3 compass artifacts · tranquil-soaring-owl · golden-dazzling-pancake.
כל השאר מקוטלג למעלה עם נתיב — אפשר לבקש כל קובץ גולמי נוסף.
