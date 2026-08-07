# Handoff: VetTrack RN — Aurora Home Screen (G2.5, iteration "4a")

## Overview
The approved G2.5 "Aurora" design-language home screen for VetTrack's React
Native app: operational dashboard (equipment readiness, attention items,
exceptions) with the QR/NFC scan as the primary action, a Liquid-Glass top app
bar with the original VT logo, and a 4-tab bottom nav. Hebrew-first, full RTL,
dark default + light parity.

## About the Design Files
The files in this bundle are **design references created in HTML** (Design
Component templates) — prototypes showing intended look and behavior, not
production code. The task is to **recreate these designs in the VetTrack RN
codebase** (React Native / Expo, Uniwind for styling, RTL-default) using its
established patterns. Styling values below map 1:1 onto the semantic tokens in
`direction-1c-aurora.md` (Uniwind `global.css`, `@variant dark` / `@variant light`).

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, and copy are final.
Recreate pixel-perfectly with the codebase's components. All text pairs are
AA-verified (evidence tables in `direction-1c-aurora.md`).

## Screens / Views

### 1. Home (dark default; light equivalent)
390×844 reference frame. Font: **Rubik** (Hebrew+Latin), RTL layout direction.
Background: `--color-background` `#0D0B1C` + static aurora glow —
`radial-gradient(500px 380px at 85% -6%, rgba(124,58,237,.34), transparent 65%)`
and `radial-gradient(440px 340px at 8% 108%, rgba(34,211,238,.14), transparent 65%)`.
Light: `#F7F5FC` with the same gradients at `rgba(109,40,217,.10)` / `rgba(8,145,178,.06)`.
The glow is painted once, never animated.

Vertical order (all cards inset 22px horizontally, 10–12px between cards):

1. **Top app bar — "floating glass island" (alternative A, applied)**
   Floating pill, 12px side margins, `border-radius:999px`, padding 4–6px.
   THE ONLY BLUR LAYER ON THIS SCREEN: `backgroundColor rgba(167,139,250,.12)`
   + `blur(22px)` (light: `rgba(255,255,255,.60)` + blur 22), hairline border
   `rgba(167,139,250,.20)` / `#E9E4F5`, inner top highlight.
   RTL content, right→left:
   - Logo tile: **the original `vt-mark.svg` rendered as-is** (28–32px,
     `border-radius:8–9px`), wrapped in a 2px glass bezel
     `rgba(167,139,250,.20)` with violet glow `0 0 14px rgba(139,92,246,.40)`
     (light: `rgba(109,40,217,.12)` bezel, soft shadow). Never redraw the mark.
   - Wordmark 16–17px Rubik 700, `dir="ltr"`: "Vet" in `--color-foreground`;
     "Track" **solid** `#A78BFA` (dark) / `#6D28D9` (light) at nav sizes.
   - Icon buttons, each 44×44pt hit target, 36px visual circle
     `rgba(243,241,250,.07)` (light `rgba(23,19,49,.05)`): search, bell,
     settings. Icons are 20×20 stroke SVGs, stroke-width 1.7–1.8, round caps,
     color = foreground (exact paths in the .dc.html).
   - Bell badge: "9+", `min-width:17px; height:16px; radius:999`, background
     `--color-danger-solid` `#DC2626` / `#B91C1C`, white 10px/700, no ring,
     shadow `0 1px 4px rgba(0,0,0,.35)`, offset top:3 left:3 inside the button.
   - Avatar: 32px circle, gradient `150deg #8B5CF6→#6D28D9`, white initial,
     2px ring `rgba(243,241,250,.25)` / `rgba(109,40,217,.20)`.
   (Alternative B — anchored full-width glass bar with a segmented icon
   capsule — is in the same file for reference; A was chosen.)

2. **Greeting**: "בוקר טוב, Dan" (Dan wrapped LTR) 22px/700 foreground;
   date "יום שישי, 7 באוגוסט 2026" 12.5px muted.

3. **Scan hero — the primary action (never demote below the fold)**
   Double-bezel card: outer wrapper `rgba(124,58,237,.14)` bg +
   `rgba(139,92,246,.38)` border, 6px padding, radius 30; inner
   `linear-gradient(150deg,#8B5CF6,#6D28D9)`, radius 24, padding 18–20px,
   inner highlight `inset 0 1px 1px rgba(255,255,255,.30)`.
   Row: 50px white-alpha circle with target icon · texts "סריקת תווית"
   19px/700 white + "צ'ק־אאוט מהיר · QR / NFC" 12.5px `rgba(255,255,255,.85)`
   · trailing 34px circle `rgba(255,255,255,.16)` with ← arrow (RTL forward).
   Identical in both themes. This is the only fully saturated element on the
   screen — all other cards are quiet surfaces.

4. **Readiness card** (`--color-surface` `#16122E` / white, radius 24,
   border `rgba(167,139,250,.14)` / `#E9E4F5`):
   header row: label "מוכנות ציוד" 12.5px/600 tertiary `#8B84AD`/`#6E6893`,
   trailing hero "97%" (or "100%") 26px/700 `--color-success` `#4ADE80`/`#15803D`
   + "כיסוי זמין" 12.5px muted; hairline divider; 4-column metric grid
   (numbers 17px/700, LTR; labels 10.5px muted): מוכן / לא מוכן / מושאלים /
   בשימוש. Non-zero problem metrics colored: לא מוכן → danger, מושאלים → warning
   (light uses on-tint darks `#B91C1C` / `#92400E`).

5. **"דורש תשומת לב" card** — two states, state-colored border:
   - *Empty (good news)*: border `rgba(74,222,128,.20)` / `rgba(21,128,61,.22)`.
     Label row, then centered: 38–40px ring (success 8–10% tint bg, 1.5px
     success border at 30–35%) containing a CSS checkmark (2.5px success
     strokes); "הכל תחת שליטה" 14px/600 foreground; "אין איחורים, תחזוקה או
     התראות פתוחות" 11.5–12px muted.
   - *Populated*: border `rgba(248,113,113,.25)` / `rgba(185,28,28,.25)`.
     Rows (min-height 48–52): 28px "!" circle on 10–14% status tint, name LTR
     13.5px/600, status line 11.5px in the status color
     (e.g. "באיחור החזרה · ד״ר כהן · צפוי 13:00" in danger), trailing ‹ chevron.

6. **"חריגות" card**: header "חריגות" 14.5px/700 + count badge "60"
   (danger-solid bg, white 11.5px/700, radius 999, min-width 26) + trailing ‹.
   Rows like attention rows; reason line "ללא סריקה ביותר מ־14 ימים" in
   tertiary. Warning "!" icons: `#FBBF24` on 12% tint (light `#92400E` on 10%).

7. **Bottom nav — deliberately OPAQUE** (`--color-surface-raised` `#1D1840` /
   white, top hairline). No glass: the emergency tab sits here and Code Blue
   doctrine forbids glass on anything emergency-related, including icon and
   active state. 4 tabs, each ≥44pt: היום (active: icon in 48×28 pill of
   `rgba(167,139,250,.16)` / `rgba(109,40,217,.10)`, icon+label `#A78BFA` /
   `#6D28D9`) · ציוד · חירום (always `--color-danger` `#F87171` / `#B91C1C`;
   active = SOLID `--color-danger-solid` fill with white content, never a tint)
   · תפריט. Labels 11px.

## Interactions & Behavior (motion language — "נוזלי")
- Presets: fast 200ms, base 280ms, sheet ~380ms. Springs: stiffness 260,
  damping 26, ~2% overshoot (Reanimated `withSpring`).
- Press: scale .96 with spring-back — the signature feel. Scan hero included.
- Status change: 200ms color crossfade. Aurora glow static, never animated.
- One celebratory moment only: 400ms glow sweep on successful scan.
- Never animate: Code Blue surfaces, list rows, blur values. Animate
  transform/opacity only (90fps budget: 0 dropped frames is the bar).
- Blur budget: max 2 layers/screen. Home spends ONE (top bar). Checkout sheet
  screens spend T2 (blur 30) on the sheet only.

## State Management
- `readiness`: {total, ready, notReady, checkedOut, inUse} + derived coverage %.
- `attentionItems[]`: {equipmentName, severity: overdue|maintenance, holder?,
  dueAt?} — empty array renders the "all clear" state.
- `exceptions`: {count, items[]: {name, reason}} — count feeds the red badge.
- `unreadNotifications` (caps display at "9+").
- Theme: dark default; light via Uniwind variant. RTL is the layout default
  (I18nManager RTL); equipment names/IDs/times render inside LTR spans.

## Design Tokens
Authoritative table (both variants + AA evidence):
`direction-1c-aurora.md` in this bundle. Highlights: bg `#0D0B1C`/`#F7F5FC`,
surface `#16122E`/`#FFFFFF`, raised `#1D1840`, fg `#F3F1FA`/`#171331`, muted
`#A6A0C3`/`#5B5680`, tertiary `#8B84AD`/`#6E6893`, primary `#7C3AED`/`#6D28D9`
(gradient `#8B5CF6→#6D28D9` on hero), accent `#22D3EE`/`#0891B2`, success
`#4ADE80`/`#15803D`, warning `#FBBF24`/`#B45309` (on-tint `#92400E`), danger
`#F87171`/`#DC2626`, danger-solid `#DC2626`/`#B91C1C`, glass T1
`rgba(167,139,250,.12)`+blur22 / `rgba(255,255,255,.55–.60)`+blur22, T2
α.18/blur30. Radii 14/20/28/36 (cards here use 24–30, nav pill 999). Spacing
4/8/12/16/24/32. Type: title 30, body 16, caption 13 (screen uses 10.5–26px
as specified per element).

## Assets
- `vt-mark.svg` — the ORIGINAL VT app-icon mark supplied by Dan (indigo→violet
  gradient on navy). Policy: embed as-is; only glass treatment around it
  (bezel, glow, rounded corners). Do not redraw, recolor, or reshape.
- All icons are inline stroke SVGs defined in the .dc.html — no icon font.

## Files
- `DirAurora4.dc.html` — the corrected home screens (dark populated + light
  empty), both TopNav alternatives (A dark/light, B dark/light), and the
  decision card. Markup between `<x-dc>` tags is plain HTML with inline styles;
  ignore `support.js` (preview runtime only).
- `vt-mark.svg` — original logo asset.
- `direction-1c-aurora.md` — full token table (Uniwind format), motion
  language, glass recipe, module→token mapping, AA evidence.
- `screenshots/` — 2x PNG captures: `01-topnav-alternatives.png` (A + B,
  dark/light), `02-home-dark-populated.png`, `03-home-light-empty.png`.
