# G2 Blind-Preference Kit

Runs the S1 subjective floor: **≥70% of ≥5 staff prefer RN with a concrete reason.** On-site, human-subject, cannot be automated.

## 1. Setup — identical chassis
- Both apps installed on **two physically identical devices** (same model/refresh/SoC/RAM as the pre-registration §2 gate device), OR the same single device with apps swapped between rounds. Package names differ (Capacitor `uk.vettrack.app` vs RN `uk.vettrack.rnmigration`) so both coexist.
- Same clinic, same lighting, same equipment item, same seeded backend/staging data. Neither app shows its name/branding on the hero screen during the test (cover the app icon; launch directly into Scan).
- **Foreground-read requirement (critical — prevents A/B contamination):** because the sticker's universal-link/AAR association resolves to the Capacitor app, a tag tapped while an app is backgrounded will open Capacitor and poison the result. Every round MUST be: **launch app → tap the Scan CTA (NFC session now active) → THEN present the tag.** Never present a tag to a backgrounded phone.

## 2. Counterbalancing
- ≥5 participants. Assign order by alternation: odd participants **RN first**, even participants **Capacitor first**. This cancels first-exposure/order effects.
- Record the order per participant on the capture sheet (`order` field).
- Label the two apps to the facilitator only as **App A** / **App B**, remapped per participant so the facilitator's own bias can't leak. Maintain a private A/B→app mapping sheet the participant never sees.

## 3. Standardized spoken prompt (read verbatim, same for every participant)
> "You'll use two versions of the equipment app to do the same job: check this item out, then check it back in. For each one — launch it, tap Scan, then tap the sticker. Do it at your normal working pace. Afterward I'll ask which felt better and why. There are no wrong answers and neither version is 'the official one.'"

After both rounds, ask exactly:
> "Which one would you rather use on shift — App A or App B? In one sentence, what specifically made the difference?"

Do not prompt, lead, or name RN/Capacitor. Do not explain what to look for.

## 4. Per-participant capture sheet
```
Participant ID: ____   Role: ____   Date: ____
Order (which app first): [ RN ] [ Capacitor ]
A/B mapping this participant:  App A = ____   App B = ____
Hero task-time App A: ____ s   App B: ____ s   (O5 feeds here)
Errors/retries App A: ____     App B: ____
Preferred: [ App A ] [ App B ]  → resolves to: [ RN ] [ Capacitor ]
Stated reason (verbatim): ______________________________________
Reason code (see §5): [ concrete-speed ] [ concrete-tap ] [ concrete-feel ] [ vague ] [ other ]
Facilitator notes: ____________________________________________
```

## 5. Reason-coding rubric
- **concrete-speed** — names a speed/latency difference ("it opened faster", "the list didn't stutter").
- **concrete-tap** — names tap/touch responsiveness ("the button reacted instantly", "no lag when I hit scan").
- **concrete-feel** — names a specific motion/haptic/transition ("the confirm animation felt smooth", "the buzz when it checked out").
- **vague** — "looks nicer", "cleaner", "I just liked it" with no named difference → **does NOT count toward the 70%.**
- A participant counts toward S1 **only if** they prefer RN **and** their reason codes concrete-*.

## 6. Scoring
`S1 pass = (# participants preferring RN with a concrete reason) / (total participants) ≥ 0.70`, total ≥ 5. Record the fraction; carry to the pre-registration verdict (§7 of `docs/g2-preregistration.md`).
