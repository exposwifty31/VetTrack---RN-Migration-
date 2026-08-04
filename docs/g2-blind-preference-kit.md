# G2 Blind-Preference Kit

Runs the S1 subjective floor: **≥70% of ≥5 staff prefer RN with a concrete reason.** On-site, human-subject, cannot be automated.

## 1. Setup — identical chassis

- Both apps installed on **two physically identical devices** (same model/refresh/SoC/RAM as the pre-registration §2 gate device), OR the same single device with apps swapped between rounds. Package names differ (Capacitor `uk.vettrack.app` vs RN `uk.vettrack.rnmigration`) so both coexist.
- Same clinic, same lighting, same equipment item, same seeded backend/staging data. Neither app shows its name/branding on the hero screen during the test (cover the app icon; launch directly into Scan).
- **Foreground-read requirement (critical — prevents A/B contamination):** because the sticker's universal-link/AAR association resolves to the Capacitor app, a tag tapped while an app is backgrounded will open Capacitor and poison the result. Every round MUST be: **launch app → tap the Scan CTA (NFC session now active) → THEN present the tag.** Never present a tag to a backgrounded phone.

## 2. Counterbalancing and blinding

- ≥5 participants. Assign order by alternation: odd participants **RN first**, even participants **Capacitor first**. This cancels first-exposure/order effects.
- Record the order per participant on the capture sheet (`order` field).
- Label the two apps to the facilitator only as **App A** / **App B**, remapped per participant. **Remapping reduces label/order bias in how the apps are named — it does NOT blind the facilitator**, who can still tell RN from Capacitor by the device/build in hand.
- **To actually blind the facilitator to implementation identity:** a **second person** holds the private A/B→app mapping and sets up each round (covers branding, launches the correct app, hands the device over), so the facilitator reading the prompt cannot tell which build is which. If only one facilitator is available, treat implementation identity as **unblinded** and record it as a known bias limitation in the §6 verdict — do not report the result as facilitator-blind.
- The participant never sees the A/B→app mapping.

## 3. Standardized spoken prompt (read verbatim, same for every participant)

> "You'll use two versions of the equipment app to do the same job: check this item out, then check it back in. For each one — launch it, tap Scan, then tap the sticker. Do it at your normal working pace. Afterward I'll ask which felt better and why. There are no wrong answers and neither version is 'the official one.'"

After both rounds, ask exactly:

> "Which one would you rather use on shift — App A or App B? In one sentence, what specifically made the difference?"

Do not prompt, lead, or name RN/Capacitor. Do not explain what to look for.

## 4. Per-participant capture sheet

**Privacy controls — apply before collecting any data (human-subject data):**

- Use a **pseudonymous** Participant ID only (`P1`, `P2`, …). Never record a name, staff ID, or email on the sheet.
- **Redact** any client or patient identifier that surfaces in `Stated reason` or `Facilitator notes` — capture the operational point ("the list stuttered"), not who or what the item was used on.
- **Access:** completed sheets are held only by the study owner and stored in the clinic's access-controlled location, not on shared drives or chat.
- **Retention & deletion:** keep only until the G2 verdict is recorded in `docs/g2-preregistration.md` §7, then destroy — delete digital copies and shred paper. Target deletion within **30 days** of the verdict.

```text
Participant ID (pseudonymous): ____   Role: ____   Date: ____
Order (which app first): [ RN ] [ Capacitor ]
A/B mapping this participant:  App A = ____   App B = ____   (held by setup person, not shown to participant)
Hero task-time App A: ____ s   App B: ____ s   (O5 feeds here)
Errors/retries App A: ____     App B: ____
Preferred: [ App A ] [ App B ]  → resolves to: [ RN ] [ Capacitor ]
Stated reason (verbatim, redact client/patient identifiers): _______________________
Reason code (see §5): [ concrete-speed ] [ concrete-tap ] [ concrete-feel ] [ vague ] [ other ]
Facilitator notes (redact client/patient identifiers): _____________________________
```

## 5. Reason-coding rubric

- **concrete-speed** — names a speed/latency difference ("it opened faster", "the list didn't stutter").
- **concrete-tap** — names tap/touch responsiveness ("the button reacted instantly", "no lag when I hit scan").
- **concrete-feel** — names a specific motion/haptic/transition ("the confirm animation felt smooth", "the buzz when it checked out").
- **vague** — "looks nicer", "cleaner", "I just liked it" with no named difference → **does NOT count toward the 70%.**
- A participant counts toward S1 **only if** they prefer RN **and** their reason codes concrete-*.

## 6. Scoring

`S1 pass = (# participants preferring RN with a concrete reason) / (total participants) ≥ 0.70`, total ≥ 5. Record the fraction; carry to the pre-registration verdict (§7 of `docs/g2-preregistration.md`). If the facilitator was not blinded to implementation identity (§2), note it alongside the fraction.
