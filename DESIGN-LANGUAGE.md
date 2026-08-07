# G2.5 — Design Language (owner-mandated gate)

> Anchored 2026-08-07 by owner decision: **visual design matters as much as functionality.**
> "Design while building" is rejected — no G3 screen is built before the language below exists
> as tokens and primitives (not documents).

## Direction

Apple **Liquid Glass approximation** — depth, glass layers, restrained motion. Hebrew-first
(RTL, Hebrew default), dark theme as default with a fully-equivalent light theme.

## Process (three stages)

**Stage A — direction exploration (Claude Design).** A dedicated claude.ai/design project
("VetTrack RN — G2.5 Design Language") produces 2–3 complete look-directions across the three
hero-flow screens (Home, Equipment list, Checkout-confirm sheet). The owner picks by eye —
the same way S1 was decided.

**Stage B — token translation (still design-side).** The winning direction is distilled into a
semantic token table — colors, typography, spacing, radii, glass tiers — in Tailwind-v4-style
CSS variable names that map directly onto Uniwind's `src/global.css`. That table is the
hand-off document.

**Stage C — verified implementation (this repo).** Build the five primitives with the tokens
(Button, Card, Sheet, ListRow, StatusBadge), restyle the hero screens with them, and verify on
the Pixel — including a re-run of the G2 measurement harness to prove the new look did not
break the 90fps floors.

## Scope (all five must exist as tokens/primitives before any G3 screen)

1. **Color system** — semantic token set in `src/global.css` (primary/surface/status/danger
   scales, dark + light, AA-verified pairs).
2. **Typography** — Hebrew-first font decision, type scale, weights, line-heights as Uniwind
   utilities.
3. **Spacing & shape** — spacing scale, radii, elevation/blur vocabulary (the Liquid Glass
   approximation lives here).
4. **Motion language** — named transition/spring presets on Reanimated (durations, easings,
   when-to-animate rules), haptics vocabulary.
5. **Component primitives** — Button, Card, Sheet, ListRow, StatusBadge built from 1–4; the
   G2 hero screens restyled with them as the proof.

## Binding guardrails (do NOT violate)

- **AA contrast minimum on all text — including on glass surfaces.**
- **Full RTL:** layouts designed right-to-left from the start, not mirrored after the fact.
- **Zero glass/translucency on emergency (Code Blue) surfaces** — out of scope by doctrine.
- **Blur thrift:** at most one–two glass layers per screen (the 90fps GPU budget is a G2-locked
  floor, not a suggestion).
- **Touch:** targets ≥44pt, felt press states.
- `withUniwindConfig` stays outermost in `metro.config.js`; never wrap RN/Reanimated
  components with `withUniwind` (they already accept `className`).

## Exit bar

- Hero screens re-render on-device with the new language.
- AA contrast checks pass (both themes).
- RTL verified with screenshots.
- **Frame floors hold:** the G2 harness re-run on the restyled transition + scroll must not
  regress past the locked floors (UI pooled p95 ≤ 11.11 ms; dropped frames < 1%).

## Constraints

- `docs/g2-preregistration.md` is a sealed record (post-merge edits void the G2 gate record) —
  G2.5 references it, never edits it.
- Gates G3–G5 keep their names and numbers; G2.5 is additive.
- All work lands through slice-PR discipline (PR → CI green → CodeRabbit → owner merge).
