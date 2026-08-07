# Direction 1c — אורורה (Aurora)

Font: **Rubik** (400–700). The most "liquid" of the three: deep indigo base with
a static aurora glow (violet + cyan radial gradients — zero GPU cost), violet
primary, pill-shaped controls, the largest radii, softest spring motion.

## Token table (Uniwind `global.css`)

```css
@layer theme {
  :root {
    @variant dark {
      /* backgrounds & surfaces */
      --color-background: #0D0B1C; /* + static aurora: radial violet .26–.34 / cyan .14 */
      --color-surface: #16122E;
      --color-surface-raised: #1D1840;
      --color-glass: rgba(167,139,250,.12);        /* tier 1 · blur 22px, violet-tinted */
      --color-glass-strong: rgba(167,139,250,.18); /* tier 2 · blur 30px */
      /* text */
      --color-foreground: #F3F1FA;
      --color-muted: #A6A0C3;
      --color-text-tertiary: #8B84AD; /* iteration 2: third metadata tier ("עודכן לפני…", timestamps, mono IDs) */
      /* brand & actions */
      --color-primary: #7C3AED;
      --color-primary-foreground: #FFFFFF;
      --color-accent: #22D3EE;
      /* statuses */
      --color-success: #4ADE80;   /* זמין */
      --color-info: #38BDF8;
      --color-warning: #FBBF24;   /* מושאל */
      --color-danger: #F87171;    /* Code Blue family — NEVER glassed */
      --color-danger-solid: #DC2626;  /* iteration 3: badge / emergency-active fill; white text 4.83:1 */
      /* shape */
      --radius-sm: 14px; --radius-md: 20px; --radius-lg: 28px; --radius-sheet: 36px;
      /* spacing */
      --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-6: 24px; --space-8: 32px;
      /* type */
      --text-title: 30px; --text-body: 16px; --text-caption: 13px;
    }
    @variant light {
      --color-background: #F7F5FC;
      --color-surface: #FFFFFF;
      --color-surface-raised: #FFFFFF; /* elevation via shadow 0 14px 34px rgba(23,19,49,.06) */
      --color-glass: rgba(255,255,255,.55);
      --color-glass-strong: rgba(255,255,255,.70);
      --color-foreground: #171331;
      --color-muted: #5B5680;
      --color-text-tertiary: #6E6893;
      --color-primary: #6D28D9;
      --color-primary-foreground: #FFFFFF;
      --color-accent: #0891B2;
      --color-success: #15803D;
      --color-info: #0369A1;
      --color-warning: #B45309;
      --color-danger: #DC2626;
      --color-danger-solid: #B91C1C;  /* badge / emergency-active fill; white text 6.47:1 */
      --radius-sm: 14px; --radius-md: 20px; --radius-lg: 28px; --radius-sheet: 36px;
      --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-6: 24px; --space-8: 32px;
      --text-title: 30px; --text-body: 16px; --text-caption: 13px;
    }
  }
}
```

Recommended extension: `--color-stale: #E879F9` (dark) / `#A21CAF` (light) —
fuchsia rather than the system purple, so "לא עודכן" stays distinct from the
violet brand color (lesson 2 adapted to this palette).

### Iteration 2 — chip-on-tint rule (light theme)

Status text placed on its own 10% tint over white fails AA at the base status
hues. Light-theme chips and status body lines therefore use one-step-darker
"on-tint" values (dark theme keeps the base tokens — all pass there):

| Status | on-tint text (light) | ratio on 10% tint |
|---|---|---|
| success | `#166534` | 6.14 |
| warning | `#92400E` | 6.08 |
| overdue (danger) | `#B91C1C` | 5.45 |
| stale | `#A21CAF` | 5.36 |

Mono IDs (`EQ-104`) use `--font-mono` (ui-monospace stack), tertiary color, LTR.

## Motion language — "נוזלי"

- The softest of the three. Presets: `fast 200ms`, `base 280ms`, `sheet ~380ms`.
  Springs everywhere: stiffness 260, damping 26, ~2% overshoot.
- Bottom sheet: spring rise with a single soft settle; backdrop dim 200ms.
- Press state: scale .96 with spring-back on release — the signature feel.
- Status change: color crossfade 200ms.
- The aurora glow is **static** (painted gradient, never animated). No parallax,
  no shimmer except a single 400ms glow sweep on successful scan — the one
  celebratory moment.
- Never animate: Code Blue surfaces, list rows, blur values.

## Glass recipe

- **T1** — blur 22px, `rgba(167,139,250,.12)`, hairline `rgba(167,139,250,.20)`:
  search pill, secondary home card. Max one T1 region per screen.
- **T2** — blur 30px, `rgba(167,139,250,.18)`: checkout sheet only.
- Hard cap: 2 glass layers per screen. Emergency screens: zero.

## AA evidence (measured, WCAG ratio ≥4.5 required)

| Pair | Dark | Light |
|---|---|---|
| foreground / background | 17.35 | 16.54 |
| foreground / surface | 16.18 | 17.89 |
| muted / background | 7.80 | 6.29 |
| muted / surface | 7.27 | 6.80 |
| primary-fg / primary | 5.70 | 7.10 |
| foreground / glass∘bg | 14.89 | 17.32 |
| muted / glass∘bg | 6.69 | 6.58 |
| success / surface | 10.39 | 5.02 |
| warning / surface | 10.84 | 5.02 |
| danger / surface | 6.54 | 4.83 |
| info / surface | 8.45 | 5.93 |
| stale / surface | 7.36 | 6.32 |

### Iteration 2 additions (measured)

| Pair | Dark | Light |
|---|---|---|
| text-tertiary / surface | 5.17 | 5.17 |
| text-tertiary / background | 5.55 | 4.78 |
| text-tertiary / glass∘bg (T1) | 4.76 | 5.00 |
| overdue text / its 12% tint (dark) · 10% tint (light) | 5.58 | 5.45 |
| warning holder-line / surface | 10.84 | 6.08 (on-tint #92400E) |
| stale meta-line / surface | 7.36 | 5.36 (on-tint #A21CAF) |

Rule: tertiary text passes AA on glass T1 (4.76 dark) — so the numeric summary
strip may sit on glass, but three-tier equipment rows always sit on opaque
`--color-surface`.

## Iteration 3 — identity + operational home

**Logo mark.** The original VT app-icon geometry (T crossbar + V bars meeting at
a point) is kept; gradient remapped indigo → Aurora violet `#A78BFA→#8B5CF6`,
plus a `#22D3EE` cyan dot at the V apex. The tile is always dark
(`#1D1840→#0D0B1C`) in both themes.

**Wordmark.** `Vet` in `--color-foreground`; `Track` in a violet→cyan gradient —
dark `#A78BFA→#22D3EE` (7.13 / 10.74 on background), light `#6D28D9→#0E7490`
(6.57 / 5.03).

**Blur-budget decision (home).** Layer 1 = top app bar (glass T1; content
scrolls under it). Layer 2 is deliberately unspent. The bottom tab bar is
**opaque surface-raised** because the חירום tab sits on it — zero glass applies
to its icon and active state too (active = solid `--color-danger-solid`, white
content).

**Module → token mapping (home).**

| Module | Surface | Text | Accents |
|---|---|---|---|
| Top app bar | glass T1 (the screen's only blur) | foreground / muted | badge: danger-solid + white |
| Greeting + date | background | foreground / muted | — |
| מוכנות ציוד | surface (bezeled) | tertiary label, success hero | metric colors: success/warning/danger |
| דורש תשומת לב | surface (danger-tinted border when populated) | muted (empty) / status colors | “!” icons on 10–14% tints |
| חריגות | surface | foreground + tertiary reason line | count badge: danger-solid + white |
| Bottom nav | surface-raised, opaque | active: accent-violet · inactive: muted | חירום: danger, active danger-solid |

### Iteration 3 AA evidence (measured)

| Pair | Dark | Light |
|---|---|---|
| white on badge (danger-solid) | 4.83 (#DC2626) | 6.47 (#B91C1C) |
| badge fill vs page background (non-text, ≥3) | 4.02 | 6.47 vs white |
| wordmark `Track` gradient ends / background | 7.13 · 10.74 | 6.57 · 5.03 |
| active tab (violet) / nav surface | 6.14 | 6.57 (on white) |
| חירום tab color / nav surface | 6.04 | 6.47 |
| readiness hero (success) / surface | 10.39 | 5.02 |
| warning “!” + reason lines / surface | 10.84 / 5.17 (tertiary) | 7.09 (#92400E) / 5.17 |
