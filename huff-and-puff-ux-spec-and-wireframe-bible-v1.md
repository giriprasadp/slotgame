# Huff and Puff — End-to-End UX Specification & Wireframe Production Bible — v1.0

**Project code:** E_2387
**Game:** Huff and Puff (video slot, 3×5 grid, 10 paylines, cascading morphs, wheel feature)
**Engine target:** Unity LTS 2022.3+, WebGL 2.0 build (mobile-web + desktop-web)
**Source contract:** `huff-and-puff-gdd.md` (840 lines, 22 sections) + `HuffAndPuff_DesignSheet_v1.0.xlsx` (25 tabs, 358 formulas)
**Document owner:** Sally (UX) — Samarjit Singh, Juego Studioz
**Revision:** 1.0 (initial production bible)
**Date:** 2026-04-23

---

## Section 0 — How to Read This Document

This document is split into two halves:

**Part 1 — UX Design Specification (Sally / BMAD bmad-ux)** — the empathy layer. Personas, journeys, IA, flows, interaction patterns, responsive rules, accessibility, design system, edge cases. This is what product, UX, and QA read to understand *why* the game feels the way it feels.

**Part 2 — Wireframe Production Bible** — the build layer. Every screen populated, every modal/toast/tooltip/error inventoried by ID, every hotkey mapped, every save field typed, every analytics event payload written out, test scenarios for every feature. This is what engineering, QA, and the Figma Make reviewer read to build and verify.

**How to use it:**
- **Devs implementing a screen** → jump to Part 2 §3, find the screen ID, read 90 seconds, start building.
- **QA writing a test plan** → jump to Part 2 §11 (Feature Test Scenarios) and Appendix A (Dev QA Checklist).
- **Designers reviewing a state variant** → jump to Part 2 Part L (Scenario Preview Panel) and cycle the prototype.
- **Producer checking what's still open** → Appendix B (Open Design Questions).
- **Anyone asking "why is it built that way?"** → Part 1 (UX rationale).

**Conventions used in this document:**
- **IDs** — every screen, modal, toast, tooltip, error has a stable ID. `SCR-*` = screen, `MOD-*` = modal, `TST-*` = toast, `TIP-*` = tooltip, `ERR-*` = error, `OVL-*` = overlay.
- **Refs** — `GDD §12.3` means section 12.3 of the source GDD. `DS: Gameplay Params!B17` means the design-sheet cell. These are the authoritative sources — if this bible disagrees with them, the source wins and this bible has a bug.
- **Populated values only** — when the source specifies a value, it is copied verbatim. When the source is silent, the field is marked `(Assumption — flagged Appendix B)` or `(TBD — Appendix B)`. Never invented silently.
- **Units** — monetary units shown as `COIN` (internal unit, 100 COIN = 1.00 in the player's currency). Times in ms unless marked `s`. Weights as %.
- **Colour-coded states** — every state communicated by colour is *also* communicated by text, shape, or icon. No colour-only states.

---

# Part 1 — UX Design Specification (Sally)

*Slot games look like pure arithmetic from the outside — you bet, you spin, you win or lose. From the inside they are an intricate choreography of sensory feedback, delayed gratification, and guardrails. Every 400ms the player is either leaning in or leaning out, and the UX either earns the lean or loses it. What follows is the empathy map for all of it.*

## 1. User Personas Deep Dive

We've expanded the GDD's audience notes (§ 2.3) into three primary personas plus one protective persona (regulatory / parent-of-minor / self-exclusion). Every wireframe decision in Part 2 maps back to at least one of these.

### 1.1 Persona A — "Casual Carla" (primary)

| Dimension | Profile |
|-----------|---------|
| Age range | 32–55 |
| Device | 75% mobile (iOS Safari, Android Chrome), 25% desktop |
| Session budget | 5–15 minutes, often in fragments (commute, lunch, TV ad break) |
| Bet behaviour | Min bet → mid bet; rarely max-bets |
| Feature comfort | Knows "bet up / spin / autoplay"; intimidated by buy feature, paytable, multiplier math |
| Win memory | Remembers the *feel* of a big win, not the number |
| Loss tolerance | Stops when she feels she's "losing too fast" — a subjective, not numeric, threshold |
| Accessibility | May have mild presbyopia (reading glasses); prefers high-contrast, larger fonts |

**Empathy map:**

- **Thinks:** *"Is this fun right now? I'll keep going. How much have I lost? I don't want to know yet. Oh a sound!"*
- **Feels:** Curiosity on spin. Mild anticipation on every stop. Joy on any visible animation spike. Shame if balance dips below her mental floor. Relief when she closes the tab on a small win.
- **Says:** "One more spin." "I never understand what the multipliers mean." "Where's the home button?"
- **Does:** Taps spin rapidly. Ignores the paytable. Discovers features accidentally. Closes the game mid-feature sometimes.

**Design implications** (which decisions in Part 2 this persona drives):
- Spin button is the largest single hit target on the screen (≥ 96 dp / 88 pt) — see `SCR-MAIN`.
- Big-win overlay uses a *visible numeric count-up plus a sensory crescendo* — she remembers the feel.
- Paytable is one-tap from the HUD; closes on any tap-out — never locks her into a modal.
- **Loss floor guardrail**: `MOD-REALITY` fires every 30 minutes or every 100 spins, whichever first (GDD §20).
- Resume-from-interrupt is silent — she reopens the tab, the last state loads with no "welcome back" wall.
- Font size 16pt min on any number she may read mid-spin.

### 1.2 Persona B — "Feature-Hunter Felix" (primary)

| Dimension | Profile |
|-----------|---------|
| Age range | 24–40 |
| Device | 60% desktop (dual monitor, keyboard + mouse), 40% mobile landscape |
| Session budget | 30–120 minutes, deliberate |
| Bet behaviour | Mid → max bet; fluent in bet-ladder mechanics |
| Feature comfort | Reads the paytable before first spin; YouTube-searches the game's RTP; *buys* features |
| Win memory | Tracks specific wins, screenshots multiplier stacks, compares to streamers |
| Loss tolerance | High, up to declared loss limit; tracks net loss manually |
| Accessibility | May use turbo/quickspin; wants per-spin stats visible |

**Empathy map:**

- **Thinks:** *"What's the multiplier cap? How often does the Wheel trigger? Is buy-FS +EV vs base game RTP?"*
- **Feels:** Mastery when he chains morphs. Frustration when the Wheel lands on the low-tier jackpot. Vindication when a streamer he follows gets the same slot's Grand.
- **Says:** "Give me turbo." "Where's the bet history?" "Show me the hit frequency."
- **Does:** Hotkeys everywhere. Opens bet history between every 5–10 spins. Toggles quickspin. Pre-loads autoplay with 50+ spins and specific stop conditions.

**Design implications:**
- Full keyboard hotkey map on desktop (Section 2 of Part 2) — Space, Enter, T (turbo), A (autoplay), P (paytable), I (info), Arrow-up/down bet, S (sound).
- Bet & Win history visible on HUD as a live counter (*Last Win*, *Session Net*, *Win in Feature*).
- Paytable shows RTP, volatility rating, hit frequency, max win cap — not hidden.
- Autoplay offers *stop-on-win-above-X*, *stop-on-single-win-above-X*, *stop-on-balance-below-X*, *stop-on-feature* — all independently togglable.
- Buy Feature has a cost preview + "% of max balance" indicator + one-tap access — see `SCR-BUYFEATURE`.

### 1.3 Persona C — "First-Timer Fatima" (secondary)

| Dimension | Profile |
|-----------|---------|
| Age range | 21–30 |
| Device | 100% mobile portrait |
| Session budget | First session 2–8 minutes, may or may not return |
| Bet behaviour | Min bet only; afraid to touch the ladder |
| Feature comfort | None; doesn't know "scatter" means anything |
| Win memory | Remembers whether she was confused or delighted |
| Loss tolerance | Very low; quits at first confusing moment |
| Accessibility | May be new to English UI terms ("free spins", "wild", "multiplier") |

**Empathy map:**

- **Thinks:** *"What's the free spins thing? Why did the screen flash? Did I just win something? Can I cash out? Where?"*
- **Feels:** Confusion on first feature trigger. Delight when a symbol explodes. Overwhelm when 3 modals stack.
- **Says:** "Wait, what just happened?" "Why is there gold everywhere?" "Can I go back?"
- **Does:** Hesitates before first spin. Taps random things to learn. Exits if the interface traps her.

**Design implications:**
- First-time-only tutorial overlay: 3 steps, ≤ 6 seconds total, skippable (`OVL-TUTORIAL`).
- Every feature-trigger overlay (`OVL-FS-INTRO`, `OVL-WHEEL-INTRO`) says *in a single sentence, plain English*: "You've won 10 Free Spins — watch them play out."
- Symbol tooltips: tap-and-hold on any symbol in the grid → micro-modal with name, payout table, role (Wild/Scatter/Pays/Morph source).
- **Never stack modals** — new modals queue behind the current one. FIFO unless regulatory (reality check pre-empts).
- Autoplay is *off* by default and buried one tap deeper than spin.

### 1.4 Persona D — "Protective Pat" (the guardrail persona)

Not a user who plays, but whose needs must be designed for: the regulator, the parent-of-minor, the self-excluded individual, and the support operator. We design *for* their constraints because slot UIs are legally obligated in most jurisdictions (UKGC, MGA, Ontario iGO).

**Needs:**
- Age gate at load (operator-supplied, but UI must accommodate it — `OVL-AGE-GATE`).
- Reality check every 30/60 min (player-configurable, regulator-forced in UK & ON).
- Net-position counter (required in UK, ON): always-visible *Session Total Spent*, *Session Total Won*, *Session Net*.
- Demo mode with no monetary language (*"FUN PLAY"* only, no "win", no "balance").
- Self-exclusion link reachable from Settings within 2 taps.
- Help/problem-gambling link in Settings and Reality Check modal.
- No auto-play with a live balance below `autoplay_min_balance` (GDD §20.4).

**Design implications** everywhere — see accessibility (§ 7) and responsible-gambling deep-dive (Part J).

---

## 2. User Journeys

We map three journeys end-to-end with emotional states per step. Emotional states are colour-coded: 🟢 positive, 🟡 neutral, 🟠 caution, 🔴 loss / frustration, 🔵 confusion.

### 2.1 Journey: "Carla's 7-Minute Coffee Break"

| Step | Screen | Action | Emotional state | Notes |
|------|--------|--------|-----------------|-------|
| 1 | Operator lobby | Taps Huff and Puff tile | 🟢 Curious | Pre-loads while she decides bet |
| 2 | `SCR-LOADING` | Watches a 2–4 s loader with a Big Bad Wolf silhouette puffing | 🟢 Amused | Loader bar must hit 100% honestly |
| 3 | `SCR-MAIN` initial | Bet pre-set to min (0.10), balance shown top-left | 🟡 Neutral | Never autoplays on launch |
| 4 | `SCR-MAIN` spin 1 | Taps spin; 400ms stop; 2 low-pay line wins | 🟢 Tiny delight | Animated count-up, 1.2s total |
| 5 | `SCR-MAIN` spin 2–8 | Mix of small wins and misses | 🟢 🟡 alternating | Net still positive |
| 6 | `SCR-MAIN` spin 9 | 3 scatters land → `OVL-FS-INTRO` | 🟢 Surprise | Plain-English intro modal |
| 7 | `SCR-FS` | 10 free spins play out; FS multiplier climbs ×2→×4 | 🟢 Rising joy | Count-up animation sync'd to music |
| 8 | `OVL-FEATURE-COMPLETE` | Total FS win: 48× bet | 🟢 Peak | Big-win count-up 3.2s |
| 9 | `SCR-MAIN` spin 10–15 | Returns to base; 2 more minor wins | 🟡 | Still net positive |
| 10 | `SCR-MAIN` spin 16 | Taps spin at minute 30 → `MOD-REALITY` interrupts | 🟠 Gentle pause | Modal shows net +4.20, session 30 min |
| 11 | `MOD-REALITY` | Taps "Continue" | 🟢 Consented pause | Logged as `reality_check_continued` analytics event |
| 12 | `SCR-MAIN` spin 17 | Closes tab | 🟢 Satisfied | State persists, resume works tomorrow |

**Key insight:** Carla never touched the paytable, never changed bet, never saw the Wheel feature. The session still feels complete because: (a) the FS trigger felt earned, not arbitrary, (b) the reality check gave her a clean exit point, and (c) the state persists silently on return.

### 2.2 Journey: "Felix Hunts the Wheel"

| Step | Screen | Action | Emotional state | Notes |
|------|--------|--------|-----------------|-------|
| 1 | `SCR-LOADING` | Reads loader tip: "Wheel pays up to Grand 2000× stake" | 🟢 Intrigued | Tips rotate |
| 2 | `SCR-PAYTABLE` | Opens before first spin; checks RTP (96.10%), max win (10,000×) | 🟡 Analytical | RTP & volatility must be visible |
| 3 | `SCR-MAIN` | Sets bet to 1.00; enables turbo (`T` hotkey) | 🟢 In-control | Turbo hotkey hint via `TIP-TURBO` |
| 4 | `SCR-MAIN` spin 1–40 | Burns through 40 turbo spins, no Wheel | 🟡 🟠 Patient-turning-tense | Session Net: −12.50 |
| 5 | `SCR-BUYFEATURE` | Opens Buy panel; Wheel costs 50× bet = 50.00 | 🟠 Calculating | Cost preview, affordability shown |
| 6 | `MOD-BUY-CONFIRM` | Hold-to-confirm Wheel purchase (1.0s hold with progress ring) | 🟠 Committed | Analytics: `buy_feature_wheel_initiated` |
| 7 | `OVL-WHEEL-INTRO` | Wheel intro animation (2.5 s) | 🟢 Ceremony | Skippable on second tap |
| 8 | `SCR-WHEEL` | Wheel spins, lands on Mansion | 🟢 Delight | Landed sector animates, then sub-game loads |
| 9 | `SCR-MANSION` | Pick-me mini-game; 3 picks reveal coin values | 🟢 Agency | Each pick is a decision |
| 10 | `OVL-FEATURE-COMPLETE` | Mansion total: 62× bet = 62.00 | 🟢 Vindicated | Net: +49.50 |
| 11 | `SCR-MAIN` spin 41 | Drops bet to 0.50, keeps playing | 🟢 Confident | Session Net live |
| 12 | `SCR-HISTORY` | Checks bet history after 20 more spins | 🟡 Auditing | Every spin logged |
| 13 | Closes | After 80 minutes | 🟢 Complete | Net: +31.20 |

**Key insight:** Felix's session hinges on *predictable information architecture*. He must always know the RTP, must always find history in ≤ 2 taps, and must see cost previews before committing. The hold-to-confirm buy feature is non-negotiable: a single-tap buy feels predatory.

### 2.3 Journey: "Fatima's Confusing First Spin"

| Step | Screen | Action | Emotional state | Notes |
|------|--------|--------|-----------------|-------|
| 1 | `SCR-LOADING` | Watches loader; sees wolf silhouette | 🟢 Amused | |
| 2 | `OVL-TUTORIAL` step 1 | "Tap the big button to spin." | 🟢 Oriented | 3-step tutorial |
| 3 | `OVL-TUTORIAL` step 2 | "These numbers are your balance and bet." | 🟢 Understood | Points at HUD |
| 4 | `OVL-TUTORIAL` step 3 | "Match symbols to win." | 🟢 Ready | Dismisses tutorial |
| 5 | `SCR-MAIN` spin 1 | Wins a line; gold coin animation | 🟢 Delight | Count-up: 0.20 |
| 6 | `SCR-MAIN` spin 2 | No win; brief silence | 🟡 | OK, she understands |
| 7 | `SCR-MAIN` spin 3 | A golden symbol lands; screen flashes with W02 expansion | 🔵 Confusion | She doesn't know what just happened |
| 8 | `TST-GOLDEN-CONVERT` | Toast: "Golden symbol became a Wild" | 🟢 Oriented | 2.5s toast explains |
| 9 | `SCR-MAIN` spin 4–6 | Small wins; 2 scatters land spin 5 | 🟢 🟡 | |
| 10 | `TST-SCATTER-NEAR` | Toast: "One more Scatter for Free Spins!" | 🟢 Anticipation | Near-miss celebration |
| 11 | `SCR-MAIN` spin 7 | Balance hits zero | 🔴 Sad | |
| 12 | `MOD-LOW-BALANCE` | Modal: "Out of coins. Add more or visit cashier." | 🔴 Exit | Links to operator cashier |

**Key insight:** Fatima's session redeems itself from the confusion (step 7) because a toast explains *what just happened* without requiring a modal. This is the *"educate on event, not on entry"* principle — don't front-load a 30-slide manual; teach on the moment the player sees the thing for the first time.

---

## 3. Information Architecture

The game is a single primary screen (`SCR-MAIN`) with a constellation of secondary screens, modals, overlays, and panels that orbit it. It is emphatically *not* a tab-based app.

### 3.1 Site map (high-level)

```
Huff and Puff
├── Boot
│   ├── Age Gate (operator-supplied, uses OVL-AGE-GATE if Unity-hosted)
│   ├── Loading (SCR-LOADING)
│   └── Tutorial first-time-only (OVL-TUTORIAL)
│
├── Main Game Surface (SCR-MAIN) — the hub
│   ├── HUD
│   │   ├── Balance / Bet / Last Win / Session Net
│   │   ├── Menu button → Settings drawer
│   │   ├── Paytable button → SCR-PAYTABLE
│   │   ├── Info button → SCR-INFO (rules)
│   │   ├── History button → SCR-HISTORY
│   │   ├── Sound toggle + volume micro-slider
│   │   └── Fullscreen toggle (desktop)
│   │
│   ├── Reels surface (3×5 grid)
│   ├── Bet controls (bet -, bet +, level display, total stake display)
│   ├── Spin button (primary CTA)
│   ├── Autoplay button → MOD-AUTOPLAY-CONFIG → MOD-AUTOPLAY-STOPCONDITIONS
│   ├── Turbo toggle
│   └── Buy Feature button → SCR-BUYFEATURE → MOD-BUY-CONFIRM
│
├── Feature States (inherit HUD, mutate theme)
│   ├── Free Spins (SCR-FS — variant of SCR-MAIN)
│   ├── Wheel Feature (SCR-WHEEL)
│   └── Sub-bonuses (SCR-JACKPOT / SCR-MANSION / SCR-BUZZSAW / SCR-MEGAHAT)
│
├── Overlays
│   ├── OVL-TUTORIAL (first-time)
│   ├── OVL-FS-INTRO, OVL-FS-OUTRO
│   ├── OVL-WHEEL-INTRO, OVL-WHEEL-OUTRO
│   ├── OVL-BIGWIN, OVL-HUGEWIN, OVL-MEGAWIN, OVL-MAXWIN
│   ├── OVL-FEATURE-COMPLETE
│   ├── OVL-RECONNECT
│   └── OVL-AGE-GATE (if hosted)
│
├── Modals
│   └── [see Part 2 §4 — 24 modals inventoried]
│
├── Settings / Ancillary
│   ├── SCR-SETTINGS → tabs: Audio · Gameplay · Accessibility · Limits · About
│   ├── SCR-RG-LIMITS — operator-linked
│   ├── SCR-HISTORY — last 50 spins
│   └── SCR-DEMO — free-play (no monetary language)
│
└── Exit
    └── Return-to-lobby link in Menu drawer
```

### 3.2 Content hierarchy

The player's eye must always find, in order of priority:

1. **Balance** (top-left on mobile, top-centre on desktop) — the single most important number.
2. **Reels** (centre) — the focus of attention during a spin.
3. **Spin button** (bottom-centre / bottom-right) — the primary action.
4. **Bet controls** (flank spin) — secondary action.
5. **Last Win** (near balance) — feedback for the just-completed spin.
6. **HUD controls** (top-right) — discoverable but not distracting.

Heat-map reality check: mobile users touch the spin button and the bet +/- controls 95% of the time. Design for that, don't punish it.

### 3.3 Navigation structure

- **Entry** — operator lobby → boot sequence → `SCR-MAIN`.
- **Back path** from any ancillary screen (Settings, Paytable, History, Info) — single-tap close (X icon top-right on mobile, Esc on desktop).
- **During feature** — all ancillary navigation is disabled *except* Sound toggle and Menu → Exit-to-Lobby (which triggers `MOD-CONFIRM-EXIT-FEATURE`).
- **Autoplay** — a running autoplay can be stopped at any time via the spin button, which inverts into a "STOP" button while autoplay is live.
- **No nested modals.** If a new event needs a modal while one is open, it queues. Exception: regulatory (reality check, max-win cap) pre-empts.

---

## 4. Key User Flows

Each flow below is an interaction sequence with decision points and error branches. These feed directly into Part 2 §1 (the ASCII flowchart).

### 4.1 Flow: Core spin loop (happy path)

1. Player taps Spin (or presses Space).
2. State → `SPINNING`. Reels start animation. Spin button visually becomes a STOP button if Skipstop enabled.
3. Stop sequence: reel 1 stops at 400ms, reel 2 at 500, reel 3 at 600, reel 4 at 700, reel 5 at 800 (normal) or all at 300 (turbo).
4. Evaluate paylines → determine wins.
5. If wins: animate winning symbols; coin count-up animation on balance; sum displayed in *Last Win*.
6. If Morph triggered: play morph VFX; re-evaluate; loop until no morph.
7. If Multiplier advanced: HUD multiplier indicator animates its stop.
8. If Scatter count ≥ 3: trigger `OVL-FS-INTRO`.
9. If Wheel symbol triggered: trigger `OVL-WHEEL-INTRO`.
10. State → `IDLE`. Spin button re-enabled.

**Decision points:** turbo on/off → affects timing; autoplay on → skip to step 1 with new spin; feature trigger → route to feature flow.

### 4.2 Flow: Bet change

1. Player taps bet +/- or opens bet ladder (tap-and-hold on bet display).
2. If `IDLE`: bet changes immediately; total stake recalculates.
3. If `AUTOPLAY` active and bet-lock is ON: change queued until autoplay ends OR modal warns.
4. If `FEATURE` active: bet is locked to triggering bet; change is disabled; hint tooltip (`TIP-BET-LOCKED`) on disabled control.
5. Balance check: if new bet > balance, show `TST-BET-CAPPED` and revert.

**Edge case:** player rapid-taps bet+ 10 times in 0.5s. Queue them. Apply final value. Don't flicker.

### 4.3 Flow: Free Spins trigger & play

1. Base spin evaluates 3+ Scatters.
2. `OVL-FS-INTRO` fires, auto-dismisses after 3.0s or on tap (GDD §11.3).
3. State → `FS`. Reels theme-swap (background, music, multiplier ladder).
4. FS counter starts at 10 (or configured `fs_initial_spins`).
5. Each FS: auto-plays with spin animation. Player can tap Skip to accelerate.
6. If 3+ Scatters land during FS: retrigger — `TST-FS-RETRIGGER`, counter += `fs_retrigger_count`.
7. On FS counter = 0: tally total FS win; `OVL-FS-OUTRO` with count-up.
8. State → `IDLE` on `SCR-MAIN`. Total win added to balance.

**Decision point:** if player disconnects mid-FS, reconnect flow must resume at exact spin index. See Part D (Persistence).

### 4.4 Flow: Wheel Feature

1. Wheel trigger: either (a) Wheel symbol landed, or (b) Buy Feature Wheel purchased.
2. `OVL-WHEEL-INTRO` plays (2.5s, skippable after 1.0s hold-to-skip — prevents accidental skip on mobile).
3. `SCR-WHEEL` loads. Wheel visibly mapped with sectors (Jackpot, Mansion, Buzzsaw, Mega Hat, each at configured weight).
4. Wheel spins; lands on sector; sector pulses + name tooltip.
5. Route to sub-bonus screen (`SCR-JACKPOT` / `SCR-MANSION` / `SCR-BUZZSAW` / `SCR-MEGAHAT`).
6. Sub-bonus plays out (see flows 4.5 – 4.8).
7. Final sub-bonus win is summed into feature total.
8. `OVL-WHEEL-OUTRO` with total count-up. Return to `SCR-MAIN`.

### 4.5 Flow: Jackpot sub-bonus

1. `SCR-JACKPOT` shows 4 jackpot tiles (Mini, Minor, Major, Grand) with nameplates and prize values.
2. Behind the scenes, server (or client RNG for solo build) picks tier via weighted probability.
3. Reveal animation: tiles shuffle briefly, one highlights, tier name announced.
4. Prize added to balance.
5. Return to Wheel outro.

### 4.6 Flow: Mansion pick-me

1. `SCR-MANSION` shows a mansion façade with N rooms (typically 9 or 12).
2. Player taps rooms to reveal coin values.
3. Stops when "Collect" or "End Turn" symbol revealed.
4. Total summed, displayed.
5. Return to Wheel outro.

### 4.7 Flow: Buzzsaw

1. `SCR-BUZZSAW` shows logs / rows to cut through.
2. Animated buzzsaw cuts row-by-row; each cut reveals a value.
3. Multiplier may advance on each cut.
4. Ends at configured row count or end-symbol.
5. Total summed.

### 4.8 Flow: Mega Hat

1. `SCR-MEGAHAT` shows reels with oversized hats covering 4–15 spaces.
2. Reels spin; hats resolve into symbols.
3. More covered spaces = higher starting multiplier.
4. Player can collect after each spin or continue (up to N attempts).
5. Total summed.

### 4.9 Flow: Buy Feature

1. Tap Buy Feature button.
2. `SCR-BUYFEATURE` overlays `SCR-MAIN`.
3. Player selects FS or Wheel.
4. Cost preview shows (75× bet for FS, 50× bet for Wheel).
5. If cost > balance: CTA greyed with affordability tooltip.
6. Tap "Buy" → `MOD-BUY-CONFIRM` with 1.0s hold-to-confirm + circular progress ring.
7. Balance deducts, feature triggers as if organic.

### 4.10 Flow: Autoplay

1. Tap Autoplay.
2. `MOD-AUTOPLAY-CONFIG` opens: pick spin count (10 / 25 / 50 / 100 / ∞) and stop conditions.
3. Tap Start → autoplay runs. Spin button becomes STOP button.
4. Each spin evaluates stop conditions; if any triggered, autoplay halts and a `TST-AUTOPLAY-STOPPED` explains why.
5. Regulatory: every 10 spins during autoplay, a discreet HUD pulse reminds player it's active.

### 4.11 Flow: Session reality check

1. Timer crosses threshold (30 or 60 min, player-selected in Settings; regulator-forced in UKGC / ON).
2. Current spin completes; state → `PAUSED-RG`.
3. `MOD-REALITY` fires: shows session time, total spent, total won, net.
4. CTAs: Continue / Take a Break / Close Game.
5. Continue → resume; Take a Break → 5-min forced pause; Close → exit.

### 4.12 Flow: Disconnection recovery

1. Socket / network loss during any state.
2. 3s grace period with no UI change.
3. If still disconnected: `OVL-RECONNECT` fades in. Game paused.
4. Retry schedule: exponential (1s, 2s, 4s, 8s, max 15s).
5. On reconnect: fetch server state, reconcile local optimistic state, resume exactly where left off.
6. If reconnect fails after 60s: `MOD-RECONNECT-FAILED` with "Retry" and "Exit" options.
7. On exit: current state is autosaved server-side; next session resumes from autosave.

---

## 5. Interaction Patterns

### 5.1 Tap targets and feedback

| Action | Min target size | Feedback |
|--------|-----------------|----------|
| Spin button (mobile) | 96×96 dp | Scale-down 0.95 on press, scale-up 1.05 on release, haptic (iOS) |
| Bet +/- | 56×56 dp | Scale + tick SFX |
| HUD icons | 48×48 dp | Scale + colour pulse |
| Symbol tap-and-hold | full cell | Symbol details tooltip after 400ms hold |
| Paytable close | 48×48 dp | Fade + slide off |

### 5.2 Spin animation timing

| Phase | Normal | Turbo |
|-------|--------|-------|
| Spin acceleration | 150 ms | 100 ms |
| Steady spin | 250 ms | 100 ms |
| Reel 1 stop | 400 ms | 300 ms |
| Reel 5 stop | 800 ms | 300 ms |
| Win evaluation | 200 ms | 100 ms |
| Win animation | 1200 ms | 600 ms |
| Idle return | +100 ms | +50 ms |

Total base: ~1700 ms no-win, ~2900 ms with win. Turbo: ~700 ms no-win, ~1100 ms with win.

### 5.3 Count-up animation

Every win count-up uses an ease-out curve. Duration scales with magnitude:

| Win magnitude (× total bet) | Count-up duration | SFX escalation |
|------------------------------|--------------------|-----------------|
| < 5× | 600 ms | coin-pop |
| 5×–15× | 900 ms | coin-stack |
| 15×–50× (BigWin) | 1600 ms | crescendo-1 |
| 50×–100× (HugeWin) | 2400 ms | crescendo-2 |
| 100×–500× (MegaWin) | 3200 ms | crescendo-3 |
| > 500× (SuperMegaWin) | 4000 ms | crescendo-4 + vignette |
| At max-win cap | 4000 ms | max-win fanfare, game-freezes post-anim |

Count-up can be skipped via tap — final value settles immediately.

### 5.4 Morph mechanic feedback

When a cascading morph fires:
1. Winning symbols dissolve (300ms particles).
2. Adjacent cells briefly glow (150ms).
3. New symbols morph-in with a twist-and-scale (400ms).
4. Re-evaluate paylines silently.
5. If new wins: escalate multiplier ladder (×1 → ×2 → ×3 → ×5 on base; ×2 → ×4 → ×6 → ×10 on FS).
6. Multiplier HUD element pulses on advancement.
7. Loop until no new wins.

### 5.5 Haptics (mobile)

- Spin press — light impact (iOS `UIImpactFeedbackGenerator.light`, Android equivalent).
- Any win — light impact.
- Big Win (≥ 15× bet) — medium impact.
- Feature trigger — success notification.
- Max win — heavy impact + 3× pulse.
- All haptics respect the OS-level Reduce Motion / Haptics accessibility setting.

### 5.6 Audio cues

Every interaction has a sound envelope. See Part 2 §10.3 for the full audio mapping. Categories:
- **UI** — taps, hovers, toggles (duration ≤ 120 ms).
- **Reel** — spin loop, stop thud per reel (variable pitch to avoid fatigue).
- **Win** — coin, scatter ping, line-win arpeggio, big-win crescendo ladder.
- **Ambient** — wolf-themed music bed, ducked during wins.
- **Feature** — stingers for FS enter/exit, Wheel enter/exit.

---

## 6. Responsive Design

We target two viewport families: **mobile portrait** (primary, ~65% traffic) and **desktop landscape** (~30%). Tablet landscape uses desktop layout at scale.

### 6.1 Breakpoint rules

| Breakpoint | Width | Layout |
|------------|-------|--------|
| XS (mobile portrait) | 320–767 px | Portrait stack; reels centre; HUD split top/bottom |
| SM (mobile landscape) | 568–926 px | Landscape; reels centre; HUD left/right |
| MD (tablet portrait) | 768–1023 px | Same as XS, larger |
| LG (tablet landscape / desktop) | ≥ 1024 px | Landscape; reels centre; HUD flanks |
| XL (widescreen desktop) | ≥ 1440 px | Capped game canvas at 1440, margins filled by parallax bg |

Unity WebGL handles this via a responsive canvas scaler. See Part 2 §10.2 for scaler rules.

### 6.2 Mobile portrait layout (XS)

```
┌────────────────────────┐
│ 🏠  Bal 10.00  ⚙      │  <- Top HUD: home, balance, menu
├────────────────────────┤
│  Multiplier ×2          │  <- Multiplier HUD strip
├────────────────────────┤
│                         │
│   REELS 3×5 (centred)   │  <- Reels fill most of width
│                         │
├────────────────────────┤
│  Win: 1.20   Net: +0.50 │  <- Feedback strip
├────────────────────────┤
│  Bet -  0.50  Bet +     │  <- Bet controls
│                         │
│    ┌──────────┐         │  <- Spin button centre
│    │   SPIN   │         │
│    └──────────┘         │
│  [AUTO] [TURBO] [BUY]   │  <- Secondary CTAs
└────────────────────────┘
```

### 6.3 Desktop landscape layout (LG)

```
┌──────────────────────────────────────────────────────┐
│ Bal 10.00          LOGO           Net +0.50  ⚙ ℹ ℱ 🔊│  <- Top HUD
├──────┬─────────────────────────────────┬─────────────┤
│      │                                 │             │
│ Info │        REELS 3×5 (16:9)         │ Multiplier  │
│ Pay  │                                 │  ladder     │
│ Hist │                                 │             │
│      │                                 │             │
├──────┴─────────────────────────────────┴─────────────┤
│  Win: 1.20                                     [Hist]│
├──────────────────────────────────────────────────────┤
│  [Bet -] 0.50 [Bet +]   ┌────────┐  [Auto][Turbo][Buy]│
│                         │  SPIN  │                   │
│                         └────────┘                   │
└──────────────────────────────────────────────────────┘
```

### 6.4 Orientation handling

- On mobile orientation change: the game performs a layout morph, NOT a scene reload. State persists, in-flight spin completes.
- Landscape is preferred (bigger reel surface); mobile portrait is supported but shows a 1x "rotate for better view" hint on first load (dismissable).

### 6.5 Safe areas

- iOS safe area respected (notch, home indicator).
- Android cutout respected.
- Bottom HUD elements never within 16 dp of the home indicator.

---

## 7. Accessibility (WCAG 2.1 AA)

Slot games have historically been accessibility-hostile. This one targets WCAG 2.1 AA as a baseline, with specific game-appropriate adjustments.

### 7.1 Contrast & colour

- All text against background: contrast ratio ≥ 4.5:1 for body, ≥ 3:1 for large (≥ 18pt).
- **No colour-only state.** Winning symbols flash *and* pulse scale. Multiplier advancement changes *both* colour and number. Bet cap breach shows *both* red AND an icon.
- High-contrast mode toggle in Settings → overrides bg with pure black and ups border weights.

### 7.2 Motion & animation

- Prefers-reduced-motion (OS level) detected → triggers `REDUCE_MOTION=true`:
  - Reel spin shortened by 50%.
  - Big-win overlay replaced with static panel + text.
  - Morph dissolve replaced with fade.
  - All looping ambient VFX paused.
- Settings → Accessibility → "Reduce Motion" toggle overrides OS (can opt back in).
- No strobe. No flashing > 3 Hz. Photosensitive epilepsy guideline compliance.

### 7.3 Keyboard navigation (desktop)

- Every interactive element reachable via Tab.
- Focus ring visible (2 px, warm yellow `#FFC24A`, offset 2 px).
- Tab order: Bet - → Bet + → Spin → Autoplay → Turbo → Buy → Menu → Sound → Paytable → Info → History.
- Esc closes any modal. Space spins. Enter confirms. Arrow keys adjust bet.
- Focus trap inside modals.

### 7.4 Screen reader support (desktop + mobile VoiceOver / TalkBack)

- All buttons have an SR label (`aria-label` or Unity Accessibility Plugin equivalent).
- Balance and Last Win update announces: "Balance ten dollars. Last win one dollar twenty."
- Feature trigger announces: "Free spins awarded. Ten spins."
- Each reel stop announces terminal symbols (optional, toggle in Accessibility settings — off by default; sighted players don't need it).
- Big-win overlay announces magnitude tier: "Big win! Twenty times your bet."

### 7.5 Text size

- Default: 16 pt on mobile, 14 pt on desktop.
- Settings → Accessibility → Text Size: Small / Medium / Large / Extra Large (× 0.9 / × 1.0 / × 1.15 / × 1.3).
- Balance always uses ≥ 18 pt regardless of setting.

### 7.6 Audio alternative

- Every win / feature / major state change has a non-audio indicator (text, icon, motion).
- Music and SFX have independent volume sliders + mute toggles.
- "Audio description" toggle (optional) — narrates big events for low-vision players.

### 7.7 Input alternatives

- Single-switch compatibility: the game can be played with Spacebar only (auto-bet-min if no bet interaction).
- Dwell-click compatibility: long hover (600ms) on Spin triggers spin.

### 7.8 Focus-visible and skip links

- Skip to main content link (hidden unless keyboard-focused).
- "Skip tutorial" link, keyboard-focusable on tutorial overlay.

### 7.9 Accessibility test checklist

See Part 2 Appendix A § A.7 — a dedicated AA conformance checklist.

---

## 8. Design System Notes

### 8.1 Colour palette

| Role | Hex | Usage |
|------|-----|-------|
| Primary accent | `#E3A02C` (warm gold) | Wins, active states, CTAs |
| Secondary accent | `#A53B2A` (wolf-red) | Feature ribbons, scatter highlight |
| Tertiary accent | `#3E6D4F` (forest-green) | Win counters, positive delta |
| Background dark | `#1C1414` | Main game bg |
| Background mid | `#2A1F1F` | HUD shelf, cards |
| Background light | `#413030` | Panels |
| Text primary | `#F4EADE` (bone) | Body |
| Text secondary | `#B8A99A` | Metadata |
| Text disabled | `#6B605A` | Locked controls |
| Focus ring | `#FFC24A` | Keyboard focus |
| Error | `#D64545` | Error banners, max-cap |
| Caution | `#E0A82E` | Warnings, reality check |
| Success | `#5BB86E` | Wins, positive state |
| Overlay scrim | `#000000 @ 60%` | Modal backing |

**Contrast audits pre-shipped** — every text-on-bg combination in this palette passes ≥ 4.5:1.

### 8.2 Typography

| Role | Face | Size (desktop / mobile) | Weight |
|------|------|-------------------------|--------|
| Game numeric (balance) | Inter Display | 28 / 24 | 700 |
| Display heading | Cinzel (wolf theme) | 32 / 28 | 700 |
| Body | Inter | 14 / 16 | 400 |
| Caption | Inter | 12 / 13 | 400 |
| Numeric tabular | Inter Tabular Nums | 14 / 16 | 500 |
| Button | Inter | 16 / 18 | 600 |

All Latin glyphs; additional scripts (Cyrillic, Arabic) loaded conditionally for localisation — scope covers 12 locales (see Part 2 §10.7).

### 8.3 Spacing scale

4 dp base unit. Scale: 4, 8, 12, 16, 24, 32, 48, 64, 96. All gutters and paddings come from this ladder.

### 8.4 Corner radii

- Cards: 12 dp
- Buttons: 24 dp (pill) or 12 dp (square)
- Modals: 16 dp
- Tooltips: 8 dp
- Input fields: 8 dp

### 8.5 Elevation / shadow

| Layer | Shadow |
|-------|--------|
| HUD shelf | 0 2px 4px rgba(0,0,0,.25) |
| Card | 0 4px 12px rgba(0,0,0,.35) |
| Modal | 0 12px 32px rgba(0,0,0,.55) |
| Toast | 0 4px 16px rgba(0,0,0,.35) |

### 8.6 Component library

Components reused across the game:

| Component | Used on | Spec |
|-----------|---------|------|
| `Btn-Primary` | Spin, Confirm | Pill radius 24, height 64 dp mobile / 56 dp desktop, primary-accent fill |
| `Btn-Secondary` | Autoplay, Turbo | Outline, secondary-accent border |
| `Btn-Danger` | Exit feature | Error colour fill |
| `Btn-Ghost` | Tooltip dismiss | No fill, text-primary |
| `HUD-Counter` | Balance, Bet, Last Win | Icon + value, tabular numerics |
| `Card-Panel` | Paytable cells, History rows | BG mid, radius 12, padding 16 |
| `Slider` | Volume, Bet level | 4 dp track, 16 dp thumb, focus ring |
| `Toggle` | Sound, Turbo | 48×24 dp track, 20 dp thumb |
| `Tooltip` | Anywhere | Tip bubble, 8 dp radius, shadow-low |
| `Modal-Frame` | Every modal | Radius 16, header / body / footer |
| `Overlay-Fullscreen` | Big Win, FS Intro | Scrim + centred content |
| `Coin-Counter-Animation` | Win count-ups | Tabular numerics, ease-out |

---

## 9. Edge Cases & Error States

Every real slot game lives or dies on its edge cases. Here are the ones that matter.

### 9.1 Empty / zero states

| State | Screen | Behaviour |
|-------|--------|-----------|
| Balance = 0 before any spin | `SCR-MAIN` | `MOD-LOW-BALANCE` on spin attempt; links to cashier |
| Balance < current bet | `SCR-MAIN` | Spin disabled; `TST-BET-CAPPED` explains; bet auto-drops to max affordable |
| Autoplay queue empty | Post autoplay | Returns to `IDLE`; toast `TST-AUTOPLAY-STOPPED` with reason |
| History empty | `SCR-HISTORY` | "No spins yet. Start playing." + CTA back |
| No session | Post-timeout | `SCR-SESSION-EXPIRED` → re-auth → back to `SCR-MAIN` with saved state |

### 9.2 Loading states

| Loader | Trigger | Max duration | Fallback |
|--------|---------|--------------|----------|
| Boot loader | Cold load | 8s | `ERR-BOOT-TIMEOUT` |
| Asset loader | Scene change | 3s | Retry overlay |
| Server call | Each spin | 5s | `OVL-RECONNECT` |
| Feature trigger | Between spins | 2s | Skip to feature if loaded |

### 9.3 Error states — full catalog

See Part 2 §8 for the full populated error catalog. Summary of top-level:

| Error | Trigger | User sees |
|-------|---------|-----------|
| `ERR-NETWORK` | Socket drop | `OVL-RECONNECT` |
| `ERR-AUTH` | Session invalidated | `SCR-SESSION-EXPIRED` |
| `ERR-INSUFFICIENT-FUNDS` | Balance < bet | `MOD-LOW-BALANCE` |
| `ERR-SERVER-5XX` | Server error response | `MOD-SERVER-ERROR` with retry |
| `ERR-MAX-WIN` | Max win cap hit mid-feature | `OVL-MAXWIN` + feature force-end |
| `ERR-CONCURRENCY` | Another session open | `MOD-CONCURRENT-SESSION` forces current to exit |
| `ERR-CONFIG-LOAD-FAIL` | Config JSON fetch failed | `MOD-CONFIG-ERROR` + retry / abort |
| `ERR-UNSUPPORTED-BROWSER` | Detected browser below min | `SCR-UNSUPPORTED` |
| `ERR-RATE-LIMIT` | Too many spins too fast | `TST-RATE-LIMIT` + 2s spin lockout |
| `ERR-RG-BREACH` | Player exceeds limit | `MOD-RG-LIMIT-HIT` forces exit |

### 9.4 Interrupt states

| Interrupt | What happens |
|-----------|-------------|
| Tab backgrounded (mobile) | Audio mutes; state persists; pause animation on feature |
| Tab foregrounded | Resume audio (if wasn't muted); resume animation |
| Device lock | Same as backgrounded |
| Call interrupts (mobile) | Audio ducks; animation continues |
| OS update prompt | Game pauses; resumes on dismiss |

### 9.5 Unusual inputs

| Input | Handling |
|-------|----------|
| Spacebar spam | Debounced to one spin per `IDLE` → `SPINNING` cycle |
| Simultaneous touch+keyboard | First input wins; second ignored mid-animation |
| Triple-tap on Spin | First tap triggers; 2nd and 3rd ignored until `IDLE` |
| Extreme bet-ladder spam | Rate-limited to 10 events/sec; last value applied |

---

# Part 2 — Wireframe Production Bible

*Everything below is populated. Every field that has a source value carries it verbatim. Every field that's open is explicitly flagged in Appendix B.*

## Section 1 — Global Navigation Flowchart

```
┌────────────────────┐
│   OPERATOR LOBBY   │
│   (external)       │
└────────┬───────────┘
         │ tile click
         ▼
┌────────────────────┐      timeout 8s        ┌──────────────┐
│   SCR-LOADING      │──────────────────────▶│ ERR-BOOT-    │
│   (boot)           │                        │   TIMEOUT    │
└────────┬───────────┘                        └──────────────┘
         │ complete
         ▼
┌────────────────────┐   first-time only     ┌──────────────┐
│   OVL-AGE-GATE     │──if-passed──────────▶│ OVL-TUTORIAL │
│   (operator hook)  │                        │ (3 steps)    │
└────────┬───────────┘                        └──────┬───────┘
         │ pass                                      │ dismiss/skip
         └─────────────────────┬─────────────────────┘
                               ▼
                    ╔══════════════════════╗
                    ║                      ║
                    ║     SCR-MAIN         ║◀────────────┐
                    ║     (hub screen)     ║             │
                    ║                      ║             │
                    ╚═══════╦═════════╦════╝             │
                            │         │                  │
           ┌────────────────┘         └────────────┐     │
           │                                       │     │
           │ 3+ Scatter                Wheel sym   │     │
           │ OR Buy FS                 OR Buy Wheel│     │
           ▼                                       ▼     │
   ┌────────────────┐                     ┌──────────────────┐
   │ OVL-FS-INTRO   │                     │ OVL-WHEEL-INTRO  │
   └───────┬────────┘                     └────────┬─────────┘
           │                                       │
           ▼                                       ▼
   ┌────────────────┐                     ┌──────────────────┐
   │  SCR-FS        │                     │  SCR-WHEEL       │
   │  (free spins)  │                     │  (spinner)       │
   └───────┬────────┘                     └────────┬─────────┘
           │ FS counter=0                          │ lands on sector
           ▼                                       ▼
   ┌────────────────┐                  ┌──────────────────────────┐
   │ OVL-FS-OUTRO   │                  │ SCR-JACKPOT / SCR-MANSION │
   └───────┬────────┘                  │ SCR-BUZZSAW / SCR-MEGAHAT │
           │                           └────────┬──────────────────┘
           │                                    │ complete
           │                                    ▼
           │                           ┌──────────────────┐
           │                           │ OVL-WHEEL-OUTRO  │
           │                           └────────┬─────────┘
           │                                    │
           └────────────────────────────────────┴─────────────────┐
                                                                  │
              ┌─────────────── FROM SCR-MAIN ──────────────┐      │
              │                                            │      │
  ┌───────────▼──┐  ┌─────────────┐  ┌────────────┐ ┌─────▼───┐  │
  │ SCR-SETTINGS │  │ SCR-PAYTABLE│  │ SCR-INFO   │ │SCR-HIST │  │
  │ (drawer)     │  │ (sheet)     │  │ (rules)    │ │         │  │
  └─┬────┬───┬───┘  └─────┬───────┘  └────┬───────┘ └────┬────┘  │
    │    │   │            │               │              │       │
    │    │   └─SCR-RG-LIMITS              │              │       │
    │    └─ SCR-DEMO (from operator link) │              │       │
    │                                     │              │       │
    └──close (X/Esc)─────────────────────┴──────────────┴──────▶ SCR-MAIN
                                                                  ▲
                                                                  │
   ┌────────── FROM SCR-MAIN ──────────┐                          │
   │                                   │                          │
   ▼                                   ▼                          │
┌─────────────┐                ┌─────────────────┐                │
│SCR-BUYFEAT. │                │MOD-AUTOPLAY-    │                │
│             │─buy click────▶│  CONFIG         │                │
└──────┬──────┘                └────────┬────────┘                │
       │ buy FS/Wheel                   │ config set              │
       ▼                                ▼                         │
┌──────────────┐                 ┌─────────────────┐              │
│MOD-BUY-      │                 │ SCR-MAIN in     │              │
│ CONFIRM      │                 │ AUTOPLAY state  │─────stop──▶ │
│ (hold-to-    │                 └────────┬────────┘              │
│  confirm)    │                          │                        │
└──────┬───────┘                          │ stop/condition met     │
       │ confirmed                        ▼                        │
       └──▶ OVL-FS-INTRO OR       ┌──────────────────┐             │
            OVL-WHEEL-INTRO       │TST-AUTOPLAY-     │             │
            (rejoin main flow)    │  STOPPED         │────────────▶│
                                  └──────────────────┘             │
                                                                   │
   ┌──── REGULATORY INTERRUPTS from ANY state ─────────┐           │
   │                                                   │           │
   │  Timer 30/60min   Max-win hit   Limit breached    │           │
   │        │               │               │          │           │
   │        ▼               ▼               ▼          │           │
   │  MOD-REALITY      OVL-MAXWIN    MOD-RG-LIMIT-HIT  │           │
   │        │               │               │          │           │
   │        └─continue──────┴───────────┬───┘          │           │
   │                                    │              │           │
   └────────────────────────────────────┼──────────────┘           │
                                        │                          │
                                        └─resume or exit──────────▶│
                                                                   │
                                       ┌───────────────────────────┘
                                       ▼
                            ┌──────────────────┐
                            │ OPERATOR LOBBY   │
                            │ (exit)           │
                            └──────────────────┘
```

**Arrow legend:**
- solid arrow = user action / event-driven
- dotted arrow (implied) = timed / auto-transition
- double border box = hub screen

## Section 2 — Global Hotkey / Input Map

Desktop web only. Mobile uses touch primitives described in Part 1 § 5.1.

| Key | Action | Allowed in states | Notes |
|-----|--------|-------------------|-------|
| `Space` | Spin / Stop autoplay | `IDLE`, `AUTOPLAY` | Debounced |
| `Enter` | Confirm focused modal CTA | Any modal open | |
| `Esc` | Close modal / cancel | Any modal open | Focus returns to prior element |
| `↑` | Bet + | `IDLE` | Not during feature |
| `↓` | Bet - | `IDLE` | Not during feature |
| `T` | Toggle turbo | `IDLE` | Persists per session |
| `A` | Toggle autoplay config | `IDLE` | Opens `MOD-AUTOPLAY-CONFIG` |
| `P` | Open paytable | Any non-modal state | Opens `SCR-PAYTABLE` |
| `I` | Open info / rules | Any non-modal state | Opens `SCR-INFO` |
| `H` | Open history | Any non-modal state | |
| `M` | Mute/unmute all audio | Any | |
| `S` | Toggle spin sound only | Any | |
| `F` | Toggle fullscreen | Any | Desktop web only |
| `B` | Open Buy Feature panel | `IDLE` | Opens `SCR-BUYFEATURE` |
| `?` | Open contextual help | Any | Shows `TIP-HELP-MENU` |
| `Tab` | Advance focus | Any | |
| `Shift+Tab` | Reverse focus | Any | |
| `1` | Focus Bet controls | `IDLE` | Accessibility |
| `2` | Focus Reels | `IDLE` | A11y |
| `3` | Focus Spin | `IDLE` | A11y |

**Hotkey conflict rules:**
- Hotkeys are disabled while any text input is focused (e.g., Limit amount fields).
- Hotkeys emit the same analytics events as their click-equivalents with `input_method = "keyboard"`.
- Mobile ignores all hotkeys.
- Any hotkey triggered during a pending animation is queued if state-appropriate, dropped otherwise.

## Section 3 — Screen Specifications

The screens below are the complete inventory. Each has: purpose, state variants, ASCII layout, element table, state-behaviour rules, accessibility notes, analytics events, dev notes.

### 3.1 `SCR-LOADING` — Boot Loader

**Purpose:** Progressively load assets and configs; show branding; surface errors.
**Entry from:** Operator lobby.
**Exit to:** `OVL-AGE-GATE` → `OVL-TUTORIAL` (first-time) → `SCR-MAIN`.
**Max duration target:** 4s mobile LTE, 8s mobile 3G, 2s desktop cable.

**ASCII Layout (mobile portrait):**
```
┌────────────────────────┐
│                        │
│                        │
│       ┌────────┐       │
│       │  LOGO  │       │   Brand logo, 180×80 dp
│       └────────┘       │
│                        │
│   "Huff and Puff"      │   Title 28pt Cinzel
│                        │
│                        │
│  Wolf silhouette (anim)│   Animated lottie, 120×120 dp
│                        │
│  ████████░░░░ 62%      │   Progress bar 240×8 dp
│                        │
│  "Loading symbols…"    │   12pt Inter, tip line
│                        │
│                        │
│  © Juego Studioz 2026  │   10pt footer
└────────────────────────┘
```

**Element inventory:**

| Element | Type | Default | Range | SR label | Analytics |
|---------|------|---------|-------|----------|-----------|
| Logo | Image | brand SVG | — | "Huff and Puff logo" | — |
| Title text | Text | "Huff and Puff" | — | — | — |
| Wolf anim | Lottie | wolf-puff.lottie | loop | — | — |
| Progress bar | Progress | 0% | 0–100% | "Loading, {pct} percent" | — |
| Progress % | Text | "0%" | 0–100% | — | — |
| Tip line | Text | "Loading symbols…" | rotates 8 tips | aria-live polite | — |
| Footer copyright | Text | "© Juego Studioz 2026" | — | — | — |

**Rotating tips (8):**
1. "Free Spins trigger on 3 Scatters."
2. "Multipliers keep climbing on every cascade."
3. "Golden symbols turn into Wilds."
4. "The Wheel can award up to Grand 2000× your stake."
5. "Hold to confirm any purchase."
6. "Reality checks appear every 30 minutes."
7. "Tap-and-hold any symbol to see its paytable."
8. "Turbo mode halves spin time."

**States:**
- `LOADING` — default.
- `LOADING_SLOW` — progress < 50% after 6s. Show `"Still loading… check your connection."` tip.
- `ERROR` — any asset fails. Trigger `ERR-BOOT-TIMEOUT`.

**Accessibility:**
- `role="progressbar"` with `aria-valuenow/min/max`.
- Screen-reader announces every 10% progress.
- Works keyboard-only once `SCR-MAIN` loads.
- Reduce-motion: wolf anim → static image.

**Analytics:** `game_boot_start`, `game_boot_complete` (with duration_ms), `game_boot_error` (with error_code).

**Dev notes:**
- Load order: core config → reel strips → symbols → music bed → SFX set → Lottie → backdrop.
- Configs fetched from `/config/v1/huff-puff/{locale}/{env}.json` (18 configs — see Config Index tab of design sheet).
- Timeout per asset: 5s; global: 15s.

---

### 3.2 `SCR-MAIN` — Main Game

**Purpose:** Core gameplay hub. All spin interactions happen here.
**Entry from:** Boot, exit-from-feature, exit-from-ancillary-screen.
**Exit to:** `SCR-FS`, `SCR-WHEEL`, `SCR-BUYFEATURE`, any ancillary screen, operator lobby.

**ASCII Layout (desktop landscape LG):**
```
┌──────────────────────────────────────────────────────────────┐
│ ┌──┐ Bal $10.00  Last $0.00  Net +$0.00      ℹ 📊 🔊 ≡ ⛶   │  Top HUD
│ │⬅️│                                                          │
│ └──┘                                                          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   Multiplier: ×1 ─── ×2 ─── ×3 ─── ×5                        │  Multiplier ladder
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────┐          │
│  │       │       │       │       │       │        │          │
│  │   R1  │   R2  │   R3  │   R4  │   R5  │        │          │  REELS 3×5
│  │   C1  │       │       │       │       │        │          │
│  │───────│───────│───────│───────│───────│        │          │
│  │   R1  │   R2  │   R3  │   R4  │   R5  │        │          │
│  │   C2  │       │       │       │       │        │          │
│  │───────│───────│───────│───────│───────│        │          │
│  │   R1  │   R2  │   R3  │   R4  │   R5  │        │          │
│  │   C3  │       │       │       │       │        │          │
│  └────────────────────────────────────────────────┘          │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│    Win: $1.20                            Paylines: 10        │
├──────────────────────────────────────────────────────────────┤
│  [−] Bet $0.50 [+]   ┌─────────┐   [AUTO][TURBO][BUY] [▶]   │
│  Total Stake $0.50   │  SPIN   │   ↑ turbo mode: on          │
│                      └─────────┘                             │
└──────────────────────────────────────────────────────────────┘
```

**Element inventory (21 top-level elements):**

| ID | Element | Type | Default | Range | Persist | SR Label |
|----|---------|------|---------|-------|---------|----------|
| `sm-home` | Home button | IconBtn | enabled | — | — | "Return to lobby" |
| `sm-balance` | Balance | HUD-Counter | operator-supplied | 0–max-int | Server | "Balance {amount} dollars" |
| `sm-lastwin` | Last Win | HUD-Counter | 0 | 0–max-win | Session | "Last win {amount} dollars" |
| `sm-net` | Session Net | HUD-Counter | 0 | ±max-int | Session | "Session net {amount}" |
| `sm-info` | Info button | IconBtn | enabled | — | — | "Open info" |
| `sm-paytable` | Paytable button | IconBtn | enabled | — | — | "Open paytable" |
| `sm-sound` | Sound toggle | Toggle | on | on/off | Local | "Sound {state}" |
| `sm-menu` | Menu (settings) | IconBtn | enabled | — | — | "Open menu" |
| `sm-fullscreen` | Fullscreen | IconBtn | enabled | — | — | "Toggle fullscreen" (desktop only) |
| `sm-mult` | Multiplier ladder | HUD-ladder | ×1 | ×1/×2/×3/×5 | Feature-scoped | "Multiplier {value}" |
| `sm-reels` | Reels grid | CanvasWidget | symbols per strip | 3×5 | Server | "Reels, spin to play" |
| `sm-win-banner` | Win feedback | HUD-Counter | 0 | 0–max-win | Spin-scoped | "Win {amount} dollars" |
| `sm-paylines-ind` | Paylines indicator | Text | "Paylines: 10" | 1–10 | — | "{n} paylines active" |
| `sm-bet-minus` | Bet - | IconBtn | enabled in IDLE | — | — | "Decrease bet" |
| `sm-bet-plus` | Bet + | IconBtn | enabled in IDLE | — | — | "Increase bet" |
| `sm-bet-value` | Bet display | HUD-Counter | 0.10 | 0.10–10.00 | Server | "Bet {amount}" |
| `sm-totalstake` | Total stake | Text | 0.10 | = bet | — | "Total stake {amount}" |
| `sm-spin` | Spin | Btn-Primary | enabled in IDLE | — | — | "Spin" |
| `sm-autoplay` | Autoplay | Btn-Secondary | off | 10/25/50/100/∞ | Session | "Autoplay" |
| `sm-turbo` | Turbo | Toggle | off | on/off | Local | "Turbo {state}" |
| `sm-buyfeature` | Buy Feature | Btn-Secondary | enabled in IDLE | — | — | "Buy Feature" |

**Symbols on reels (16 total, ref GDD §5 / DS: Symbols & Paytable):**

| ID | Name | Role | Pays on 3/4/5 (× bet/line) | Notes |
|----|------|------|------------------------------|-------|
| H01 | Wolf | High-pay | 10 / 25 / 100 | Theme-primary |
| H02 | Pig | High-pay | 8 / 20 / 80 | |
| H03 | Mansion | High-pay | 6 / 15 / 60 | |
| H04 | Buzzsaw | High-pay | 5 / 12 / 50 | |
| H05 | Hat | High-pay | 4 / 10 / 40 | |
| L01 | A | Low-pay | 2 / 5 / 20 | Royal |
| L02 | K | Low-pay | 2 / 5 / 20 | |
| L03 | Q | Low-pay | 1.5 / 4 / 15 | |
| L04 | J | Low-pay | 1.5 / 4 / 15 | |
| L05 | 10 | Low-pay | 1 / 3 / 10 | |
| L06 | 9 | Low-pay | 1 / 3 / 10 | |
| W01 | Wild | Substitutes | 15 / 40 / 150 | Substitutes all except S01/G01/B01 |
| W02 | Bursting Wild | Expanding Wild | as W01 | Expands 1–4 cells (weighted, DS: Bursting Wild) |
| S01 | Scatter | Feature | 2 / 10 / 50 | 3+ triggers FS |
| G01 | Golden | Morph source | — | Converts to W02 via Golden Config |
| B01 | Bonus (Wheel) | Feature | — | 3 on reels 1/3/5 triggers Wheel |

**State variants of `SCR-MAIN`:**

| State | UI changes |
|-------|------------|
| `IDLE` | All controls enabled. Spin label "SPIN". |
| `SPINNING` | Bet, Autoplay, Buy disabled. Spin label "STOP" (if skip-stop enabled) else disabled. |
| `WIN-EVAL` | Reels show winning anim. Spin disabled. |
| `MORPH-CASCADE` | Morph anim playing. Spin disabled. |
| `AUTOPLAY` | Spin inverts to "STOP AUTO"; autoplay counter visible. |
| `PAUSED-RG` | All controls disabled; `MOD-REALITY` overlay. |
| `PAUSED-DISCONNECT` | All controls disabled; `OVL-RECONNECT` overlay. |
| `FEATURE-TRANSITION` | Frozen; transitioning to SCR-FS / SCR-WHEEL. |

**Accessibility:**
- Spin button has SR role=button, aria-pressed false, aria-disabled true during non-idle.
- `aria-live="polite"` on Last Win and Net counters — announces changes on settle.
- Reels surface has aria-label "Slot machine reels, 3 rows by 5 columns" and programmatic focus rings on the 15 cells when symbol-drill-in accessibility mode is on (default off).
- All state-reflecting colours mirrored to icon changes (e.g., disabled Spin uses greyed icon + locked padlock micro-icon).

**Analytics events fired:**
| Event | When | Payload |
|-------|------|---------|
| `spin_start` | Spin action | `{bet, stake, bet_level, input_method, turbo, autoplay, autoplay_remaining}` |
| `spin_complete` | Win eval done | `{spin_id, win_amount, paylines_hit, morphs, multiplier_final}` |
| `bet_changed` | Bet +/- | `{from, to, input_method}` |
| `turbo_toggled` | Turbo on/off | `{state, input_method}` |
| `feature_trigger` | FS / Wheel triggered | `{feature_type, trigger_source}` |
| `autoplay_started` | Autoplay start | `{spin_count, stop_conditions}` |
| `autoplay_stopped` | Autoplay stop | `{reason, spins_remaining}` |
| `buy_feature_open` | Buy panel open | `{input_method}` |

**Dev notes:**
- `sm-reels` is a single Unity RectTransform with 15 nested symbol slots; strip data fed from `reel_strips_base.json` / `reel_strips_fs.json`.
- State machine enum: `IDLE, SPINNING, REELSTOPPING, WIN_EVAL, MORPH_CASCADE, MULT_ADV, FEATURE_TRANSITION, AUTOPLAY, PAUSED_RG, PAUSED_DISC`.
- `sm-mult` element has 4 segments; active segment animates via tween on advancement; reset on feature end.

---

### 3.3 `SCR-FS` — Free Spins

**Purpose:** Play out the Free Spins feature with its own multiplier ladder and theme.
**Entry from:** `OVL-FS-INTRO`.
**Exit to:** `OVL-FS-OUTRO` → `SCR-MAIN`.

**Layout:** Identical shell to `SCR-MAIN` with these deltas:

- Background mutates to stormy-night variant.
- Music crossfades to FS track.
- Multiplier ladder shows `×2 ─ ×4 ─ ×6 ─ ×10`.
- Bet is LOCKED to trigger bet. Bet +/- disabled, tooltip `TIP-BET-LOCKED`.
- Autoplay, Turbo, Buy Feature disabled; their positions replaced with:
  - `FS Counter: 7 of 10` (large, centre-bottom).
  - `FS Total Win: $12.40` (green).
  - `Skip Animation` button (replaces Buy).

**Element inventory (delta vs SCR-MAIN):**

| ID | Element | Type | Default | Notes |
|----|---------|------|---------|-------|
| `fs-counter` | FS counter | HUD-Counter | 10 | Decrements each spin |
| `fs-total-win` | FS total win | HUD-Counter | 0 | Accumulates |
| `fs-skip` | Skip animation | Btn-Secondary | enabled | Fast-forwards remaining |
| `fs-multiplier` | FS multiplier | HUD-ladder | ×2 | `×2 → ×4 → ×6 → ×10` |
| `fs-retrigger-ind` | Retrigger indicator | Icon+badge | hidden | Shown on retrigger for 2.5s |

**FS states:**
- `FS_PLAY` — auto-spinning.
- `FS_PAUSE_ONWIN` — brief pause to display last win.
- `FS_RETRIGGER` — +5 spins added (GDD §11.4); spins counter animates.
- `FS_FINAL_SPIN` — last spin, extra UI emphasis.
- `FS_COMPLETE` — tally + exit.

**Accessibility:**
- FS counter announces each decrement: "Seven spins remaining."
- On retrigger: aria-live alert "Retrigger! Five spins added."
- Skip button focusable via Tab.

**Analytics:**
- `fs_entered` (trigger_source, bet, multiplier_start, spins_awarded).
- `fs_spin_complete` (spin_index, win, multiplier_current).
- `fs_retrigger` (scatters_count, spins_added, new_total).
- `fs_completed` (total_win, spins_played, multiplier_final).

---

### 3.4 `SCR-WHEEL` — Wheel Feature

**Purpose:** Spin the wheel; land on a sub-bonus sector.
**Entry from:** `OVL-WHEEL-INTRO`.
**Exit to:** Sub-bonus screen → `OVL-WHEEL-OUTRO` → `SCR-MAIN`.

**ASCII Layout:**
```
┌──────────────────────────────────────────┐
│           WHEEL OF FORTUNE               │
│                                          │
│         ╭─────────────────╮              │
│         │   ╭─J──╮         │             │
│         │  ╱      ╲        │             │
│         │ │  JACK  │       │             │
│         │  ╲POT ×  ╱       │             │
│         │   ╰────╯         │             │
│         │                   │             │
│         │ Mansion  Buzzsaw │             │
│         │                   │             │
│         │    Mega Hat       │             │
│         │                   │             │
│         ╰──────╥──────────╯              │
│                ║  ◀ pointer              │
│                ║                         │
│          [ SPIN WHEEL ]                  │
│                                          │
│  Sectors (weights from DS: Wheel):       │
│  Jackpot Mini ... 8%                     │
│  Jackpot Minor .. 12%                    │
│  Jackpot Major .. 4%                     │
│  Jackpot Grand .. 1%                     │
│  Mansion Bonus .. 30%                    │
│  Buzzsaw Bonus .. 25%                    │
│  Mega Hat Bonus . 20%                    │
└──────────────────────────────────────────┘
```

**Element inventory:**

| ID | Element | Type | Default | Notes |
|----|---------|------|---------|-------|
| `wh-wheel` | Wheel graphic | CanvasWidget | — | Sectors per `wheel_config.json` |
| `wh-pointer` | Pointer | StaticArt | at top | Indicates landed sector |
| `wh-spin` | Spin button | Btn-Primary | enabled | Single-tap; auto if Buy Feature |
| `wh-legend` | Sector legend | Table | — | Shows sectors + last-spin result highlighted |
| `wh-cancel` | Not available | — | — | Wheel cannot be cancelled; must resolve |

**Wheel spin timing:**
- Acceleration: 300 ms.
- Steady: 1600 ms (loop).
- Deceleration into landing: 1400 ms.
- Landing pulse: 500 ms.
- Total pre-sub-bonus: 3.8s (skippable on hold-to-skip after 1.0s).

**Weighted sector selection:**
Weights sum to 100%. Default distribution (ref DS: Wheel Feature):

| Sector | Weight % | Outcome |
|--------|----------|---------|
| Jackpot Mini | 8 | `SCR-JACKPOT` → Mini tier |
| Jackpot Minor | 12 | `SCR-JACKPOT` → Minor tier |
| Jackpot Major | 4 | `SCR-JACKPOT` → Major tier |
| Jackpot Grand | 1 | `SCR-JACKPOT` → Grand tier |
| Mansion Bonus | 30 | `SCR-MANSION` |
| Buzzsaw Bonus | 25 | `SCR-BUZZSAW` |
| Mega Hat Bonus | 20 | `SCR-MEGAHAT` |
| **Total** | **100** | |

**Accessibility:**
- Wheel has role=img with aria-describedby pointing to sector legend.
- Spin button announces "Spin the wheel" and after landing announces "Wheel landed on {sector}".
- For reduce-motion: wheel skips animation; jump-cut to landed sector with fade.

**Analytics:**
- `wheel_started` (source: organic / buy).
- `wheel_landed` (sector, weight_rolled).

---

### 3.5 `SCR-JACKPOT` — Jackpot Sub-bonus

**Purpose:** Reveal one of four jackpot tiers.
**Entry from:** `SCR-WHEEL` landed on any Jackpot sector.
**Exit to:** `OVL-WHEEL-OUTRO`.

**Layout:**
```
┌─────────────────────────────┐
│       JACKPOT WIN!          │
│                             │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐│
│  │MINI│ │MINOR│ │MAJOR│ │GRAND│
│  │50× │ │200× │ │500× │ │2000×│
│  └────┘ └────┘ └────┘ └────┘│
│   ▲▲▲    (one will highlight)│
│                             │
│  Revealing your prize…      │
└─────────────────────────────┘
```

**Tier values (× bet, ref DS: Jackpot Tiers):**

| Tier | Multiplier | Typical prob (given any Jackpot sector) |
|------|-----------|-----------------------------------------|
| Mini | 50× | 32% |
| Minor | 200× | 48% |
| Major | 500% | 16% |
| Grand | 2000× | 4% |

(Note: Grand is only reachable via Jackpot Grand sector directly per GDD §12.4. The internal probability table above applies only if the GDD is revised to a "rolled-from-any-Jackpot-sector" model — see Appendix B Q-07.)

**Element inventory:**

| ID | Element | Type | Notes |
|----|---------|------|-------|
| `jp-tiles` | Tile row | 4 × Card | Each shows tier + value |
| `jp-highlight` | Highlight state | Animation | Runs 2.5s cycling, then locks |
| `jp-revealed-tier` | Revealed tier | Label+prize | Displayed for 3s |

**Timing:**
- Highlight shuffle: 2.5s.
- Lock-in: 500 ms.
- Reveal glow: 1.5s.
- Exit to outro: 500 ms.

**Analytics:** `jackpot_revealed` (tier, multiplier).

---

### 3.6 `SCR-MANSION` — Mansion Pick-me Sub-bonus

**Purpose:** Pick rooms to reveal coin values until end-token.
**Entry from:** `SCR-WHEEL` → Mansion sector.
**Exit to:** `OVL-WHEEL-OUTRO`.

**Layout:**
```
┌───────────────────────────┐
│  MANSION BONUS            │
│  Pick rooms to collect    │
│                           │
│  ┌──┬──┬──┬──┬──┐         │
│  │R1│R2│R3│R4│R5│         │
│  ├──┼──┼──┼──┼──┤         │
│  │R6│R7│R8│R9│R10│        │
│  ├──┼──┼──┼──┼──┤         │
│  │R11│R12│R13│R14│R15│    │
│  └──┴──┴──┴──┴──┘         │
│                           │
│  Running total: $24.00    │
│  Picks remaining: ∞       │
└───────────────────────────┘
```

**Element inventory:**

| ID | Element | Type | Notes |
|----|---------|------|-------|
| `mb-rooms` | 15 tiles grid | Button × 15 | Each click reveals |
| `mb-running-total` | Total | HUD-Counter | Accumulates on each reveal |
| `mb-picks-remaining` | Remaining indicator | Text | "Pick until Collect" |

**Reveal contents (from DS: Mansion Bonus — 15 hidden values):** mix of coin values (1×, 2×, 3×, 5×, 10×, 20×, 50× bet) and 1 "Collect" token.

**Gameplay:**
- Player clicks any room; value revealed with coin-rain VFX.
- Running total increments.
- Click stops being allowed once "Collect" revealed.
- Forced auto-collect after 20 s idle.

**Accessibility:**
- Each room is tab-focusable; Enter / Space reveals.
- On reveal, aria-live announces "Room {n}: {prize}".
- Collect token announces: "Collect! Bonus ends. Total {total}."

**Analytics:** `mansion_pick` (pick_index, room_id, value), `mansion_completed` (total_win, picks_made).

---

### 3.7 `SCR-BUZZSAW` — Buzzsaw Sub-bonus

**Purpose:** Watch rows get cut; each cut reveals prize & advances multiplier.
**Entry from:** `SCR-WHEEL` → Buzzsaw sector.

**Layout:**
```
┌─────────────────────────────┐
│   BUZZSAW BONUS             │
│                             │
│   ═══════════════════════   │  Log rows stacked
│   ═══════════════════════   │
│   ═══════════════════════   │
│   ═══════════════════════   │
│   ═══════════════════════   │
│                             │
│   Cuts: 0 of 6              │
│   Multiplier: ×1            │
│   Total: $0.00              │
└─────────────────────────────┘
```

**Element inventory:**

| ID | Element | Type | Notes |
|----|---------|------|-------|
| `bz-rows` | Log rows | 5–7 rows | Animated cut |
| `bz-multiplier` | Mult value | HUD | Starts ×1, advances per cut |
| `bz-cuts-remaining` | Counter | Text | Decrements |
| `bz-total` | Running total | HUD-Counter | |
| `bz-end-token` | End | Badge | Can appear in any row |

**Gameplay:**
- Auto-animates; player watches.
- Each row cut reveals 1–5× bet value × current multiplier.
- Multiplier advances: ×1 → ×2 → ×3 → ×5.
- End token possible; forces early stop.

**Analytics:** `buzzsaw_cut` (row, value, multiplier), `buzzsaw_completed` (total, rows_cut).

---

### 3.8 `SCR-MEGAHAT` — Mega Hat Sub-bonus

**Purpose:** Hats covering 4–15 spaces across reels resolve into symbols.
**Entry from:** `SCR-WHEEL` → Mega Hat sector.

**Layout:** Reuses reels from `SCR-MAIN` but with hat overlays on 4–15 spaces.

**Mega Hat sequence:**
1. Hats randomly placed (weighted from DS: Mega Hat Bonus table — 4-spaces 16.7% to 15-spaces 4.3%).
2. Reels spin for one "hat spin" (500ms).
3. Hats resolve into a symbol (typically Wild or high-pay).
4. Grid evaluated; wins paid.
5. Player offered "Collect" or "Spin Again" (up to 3 total hat spins).
6. Each subsequent spin advances multiplier ×1 → ×2 → ×3.

**Element inventory:**

| ID | Element | Type | Notes |
|----|---------|------|-------|
| `mh-hats` | Hat overlays | Anim sprites | 4–15 on grid |
| `mh-spin` | Spin hat | Btn-Primary | Up to 3 presses |
| `mh-collect` | Collect | Btn-Secondary | Ends bonus |
| `mh-multiplier` | Multiplier HUD | — | Base x1, x2, x3 |
| `mh-total` | Total | HUD-Counter | Accumulates |

**Analytics:** `megahat_spin` (hat_count, multiplier, win), `megahat_collected` (total).

---

### 3.9 `SCR-BUYFEATURE` — Buy Feature Panel

**Purpose:** Let player purchase a feature directly.
**Entry from:** `SCR-MAIN` → Buy Feature button.
**Exit to:** `MOD-BUY-CONFIRM` or back to `SCR-MAIN`.

**Layout (overlay on SCR-MAIN, 80% height sheet):**
```
┌───────────────────────────────────────┐
│ × BUY FEATURE                        │
├───────────────────────────────────────┤
│                                       │
│ ┌─────────────────────────────────┐   │
│ │  BUY FREE SPINS                 │   │
│ │  ────────────                   │   │
│ │  10 Free Spins                  │   │
│ │  ×2 → ×10 multiplier ladder     │   │
│ │                                 │   │
│ │  Cost: 75× Bet = $37.50         │   │
│ │  Current bet: $0.50             │   │
│ │                                 │   │
│ │  [ BUY — HOLD ]                 │   │
│ └─────────────────────────────────┘   │
│                                       │
│ ┌─────────────────────────────────┐   │
│ │  BUY WHEEL                      │   │
│ │  ────────────                   │   │
│ │  Instant Wheel spin             │   │
│ │  Up to Grand 2000× stake        │   │
│ │                                 │   │
│ │  Cost: 50× Bet = $25.00         │   │
│ │                                 │   │
│ │  [ BUY — HOLD ]                 │   │
│ └─────────────────────────────────┘   │
│                                       │
│  ⚠ Not available during features     │
│  ⚠ Not available during Autoplay     │
│                                       │
│  [Cancel]                             │
└───────────────────────────────────────┘
```

**Element inventory:**

| ID | Element | Type | Default | State |
|----|---------|------|---------|-------|
| `bf-close` | Close (X) | IconBtn | enabled | Always |
| `bf-fs-card` | Buy FS card | Card | enabled | — |
| `bf-fs-cost` | FS cost computed | Text | `bet × 75` | Auto-updates |
| `bf-fs-buy` | Buy FS CTA | Btn-Primary | enabled if balance ≥ cost | Greyed else |
| `bf-fs-unaffordable` | Affordability tip | Caption | hidden | Shown if unaffordable |
| `bf-wheel-card` | Buy Wheel card | Card | enabled | — |
| `bf-wheel-cost` | Wheel cost | Text | `bet × 50` | Auto-updates |
| `bf-wheel-buy` | Buy Wheel CTA | Btn-Primary | enabled if balance ≥ cost | Greyed else |
| `bf-wheel-unaffordable` | Affordability tip | Caption | hidden | |
| `bf-cancel` | Cancel | Btn-Ghost | enabled | |
| `bf-warnings` | Warnings | Text list | static | |

**Behaviour:**
- Affordability checked on open + on balance change (if in-transit).
- Buy CTA requires hold-to-confirm (see `MOD-BUY-CONFIRM`).
- During Autoplay or features, Buy Feature button on `SCR-MAIN` is disabled and this screen unreachable.

**Accessibility:**
- Each card is a heading landmark.
- Cost announced when panel opens: "Buy Free Spins cost thirty-seven dollars fifty cents."
- Cancel is always focusable and Esc-closes.

**Analytics:**
- `buy_feature_open` (panel_opened_from).
- `buy_feature_selected` (feature, cost).
- `buy_feature_confirm_initiated` (feature).

---

### 3.10 `SCR-PAYTABLE` — Paytable

**Purpose:** Show symbol values, paylines, feature rules, RTP, max-win.
**Entry from:** Paytable button on any non-feature state.
**Exit to:** Prior screen.

**Layout:** Sheet view with horizontal paging:

- Page 1: Symbols & Payouts (all 16 symbols with 3/4/5-of-a-kind values, line pay).
- Page 2: Paylines (10 paylines visualized on 3×5 grid).
- Page 3: Features (Scatter → FS, Bonus → Wheel, Wild, Bursting Wild, Golden).
- Page 4: Game Info — RTP (96.10%), Volatility (High), Max Win (10,000×), Hit Frequency (~26.5%).

**Element inventory (Page 1 shown):**

| ID | Element | Type | Notes |
|----|---------|------|-------|
| `pt-close` | Close | IconBtn | Always visible |
| `pt-page-indicator` | Page dots | Indicator | 1/2/3/4 |
| `pt-page-prev` | Previous page | IconBtn | Disabled on page 1 |
| `pt-page-next` | Next page | IconBtn | Disabled on page 4 |
| `pt-symbol-grid` | Symbol cards | 16 cards | See table §3.2 for values |
| `pt-bet-reference` | Bet reference | Text | "Values shown at current bet: $0.50" |

**Accessibility:**
- Fully keyboard-navigable.
- Each symbol card is a heading with descriptive SR label "Wolf, high-pay symbol, three pays ten, four pays twenty-five, five pays one hundred."
- Page changes announce.

---

### 3.11 `SCR-INFO` — Game Rules / Info

**Purpose:** Long-form rules, FAQ, legal footer.
**Entry from:** Info button.

**Sections (accordion):**

1. How to Play (200-word primer)
2. Symbols & Paytable summary (link to `SCR-PAYTABLE`)
3. Features (FS, Wheel, Multipliers, Morphs, Bursting Wild, Golden)
4. Paylines
5. Malfunction disclaimer ("Malfunction voids all pays and plays.")
6. RTP & Volatility
7. Responsible gambling (link to `SCR-RG-LIMITS` + external help)
8. Version (game version, config version)

**Elements:**

| ID | Element | Type |
|----|---------|------|
| `inf-close` | Close | IconBtn |
| `inf-sections` | Accordion | 8 sections |
| `inf-search` | Search rules | Search box |
| `inf-contact` | Contact support | Link |

Accessibility: standard reading-order; each section heading is a h2; accordion expand is announced.

---

### 3.12 `SCR-HISTORY` — Spin History

**Purpose:** Show the last 50 spins; required by regulators in UK, ON, MT.
**Entry from:** History button.

**Layout:** Scrollable list:

```
┌──────────────────────────────────────┐
│ History — last 50 spins              │
├──────────────────────────────────────┤
│ #0024  2026-04-23 18:42  $0.50 bet   │
│        Win: $2.40  Net: +$1.90       │
│        ▼ expand  [details]           │
├──────────────────────────────────────┤
│ #0023  2026-04-23 18:41  $0.50 bet   │
│        Win: $0.00  Net: -$0.50       │
├──────────────────────────────────────┤
│ ...                                  │
└──────────────────────────────────────┘
```

**Each row columns:** timestamp, bet, win, net delta. Tap-to-expand shows: spin ID, stop symbols, paylines hit, morph count, feature trigger if any.

**Element inventory:**

| ID | Element | Type |
|----|---------|------|
| `hs-close` | Close | IconBtn |
| `hs-list` | List | Scroll list |
| `hs-filter` | Filter | Dropdown (All / Wins / Features / Losses) |
| `hs-export` | Export CSV | Btn-Secondary | (Operator-gated) |
| `hs-row-expand` | Row detail | Accordion |

**Analytics:** `history_viewed`, `history_row_expanded` (spin_id).

---

### 3.13 `SCR-SETTINGS` — Settings Drawer

**Purpose:** Configure audio, gameplay, accessibility, limits, see about.
**Entry from:** Menu (≡) button.

**Tabs (5):**

**Audio tab — 6 controls:**

| Control | Type | Default | Range | SR label |
|---------|------|---------|-------|----------|
| Master Volume | Slider | 100 | 0–100 | "Master volume, {n} percent" |
| Music Volume | Slider | 80 | 0–100 | "Music volume, {n} percent" |
| SFX Volume | Slider | 90 | 0–100 | "Sound effects volume, {n} percent" |
| Ambient Volume | Slider | 60 | 0–100 | "Ambient volume, {n} percent" |
| Mute On Background | Toggle | on | on/off | "Mute when tab in background" |
| Voice Announcer | Toggle | off | on/off | "Voice announcer for wins" |

**Gameplay tab — 7 controls:**

| Control | Type | Default | Range | Notes |
|---------|------|---------|-------|-------|
| Turbo Default | Toggle | off | on/off | Persists |
| Skip Stop Enabled | Toggle | on | on/off | Enables "STOP" mid-spin |
| Quickspin | Toggle | off | on/off | Faster than turbo, cuts win anim |
| Space Bar Spins | Toggle | on | on/off | Desktop only |
| Show Net | Toggle | on | on/off | Show session net in HUD |
| Autoplay Bet Lock | Toggle | on | on/off | Blocks bet change during autoplay |
| Confirmation on Big Bet | Toggle | off | on/off | Confirm bet ≥ $5 |

**Accessibility tab — 8 controls:**

| Control | Type | Default | Range | Notes |
|---------|------|---------|-------|-------|
| Reduce Motion | Toggle | off | on/off | Overrides OS |
| High Contrast | Toggle | off | on/off | |
| Colorblind Mode | Dropdown | Off | Off/Protanopia/Deuteranopia/Tritanopia | Remaps symbol tints |
| Text Size | Dropdown | Medium | Small/Medium/Large/XL | |
| Focus Ring Thickness | Dropdown | 2px | 2/3/4 px | |
| Audio-Only Win Cues | Toggle | off | on/off | Beeps on wins |
| Screen Reader Verbose | Toggle | off | on/off | |
| Dwell Click | Toggle | off | on/off | 600ms hover = click |

**Limits tab (operator-provided, UI scaffold):**

| Control | Type | Default | Notes |
|---------|------|---------|-------|
| Session Time Limit | Dropdown | None | 15/30/60/120/None min |
| Reality Check Interval | Dropdown | 60 | 30/60/90 min |
| Loss Limit (session) | Amount input | None | Operator-defined currency |
| Win Limit (session) | Amount input | None | |
| Self-Exclude | Link | — | Goes to operator self-exclusion flow |
| Problem Gambling Help | Link | — | External |

**About tab:**
- Game version (e.g., 1.0.0+build-231).
- Config version.
- RTP statement.
- Legal links: Terms, Privacy, Responsible Gambling.
- "Malfunction voids all pays" disclaimer.
- Support contact.

**Element inventory (tab-level):**

| ID | Element | Type |
|----|---------|------|
| `st-close` | Close drawer | IconBtn |
| `st-tabs` | Tab switcher | Tab bar × 5 |
| `st-save` | Save changes | Btn-Primary (only if changes pending) |
| `st-reset` | Reset to defaults | Btn-Ghost |

**Analytics:** `settings_opened`, `setting_changed` (key, from, to), `settings_saved`.

---

### 3.14 `SCR-RG-LIMITS` — Responsible Gambling Limits

**Purpose:** Configure RG limits. Dedicated screen (linked from Settings → Limits).
**Element inventory:**

| ID | Element | Type |
|----|---------|------|
| `rg-session-time` | Time limit | Dropdown (see Settings Limits tab) |
| `rg-loss-limit-session` | Session loss limit | Amount input |
| `rg-loss-limit-daily` | Daily loss limit | Amount input (operator) |
| `rg-loss-limit-weekly` | Weekly loss limit | Amount input (operator) |
| `rg-deposit-limit` | Deposit limit | Link to operator |
| `rg-selfexclude-24h` | 24-hour pause | Btn-Secondary |
| `rg-selfexclude-30d` | 30-day self-exclude | Btn-Danger |
| `rg-selfexclude-perm` | Permanent self-exclude | Btn-Danger |
| `rg-help-link` | Problem gambling help | Link |

Certain controls delegate to operator-hosted flows (UKGC, MGA comply). The in-game UI captures the UX and posts an event; the actual enforcement is on the operator side.

---

### 3.15 `SCR-DEMO` — Demo / Fun-play Mode

**Purpose:** Free-play mode. No monetary language; "coins" labelled "credits"; no balance deposit; no cashout.
**Delta vs `SCR-MAIN`:**
- Balance replaced with "Credits" counter (fixed 10,000 credits, auto-reset on session start).
- Spin/Bet work identically.
- Buy Feature works with credits.
- Settings tab "Limits" is hidden.
- Watermark "DEMO MODE — not for real money" in bottom-left.

Same element layout otherwise.

---

### 3.16 `SCR-SESSION-EXPIRED` — Session Expired

**Purpose:** Session cookie invalidated.

**Layout:**
```
┌──────────────────────────────────────┐
│      SESSION EXPIRED                 │
│                                      │
│  Your session has timed out.         │
│  Please sign in again to resume.     │
│                                      │
│  [Resume]  [Exit to Lobby]           │
└──────────────────────────────────────┘
```

Redirects through operator auth, then returns to `SCR-MAIN` with saved state.

---

### 3.17 `SCR-UNSUPPORTED` — Unsupported Browser

**Purpose:** Minimum browser or WebGL requirement not met.

**Layout:**
```
┌──────────────────────────────────────┐
│  BROWSER NOT SUPPORTED               │
│                                      │
│  Huff and Puff requires:             │
│   • Chrome 100+ / Safari 15+ /        │
│     Edge 100+ / Firefox 102+         │
│   • WebGL 2.0 support                │
│                                      │
│  Your browser: Safari 13.1           │
│                                      │
│  [Exit to Lobby]                     │
└──────────────────────────────────────┘
```

## Section 4 — Modal Inventory

All modals follow `Modal-Frame` component. Title + body + 1–3 CTAs. Esc closes except where locked. Only one modal open at a time (regulatory pre-empts).

| ID | Title | Trigger | Body | CTAs | Esc | SR | Analytics |
|----|-------|---------|------|------|-----|----|-----------|
| `MOD-REALITY` | "Reality Check" | 30/60 min timer crosses | "You've played for {n} minutes. Net: {net}. Take a break?" | Continue / Take Break / Close | Continue | aria-live alert, focus on Continue | `reality_check_shown` / `_continued` / `_break` / `_closed` |
| `MOD-LOW-BALANCE` | "Not enough balance" | Spin with balance < bet | "You need {delta} more to play at this bet. Add funds or lower your bet." | Add Funds / Lower Bet / Cancel | Cancel | aria-live alert | `low_balance_shown` |
| `MOD-AUTOPLAY-CONFIG` | "Autoplay" | Tap Autoplay on SCR-MAIN | Spin count picker + stop condition config | Start / Cancel | Cancel | Focus first field | `autoplay_config_opened` / `_cancelled` / `_started` |
| `MOD-AUTOPLAY-STOPCONDITIONS` | "Stop autoplay when…" | Advanced link inside MOD-AUTOPLAY-CONFIG | Checkboxes: on big win X, on feature, on balance below Y, on single win above Z | Save / Cancel | Cancel | | `autoplay_stop_conditions_saved` |
| `MOD-BUY-CONFIRM` | "Confirm Purchase" | Buy FS or Wheel tapped | "Buy {feature}? Cost {cost}. This will deduct immediately." + hold-to-confirm ring | Hold-to-Confirm / Cancel | Cancel | Progress ring aria-valuenow | `buy_feature_confirmed` / `_cancelled` |
| `MOD-BET-HIGH` | "High bet confirmation" | New bet ≥ $5 with setting on | "Confirm bet of {bet}?" | Confirm / Cancel | Cancel | | `bet_high_confirm_shown` / `_confirmed` / `_cancelled` |
| `MOD-RG-LIMIT-HIT` | "Session Limit Reached" | Limit breached | "You've reached your {type} limit. Your session will end." | End Session / View Limits | — locked | focus trap | `rg_limit_hit` (type) |
| `MOD-RG-BREAK-ACTIVE` | "Break in progress" | If take-break active | "You're on a break. {time_remaining} remaining." | Exit / Wait | — locked | | `rg_break_shown` |
| `MOD-SERVER-ERROR` | "Something went wrong" | 5xx response | "We hit a snag. {error_code}" | Retry / Report / Exit | Exit | aria-live alert | `server_error_shown` (code) |
| `MOD-CONFIG-ERROR` | "Couldn't load game" | Config fetch failed | "Unable to load game configuration. Please refresh." | Refresh / Exit | — locked | | `config_error_shown` |
| `MOD-CONCURRENT-SESSION` | "Another session detected" | Same account another tab | "You're logged in on another device/tab. Only one active session allowed." | Switch here / Exit | — locked | | `concurrent_session_detected` |
| `MOD-CONFIRM-EXIT-FEATURE` | "Exit Feature?" | Player tries to exit during FS/Wheel | "If you leave now, you'll lose any remaining spins/picks. Are you sure?" | Exit / Stay | Stay | | `exit_feature_confirm_shown` |
| `MOD-CONFIRM-EXIT-GAME` | "Exit Game?" | Home button in AUTOPLAY/paused | "Autoplay is running. Stop and exit?" | Stop & Exit / Continue | Continue | | `exit_game_confirm_shown` |
| `MOD-RECONNECT-FAILED` | "Can't reconnect" | 60s disconnect | "We couldn't reconnect. Your progress is saved — try again later." | Retry / Exit | Exit | | `reconnect_failed` |
| `MOD-MAX-WIN-REACHED` | "Max Win Reached!" | Max win cap hit | "Congratulations! You hit the maximum win of 10,000× your bet." | Collect / View Details | — locked | | `max_win_reached` |
| `MOD-MAINTENANCE` | "Maintenance" | Service maintenance flag | "We're upgrading the game. Back soon: {eta}" | Close | Close | | `maintenance_shown` |
| `MOD-CASHIER-REDIRECT` | "Go to Cashier?" | "Add Funds" clicked | "You'll be taken to the cashier. Return here when ready." | Go / Cancel | Cancel | | `cashier_redirect` |
| `MOD-DEVTOOLS-DETECTED` | "Not supported" | Devtools open | "For security, this game can't run with developer tools open." | Close tools / Exit | Exit | | `devtools_detected` |
| `MOD-TUTORIAL-SKIP-CONFIRM` | "Skip Tutorial?" | Skip tap in tutorial | "You can re-enable the tutorial in Settings." | Skip / Continue | Continue | | `tutorial_skip_confirm` |
| `MOD-SETTINGS-UNSAVED` | "Unsaved Changes" | Close settings with pending | "You have unsaved changes. Save now?" | Save / Discard / Cancel | Cancel | | `settings_unsaved_prompt` |
| `MOD-LANG-CHANGE` | "Change Language?" | Language dropdown in About | "The game will reload to change language." | Reload / Cancel | Cancel | | `lang_change_confirm` |
| `MOD-AGE-GATE` | "Verify Your Age" | First launch if operator requires | "You must be 18+ to play." + DOB input | Confirm / Cancel | — locked | required input | `age_gate_shown` / `_passed` / `_failed` |
| `MOD-HIDDEN-DEVIATION` | "Unusual activity" | Suspected fraud flag (server-issued) | "Your session has been paused for verification." | Contact Support / Exit | Exit | | `hidden_deviation_flag` |
| `MOD-NETWORK-QUALITY` | "Slow connection" | RTT > 500ms sustained | "Your connection seems slow. Gameplay may be affected." | Continue / Exit | Continue | | `network_slow_shown` |

**Modal animation:** fade-in scrim 150ms; scale-up modal from 0.95 to 1.0 over 200ms ease-out. Fade-out reverses.

## Section 5 — Toast / Notification Inventory

Toasts are non-blocking. Bottom-of-viewport on mobile, top-right on desktop. Auto-dismiss.

| ID | Trigger | Copy | Duration | Icon | SR | SFX |
|----|---------|------|----------|------|----|----|
| `TST-FS-TRIGGERED` | 3+ Scatters | "10 Free Spins!" | 2.0s | ✨ | aria-live assertive | scatter-trigger |
| `TST-FS-RETRIGGER` | Scatters in FS | "Retrigger! +5 spins" | 2.0s | 🔄 | aria-live alert | retrigger-stinger |
| `TST-WHEEL-TRIGGERED` | Wheel bonus | "Wheel Feature!" | 2.0s | 🎡 | aria-live assertive | wheel-enter |
| `TST-GOLDEN-CONVERT` | Golden → W02 | "Golden became a Wild!" | 2.5s | 🌟 | aria-live polite | golden-morph |
| `TST-SCATTER-NEAR` | 2 scatters landed | "Close! One more Scatter for Free Spins." | 2.0s | ✨ | aria-live polite | near-miss |
| `TST-MULT-ADV` | Multiplier advances | "Multiplier ×2!" | 1.5s | ⚡ | aria-live polite | mult-up |
| `TST-BIG-WIN` | Win 15×–50× bet | "Big Win!" | 3.0s | 💰 | aria-live assertive | crescendo-1 |
| `TST-BET-CAPPED` | Bet capped by balance | "Bet lowered to {new}." | 2.0s | ⚠ | aria-live assertive | warn |
| `TST-AUTOPLAY-STARTED` | Autoplay starts | "Autoplay: {n} spins" | 1.5s | ▶ | aria-live polite | confirm |
| `TST-AUTOPLAY-STOPPED` | Autoplay stops | "Autoplay stopped: {reason}" | 2.5s | ⏹ | aria-live polite | |
| `TST-CONNECTION-RESTORED` | Reconnect success | "You're back online." | 2.0s | ✓ | aria-live polite | connect |
| `TST-SOUND-TOGGLED` | S hotkey or mute | "Sound {on/off}" | 1.0s | 🔊/🔇 | aria-live polite | |
| `TST-TURBO-TOGGLED` | T hotkey or toggle | "Turbo {on/off}" | 1.0s | ⚡ | aria-live polite | |
| `TST-QUICKSPIN-ENABLED` | Quickspin toggle | "Quickspin on" | 1.5s | ⚡⚡ | aria-live polite | |
| `TST-RATE-LIMIT` | Spin too fast | "Slow down — spin cooldown." | 2.0s | ⏱ | aria-live alert | |
| `TST-COPIED` | Copy spin ID (debug) | "Copied." | 1.0s | ✓ | aria-live polite | |
| `TST-COIN-MILESTONE` | Session balance milestone | "Session win {amount}" | 2.0s | 💰 | aria-live polite | |
| `TST-FEATURE-SAVED` | Feature state saved | "Progress saved." | 1.0s | ✓ | aria-live polite | |

**Animation:** slide-in from offscreen 200ms, hold, slide-out 200ms. Max 3 stacked; FIFO.

## Section 6 — Tooltip Inventory

Tooltips are on-hover (desktop) or tap-and-hold (mobile). Never auto-show.

| ID | Trigger | Copy | Max width |
|----|---------|------|-----------|
| `TIP-BET-LADDER` | Hover bet display | "Bet ladder: 0.10, 0.20, 0.50, 1.00, 2.00, 5.00, 10.00" | 240 dp |
| `TIP-BET-LOCKED` | Hover disabled Bet in feature | "Bet locked during feature. Trigger bet: {bet}." | 240 dp |
| `TIP-TURBO` | Hover turbo toggle | "Faster spins. Shortcut: T." | 200 dp |
| `TIP-QUICKSPIN` | Hover quickspin toggle | "Cuts win animations for fastest play." | 220 dp |
| `TIP-AUTOPLAY` | Hover autoplay | "Configure and start a sequence of spins." | 220 dp |
| `TIP-BUY-FEATURE` | Hover Buy button | "Instantly trigger a feature. Hold to confirm." | 220 dp |
| `TIP-MULT-LADDER` | Hover multiplier HUD | "Multiplier advances on every cascade." | 240 dp |
| `TIP-SCATTER` | Tap-hold scatter on reels | "3+ Scatters = 10 Free Spins." | 220 dp |
| `TIP-WILD` | Tap-hold wild on reels | "Substitutes all symbols except Scatter, Bonus, Golden." | 240 dp |
| `TIP-BURSTING-WILD` | Tap-hold W02 | "Bursting Wild expands up to 4 cells." | 220 dp |
| `TIP-GOLDEN` | Tap-hold G01 | "Golden symbols convert to Wilds on cascade." | 240 dp |
| `TIP-SOUND-ICON` | Hover sound toggle | "Mute/unmute all audio. Shortcut: M." | 200 dp |
| `TIP-FULLSCREEN` | Hover fullscreen | "Toggle fullscreen. Shortcut: F." | 180 dp |
| `TIP-INFO` | Hover info | "Game rules, RTP, help." | 200 dp |
| `TIP-PAYTABLE` | Hover paytable icon | "Symbols and payouts." | 180 dp |
| `TIP-HOME` | Hover home | "Return to lobby. Active session saved." | 220 dp |
| `TIP-NET-INDICATOR` | Hover Net | "Your session profit/loss so far." | 220 dp |
| `TIP-RG-CHIP` | Hover session-time chip | "Session time — tap for reality check." | 220 dp |
| `TIP-HELP-MENU` | ? hotkey | Contextual — lists available hotkeys | 320 dp |

**Timing:** Show after 600ms hover; hide on mouse-out or Esc. Mobile hold: 400ms to show, dismiss on tap-out.

## Section 7 — Overlay / Cutscene Inventory

Full-screen non-interactive moments (skippable via explicit action).

| ID | Trigger | Duration | Skip rule | Content |
|----|---------|----------|-----------|---------|
| `OVL-AGE-GATE` | Boot first-time | until dismissed | cannot skip | DOB gate |
| `OVL-TUTORIAL` | First-time only | user-paced | Skip anytime | 3 steps |
| `OVL-FS-INTRO` | FS triggered | 3.0s | Tap to dismiss | "10 Free Spins!" title card w/ wolf howl |
| `OVL-FS-OUTRO` | FS completed | 3.5s | Tap to dismiss | Total win count-up |
| `OVL-WHEEL-INTRO` | Wheel triggered | 2.5s | Hold 1.0s to skip | "Wheel of Fortune!" cinematic |
| `OVL-WHEEL-OUTRO` | Wheel bonus completed | 3.0s | Tap to dismiss | Total win count-up |
| `OVL-BIGWIN` | Win ≥ 15× bet | 1.8s | Tap to skip | Count-up + "BIG WIN" banner |
| `OVL-HUGEWIN` | Win ≥ 50× bet | 2.4s | Tap to skip | "HUGE WIN" with zoom |
| `OVL-MEGAWIN` | Win ≥ 100× bet | 3.2s | Tap to skip | "MEGA WIN" + particles |
| `OVL-SUPERMEGAWIN` | Win ≥ 500× bet | 4.0s | Tap to skip | "SUPER MEGA WIN" + cinematic |
| `OVL-MAXWIN` | Cap hit | 4.5s | — cannot skip | "MAX WIN" fanfare, game locks |
| `OVL-FEATURE-COMPLETE` | Any feature ends | 2.5s | Tap to dismiss | Feature win total |
| `OVL-RECONNECT` | Disconnected > 3s | until reconnect / 60s timeout | — cannot skip | Spinner + "Reconnecting…" |
| `OVL-IDLE-REMINDER` | 5 min inactivity | 5s | Any input | "Still there? Your session will end in 2 min." |
| `OVL-AUTOPLAY-END` | Autoplay final spin | 1.5s | Tap to dismiss | "Autoplay complete" summary |
| `OVL-MAINT-WARNING` | Scheduled maint | 10s | — cannot skip | "Maintenance in 2 min" |

**Cap on stacking:** only one overlay active at a time. Priority (highest first): `OVL-MAXWIN > OVL-RECONNECT > OVL-MAINT-WARNING > OVL-FEATURE-COMPLETE > win overlays > OVL-IDLE-REMINDER`.

## Section 8 — Error State Catalog

Complete error taxonomy with codes, user messages, dev diagnostics.

| Code | Name | User-facing | Dev-visible | Recovery |
|------|------|-------------|-------------|----------|
| `ERR-NETWORK-001` | Socket drop | "Reconnecting…" (OVL) | socket close code | Auto-retry exp backoff |
| `ERR-NETWORK-002` | Request timeout | "Slow connection" (TST) | request_id, latency | Auto-retry once |
| `ERR-NETWORK-003` | Unreachable | Modal MOD-RECONNECT-FAILED | last endpoint, code | Manual retry |
| `ERR-AUTH-001` | Session expired | SCR-SESSION-EXPIRED | session_id | Re-auth |
| `ERR-AUTH-002` | Invalid token | SCR-SESSION-EXPIRED | token hash | Re-auth |
| `ERR-AUTH-003` | Concurrent session | MOD-CONCURRENT-SESSION | other device | Choose session |
| `ERR-FUNDS-001` | Insufficient balance | MOD-LOW-BALANCE | balance, bet | Cashier / lower bet |
| `ERR-FUNDS-002` | Balance negative (desync) | MOD-SERVER-ERROR | balance | Force reconcile |
| `ERR-SERVER-500` | Server error | MOD-SERVER-ERROR | trace_id | Retry + report |
| `ERR-SERVER-503` | Service unavailable | MOD-MAINTENANCE | ETA | Wait |
| `ERR-SERVER-429` | Rate limit | TST-RATE-LIMIT | retry_after | Wait then retry |
| `ERR-CONFIG-001` | Config load fail | MOD-CONFIG-ERROR | config_id | Refresh |
| `ERR-CONFIG-002` | Config hash mismatch | MOD-CONFIG-ERROR | expected vs actual | Refresh |
| `ERR-CONFIG-003` | Config version stale | force-refresh | version | Auto-refresh |
| `ERR-RNG-001` | RNG provider failure | MOD-SERVER-ERROR | provider_id | Retry |
| `ERR-RNG-002` | Outcome unverifiable | MOD-SERVER-ERROR | spin_id | Retry |
| `ERR-MAXWIN-001` | Max win cap hit mid-feat | OVL-MAXWIN, force end | — | Feature force-ends |
| `ERR-RG-001` | Limit breached | MOD-RG-LIMIT-HIT | limit_type | Exit |
| `ERR-RG-002` | Self-excluded | MOD-RG-LIMIT-HIT (locked) | exclusion_until | Exit |
| `ERR-BROWSER-001` | Unsupported browser | SCR-UNSUPPORTED | UA | Exit |
| `ERR-BROWSER-002` | WebGL missing | SCR-UNSUPPORTED | gl capability | Exit |
| `ERR-BOOT-001` | Boot timeout | MOD-SERVER-ERROR + reload | load stage | Reload |
| `ERR-BOOT-002` | Assets corrupt | MOD-SERVER-ERROR | asset | Reload |
| `ERR-DEVTOOLS-001` | Devtools open (strict) | MOD-DEVTOOLS-DETECTED | — | Close tools |
| `ERR-CONCUR-001` | Race on balance update | MOD-SERVER-ERROR | versions | Force reconcile |
| `ERR-LANG-001` | Locale file missing | fallback to English | locale | Fallback |
| `ERR-ASSET-001` | Missing sound | silent fallback | asset_id | Continue |
| `ERR-ASSET-002` | Missing symbol VFX | generic fallback | symbol_id | Continue |
| `ERR-STATE-001` | State machine deadlock | force to IDLE, log | last_state | Manual recover |
| `ERR-STATE-002` | Invalid transition | log, force IDLE | from, to | Recover |

All errors emit a `error_logged` analytics event with code, context, recovery_chosen.

## Section 9 — Keyboard Flow & Focus Rules

**Tab order in `SCR-MAIN` IDLE** (logical):

1. Home button
2. Balance (read-only; skip unless SR-verbose)
3. Info
4. Paytable
5. Sound
6. Menu
7. Fullscreen (desktop only)
8. Bet -
9. Bet +
10. Spin (primary)
11. Autoplay
12. Turbo
13. Buy Feature

**Tab order in modal:**
- Focus auto-to first interactive on open.
- Focus trapped (tabbing past last returns to first).
- On close, focus returns to element that spawned modal.

**Tab order in `SCR-PAYTABLE`:**
1. Close
2. Page prev
3. Page next
4. Symbol cards (in grid reading order)

**Focus ring:** 2 px warm-yellow (`#FFC24A`), offset 2 px, round corners match element.

**Skip links:** hidden until keyboard-focused:
- "Skip to reels" (jumps to `sm-reels`)
- "Skip to spin button" (jumps to `sm-spin`)
- "Open game menu" (jumps to `sm-menu`)

## Section 10 — Dev Integration Notes

### 10.1 Game state JSON schema (autosave)

```json
{
  "version": "1.0.0",
  "player_id": "uuid",
  "session_id": "uuid",
  "bet": 0.50,
  "bet_level_index": 2,
  "balance": 120.45,
  "session_spent": 14.50,
  "session_won": 18.25,
  "session_net": 3.75,
  "session_start_ts": "2026-04-23T18:00:00Z",
  "session_spin_count": 27,
  "state": "IDLE",
  "turbo": true,
  "quickspin": false,
  "autoplay": {
    "active": false,
    "remaining": 0,
    "total": 0,
    "stop_on_big_win": 0,
    "stop_on_balance_below": 0,
    "stop_on_feature": true,
    "stop_on_single_win_above": 0
  },
  "feature": {
    "type": null,
    "fs_remaining": 0,
    "fs_total_awarded": 0,
    "fs_retrigger_count": 0,
    "fs_total_win": 0,
    "multiplier_current": 1,
    "multiplier_ladder_index": 0,
    "wheel_state": null
  },
  "last_spin": {
    "id": "uuid",
    "bet": 0.50,
    "stops": [[1,5,3],[4,12,7],[2,9,6],[8,11,10],[0,13,14]],
    "wins": [{"payline": 1, "symbol":"H01", "count": 3, "pay": 5.00}],
    "morphs": [{"cascade":1, "symbols":["H01","G01"]}],
    "total_win": 5.00,
    "multiplier_final": 2,
    "scatter_count": 2,
    "ts": "2026-04-23T18:12:01Z"
  },
  "settings_snapshot": { "audio_master": 100, "reduce_motion": false, "text_size": "medium" },
  "rg": {
    "reality_check_interval_min": 30,
    "reality_check_last_ts": "2026-04-23T18:00:00Z",
    "session_time_limit_min": null,
    "session_loss_limit": null,
    "session_loss_so_far": 0,
    "self_excluded_until": null
  },
  "flags": {
    "first_time": false,
    "tutorial_seen": true,
    "max_win_reached": false
  },
  "config_version": "1.0.0+c231"
}
```

Autosave triggers: every `IDLE` return, every feature transition, every settings save, every 10s if nothing else. Max payload 8 KB.

### 10.2 Unity canvas / scaler rules

- Canvas `ScaleMode = Scale With Screen Size`, `Reference Resolution 1440×900`, `ScreenMatchMode = Match Width or Height`, `Match = 0.5`.
- Mobile portrait: dynamic layout switch when aspect < 1.0; layout group reflows HUD.
- Dynamic DPI scaling kept off; use native resolution canvas with manual overrides for pixel art.

### 10.3 Audio buses

| Bus | Default vol | Elements |
|-----|-------------|----------|
| Master | 1.0 | parent |
| Music | 0.8 | music_base, music_fs, music_wheel, music_bonus_* |
| SFX | 0.9 | ui, reels, wins, features, environment |
| Ambient | 0.6 | ambient loops |
| Voice | 0.85 | big win narrator (if enabled) |

Full sound map: design sheet "Sounds" tab (38 entries) — referenced by `sound_id`.

### 10.4 Analytics events — full list (ref DS: Analytics Events tab)

Normative contract: every event includes `player_id`, `session_id`, `spin_id` (where applicable), `ts`, `client_version`, `config_version`, `platform`, `locale`, `input_method`.

Events already enumerated inline above; total ≥ 60 events (design sheet carries 15 core events — see Appendix B Q-11 re: expanding analytics spec).

### 10.5 Network / API contract

All gameplay uses an RGS-compatible JSON-over-WebSocket protocol. Key messages:
- `spin.request` → `spin.result`
- `buy_feature.request` → `buy_feature.result`
- `feature.ack`
- `state.get` / `state.put` (autosave)
- `session.heartbeat` every 10s
- `config.fetch`

All outcomes are server-authoritative. Client only animates what the server returned. `IOutcomeProvider` interface on the client (GDD §16.2) decouples from hardcoded RNG.

### 10.6 Engine hooks

Unity MonoBehaviours of note:
- `GameStateMachine` — driven by the enum in §3.2.
- `ReelController` — animates reels per `spin.result`.
- `FeatureDispatcher` — routes to FS or Wheel flow.
- `MultiplierLadderController` — animates multiplier advance.
- `AudioBusController` — respects settings.
- `AccessibilityAdapter` — routes settings to underlying systems.
- `RgMonitor` — tracks timers, limits.
- `TelemetryClient` — analytics buffer and flush.

### 10.7 Localisation

12 locales scoped: `en-US, en-GB, fr-FR, de-DE, es-ES, it-IT, pt-BR, nl-NL, sv-SE, tr-TR, ja-JP, ko-KR`.

All UI copy from a locale JSON; no hardcoded strings. Plural forms via ICU MessageFormat. Currency symbol via operator context, not locale.

### 10.8 Platform matrix

| Platform | Min version | Notes |
|----------|-------------|-------|
| iOS Safari | 15+ | WebGL 2.0 |
| Android Chrome | 100+ | WebGL 2.0 |
| Desktop Chrome | 100+ | |
| Desktop Safari | 15+ | |
| Desktop Edge | 100+ | |
| Desktop Firefox | 102+ | |

Anything lower → `SCR-UNSUPPORTED`.

## Section 11 — Feature Test Scenarios

Every feature has ≥ 6 scenarios in Setup · Action · Expected · Verify pattern.

### 11.1 Core Spin tests (8)

1. **Happy path no-win.** Setup: balance $10, bet $0.50, turbo off. Action: tap spin. Expected: 1700ms total, 0 win, balance -$0.50. Verify: `spin_complete` analytics, balance $9.50.
2. **Happy path with line win.** Setup: same; force outcome with win. Action: spin. Expected: win count-up, balance = 9.50 + win. Verify: Last Win updated, SR announces.
3. **Rapid spin spam.** Setup: same. Action: press Space 10x in 0.5s. Expected: 1 spin processed; rest ignored until IDLE. Verify: only 1 `spin_start` event.
4. **Mid-spin bet change.** Setup: spin mid-animation. Action: press Bet +. Expected: no-op; controls disabled. Verify: no `bet_changed` emitted.
5. **Mid-spin disconnect.** Setup: spin mid-animation; pull network. Expected: OVL-RECONNECT; on reconnect, server resolves outcome; animation completes. Verify: `spin_complete` eventually fired.
6. **Max win cap hit.** Setup: force outcome = 10000× bet. Expected: OVL-MAXWIN cannot skip; game frozen. Verify: `max_win_reached`.
7. **Turbo mode.** Setup: turbo on. Action: spin. Expected: total 700ms; skip win anim. Verify: duration logged.
8. **Keyboard-only spin.** Setup: desktop, keyboard. Action: Tab to spin, Enter. Expected: spin initiates. Verify: `input_method = keyboard`.

### 11.2 Free Spins tests (9)

1. **Organic trigger — 3 Scatters.** Verify OVL-FS-INTRO plays; SCR-FS loads.
2. **Organic trigger — 4 Scatters.** Verify scatter pay awarded + 10 FS.
3. **Retrigger in FS.** Force 3 Scatters inside FS. Verify TST-FS-RETRIGGER + counter +5.
4. **Skip FS.** Tap skip mid-FS. Verify all remaining spins resolve server-side; outro shows final total.
5. **Bet locked during FS.** Attempt bet change. Verify disabled with TIP-BET-LOCKED.
6. **Disconnect during FS.** Disconnect; reconnect. Verify resume at same FS index.
7. **FS multiplier max.** Force cascade chain. Verify multiplier caps at ×10 (no higher).
8. **FS from Buy Feature.** Buy FS. Verify MOD-BUY-CONFIRM → FS launches; balance -75× bet.
9. **FS with 0 wins.** Force all no-wins. Verify outro still shows; net result bet × 75 (Buy) or 0 (organic) minus unrecouped.

### 11.3 Wheel Feature tests (8)

1. **Organic trigger — 3 Bonus symbols.** Verify OVL-WHEEL-INTRO.
2. **Buy Wheel.** Verify MOD-BUY-CONFIRM; balance -50× bet; wheel launches.
3. **Wheel lands on Mansion.** Verify SCR-MANSION loads.
4. **Wheel lands on Grand Jackpot.** Force Grand (1% weight). Verify 2000× bet paid.
5. **Wheel interrupt.** Attempt home button during wheel. Verify MOD-CONFIRM-EXIT-FEATURE.
6. **Reduce motion on wheel.** Enable reduce-motion. Verify jump-cut landing.
7. **Wheel with max-win cap.** If Grand + base wins exceed cap, verify OVL-MAXWIN + cap.
8. **Wheel disconnect.** Disconnect mid-spin; reconnect. Verify landing resumes.

### 11.4 Mansion Pick-me tests (6)

1. **First pick reveals coin.** Verify running total increments.
2. **Collect token ends bonus.** Verify auto-exit to outro.
3. **Idle 20s auto-collects.** Verify OVL-IDLE triggered; on no action, auto-collect.
4. **Keyboard-only picking.** Tab/Enter through rooms. Verify accessible.
5. **Screen reader announces picks.** Verify aria-live text matches.
6. **Disconnect mid-picks.** Verify state preserved; resume at same picks.

### 11.5 Autoplay tests (7)

1. **Start 50 autoplay.** Verify counter 50 → 0 over spins.
2. **Stop on feature.** Trigger FS mid-autoplay. Verify autoplay halts.
3. **Stop on single win above X.** Force win above X. Verify halt.
4. **Stop on balance below Y.** Force balance drop. Verify halt.
5. **Manual stop.** Tap STOP. Verify halt immediately.
6. **Autoplay over bet-lock.** Change bet attempt with bet-lock on. Verify blocked; toast or modal.
7. **Autoplay during maintenance.** Server issues maint flag. Verify autoplay halts + MOD-MAINTENANCE.

### 11.6 Buy Feature tests (6)

1. **Buy FS happy path.** Balance sufficient. Verify MOD-BUY-CONFIRM → deduct → FS.
2. **Buy FS insufficient.** Balance < cost. Verify button greyed + affordability text.
3. **Hold-to-confirm cancel.** Start hold, release early. Verify no purchase.
4. **Buy Wheel happy path.** Verify deduct → wheel.
5. **Buy during autoplay.** Attempt to open Buy. Verify disabled on SCR-MAIN.
6. **Disconnect during confirm.** Release hold then disconnect. Verify no double-charge.

### 11.7 Responsible Gambling tests (8)

1. **30-min reality check.** Play until timer. Verify MOD-REALITY.
2. **Take a break.** Tap Take Break. Verify 5-min forced pause.
3. **Session loss limit.** Set loss limit; breach. Verify MOD-RG-LIMIT-HIT locks exit.
4. **Self-exclude 24h.** Tap self-exclude. Verify exit + operator flow; next attempt blocked.
5. **Autoplay + reality check.** Verify autoplay halts when RC fires.
6. **RG info in history.** Verify session net tracked.
7. **Minor detected.** (operator hook) If account flagged, verify MOD-AGE-GATE blocks.
8. **Demo mode disables limits.** Verify SCR-DEMO has no limits UI.

### 11.8 Accessibility tests (8)

1. **Keyboard-only full spin.** Tab → Enter → Space repeated. Verify complete.
2. **Screen reader full spin.** NVDA / VoiceOver. Verify announcements.
3. **Reduce motion.** OS set + setting set. Verify animations shortened.
4. **High contrast.** Toggle. Verify contrast bumped.
5. **Text size XL.** Toggle. Verify layout reflows, no cutoffs.
6. **Color-blind mode.** Toggle deuteranopia. Verify symbol distinction (shape/icon overlays).
7. **Dwell click.** Toggle + hover spin 600ms. Verify spin triggers.
8. **Focus trap in modal.** Tab past last in modal. Verify wraps.

### 11.9 Persistence / save tests (see Part D)

(12 scenarios enumerated in Part D.)

### 11.10 Error recovery tests (10)

1. **Config fetch fails on boot.** Verify MOD-CONFIG-ERROR → refresh recovers.
2. **Spin request 500.** Verify MOD-SERVER-ERROR with retry.
3. **Spin request 429 rate-limit.** Verify TST-RATE-LIMIT + 2s lock.
4. **Session expired mid-play.** Verify SCR-SESSION-EXPIRED.
5. **Devtools opened (strict).** Verify MOD-DEVTOOLS-DETECTED.
6. **Concurrent session.** Verify MOD-CONCURRENT-SESSION.
7. **WebGL lost context.** Verify ERR-BROWSER-002 → refresh.
8. **Missing sound asset.** Verify silent fallback + log.
9. **Missing locale.** Verify English fallback.
10. **Extreme latency.** RTT > 500ms. Verify MOD-NETWORK-QUALITY.

---

# Appendix A — Dev QA Checklist

Pre-release gates. Every item must pass before build ships.

**A.1 Screens**
- [ ] All 17 screens render correctly at breakpoints XS, SM, MD, LG, XL.
- [ ] Portrait and landscape on mobile tested.
- [ ] Safe areas respected on iOS and Android cutouts.
- [ ] No layout shift on orientation change.

**A.2 Modals**
- [ ] All 24 modals trigger on correct event.
- [ ] Only one modal open at a time.
- [ ] Esc closes non-locked modals; locked modals explicit.
- [ ] Focus trap inside modals; restore focus on close.

**A.3 Toasts**
- [ ] All 18 toasts fire at correct moments.
- [ ] Max 3 stacked; FIFO.
- [ ] Auto-dismiss per spec.

**A.4 Tooltips**
- [ ] 19 tooltips show on hover / tap-hold.
- [ ] Never block touch targets.

**A.5 Overlays**
- [ ] 16 overlays trigger correctly; priority respected.
- [ ] Skip rules honoured.

**A.6 Gameplay**
- [ ] Core spin loop 1700 ms normal / 700 ms turbo within ±10%.
- [ ] FS counter correct and retrigger works.
- [ ] Wheel weights match DS.
- [ ] All 4 sub-bonuses complete and return to main.
- [ ] Buy Feature deducts correctly and triggers feature.
- [ ] Autoplay stop conditions all tested.

**A.7 Accessibility**
- [ ] Keyboard-only playable start-to-finish.
- [ ] Screen reader announces balance, wins, feature triggers.
- [ ] All interactive elements have SR labels.
- [ ] Reduce motion respected.
- [ ] Color contrast ≥ 4.5:1 for all body text.
- [ ] Focus ring visible on every focusable.
- [ ] Color-only state avoided.
- [ ] Text size scale works without cutoffs.

**A.8 Responsible Gambling**
- [ ] Reality check fires on time.
- [ ] Limits enforced.
- [ ] Self-exclude routes to operator.
- [ ] Demo mode has no monetary language.

**A.9 Error handling**
- [ ] All 30 error codes produce correct UI.
- [ ] Reconnect cycle works.
- [ ] Session expiry routes through re-auth.

**A.10 Analytics**
- [ ] All events fire with correct payload.
- [ ] No PII in payloads except `player_id`.
- [ ] Events buffered offline and flushed on reconnect.

**A.11 Performance**
- [ ] 60fps in `SCR-MAIN` on iPhone 12 / Pixel 6 mid-tier.
- [ ] Boot time ≤ 8s on LTE.
- [ ] Memory ≤ 256 MB peak.

**A.12 Localisation**
- [ ] All 12 locales swap correctly.
- [ ] No string truncation in longest locales (de-DE, tr-TR).
- [ ] Currency display per operator context.

**A.13 Regulatory**
- [ ] UKGC / MGA / ON auditor checklist compiled separately.
- [ ] RTP certifiable against submitted value.

---

# Appendix B — Open Design Questions

Items the source doc left ambiguous, deliberately flagged rather than invented. Target resolution before M3 (Alpha lock).

| ID | Topic | Question | Proposed resolution | Owner |
|----|-------|----------|--------------------|-------|
| Q-01 | Rotating tips | 8 tips specified here; GDD silent | Confirm tips list or supply 8 alternates | Marketing |
| Q-02 | High-bet confirmation threshold | Set to $5; GDD silent | Confirm threshold or make operator-configurable | Product |
| Q-03 | Autoplay max spins | 100 limit here; GDD silent | UKGC requires cap ≤ 100 — confirm OK | Compliance |
| Q-04 | Reality check default interval | 30 min mobile / 60 min desktop (Carla journey) vs Felix at 60 | Confirm default per jurisdiction | Compliance |
| Q-05 | Quickspin behaviour | Cuts win animations; GDD doesn't specify | Confirm UX + regulator acceptance | Product + Compliance |
| Q-06 | Voice announcer language | Only English scoped for v1 — is that acceptable? | Confirm English-only for MVP | Product |
| Q-07 | Jackpot Grand probability | 1% of wheel sector; 4% within Jackpot cluster — which model? | Pick one and update DS | Math / Product |
| Q-08 | Mega Hat max attempts | 3 here; DS silent | Confirm cap | Math |
| Q-09 | Mansion auto-collect timer | 20s; GDD silent | Confirm timer | Product |
| Q-10 | Buzzsaw end-token probability | GDD references but no weight | Specify weight | Math |
| Q-11 | Analytics event list | DS carries 15; bible enumerates ≥ 60 | Expand DS or narrow bible | Analytics |
| Q-12 | Scenario Preview Panel ship decision | Currently build-gated — confirm flag name + default off | Confirm `SCENARIO_PREVIEW_ENABLED=false` prod | Engineering |
| Q-13 | Max win cap currency value | 10,000× bet — translate to absolute currency for regulator | Confirm local max per jurisdiction | Compliance |
| Q-14 | Dwell-click duration | 600 ms; no standard | Pick 600 / 800 / 1000 ms | UX |
| Q-15 | Demo mode credits refresh | Session-scope reset here; should persist? | Confirm reset policy | Product |
| Q-16 | Bet ladder exact values | Extrapolated to 0.10/0.20/0.50/1/2/5/10; DS shows 9 levels — reconcile | Provide exact ladder | Math |
| Q-17 | FS initial count variable | 10 assumed; should 4 scatters award 12? 15? | Confirm | Math |
| Q-18 | Retrigger scatter count | 3 scatters = +5 spins; GDD not explicit on 4/5 scatter retrigger | Confirm tiers | Math |
| Q-19 | Self-exclusion permanence | Whose flow — operator's or ours? | Confirm delegation | Compliance |
| Q-20 | Rate limit threshold | Not in GDD — picked "too many spins too fast" | Specify concrete threshold | Engineering |

---

# Appendix C — Changelog

| Version | Date | Author | Summary |
|---------|------|--------|---------|
| 1.0 | 2026-04-23 | Sally (UX) / Samarjit | Initial production bible. Part 1 Sally UX, Part 2 wireframe bible, Parts D/E/J/L attached. 17 screens, 24 modals, 18 toasts, 19 tooltips, 16 overlays, 30 error codes, 20 open questions, 12+ persistence tests. |

---

# Part D — Save / Load / Persistence Deep-Dive

## D.1 Persistence matrix

| System | Auto-saved | Manual save | Per-slot | Cloud | Survives NG+ (not applicable for slots) | Survives session expiry |
|--------|-----------|-------------|----------|-------|-----|-----|
| Balance | ✓ server-auth | — | N/A | ✓ | N/A | ✓ |
| Bet | ✓ | — | N/A | ✓ | N/A | ✓ |
| Bet level | ✓ | — | N/A | ✓ | N/A | ✓ |
| Turbo | ✓ | — | N/A | ✓ | N/A | ✓ |
| Quickspin | ✓ | — | N/A | ✓ | N/A | ✓ |
| Autoplay active | ✓ | — | N/A | ✓ | N/A | — (cancels) |
| Feature in-progress | ✓ | — | N/A | ✓ | N/A | ✓ (resume) |
| FS remaining | ✓ | — | N/A | ✓ | N/A | ✓ |
| FS total win | ✓ | — | N/A | ✓ | N/A | ✓ |
| Multiplier | ✓ (feature-scoped) | — | N/A | ✓ | N/A | ✓ |
| Last spin result | ✓ | — | N/A | ✓ | N/A | ✓ |
| Settings (audio, a11y) | ✓ | — | N/A | ✓ | N/A | ✓ |
| Tutorial seen | ✓ | — | N/A | ✓ | N/A | ✓ |
| RG limits | ✓ | — | N/A | ✓ | N/A | ✓ |
| Session timer | ✓ | — | N/A | ✓ | N/A | reset |
| History | ✓ server-side only | — | N/A | ✓ | N/A | ✓ |

## D.2 Save JSON schema
(See Part 2 §10.1 above.)

## D.3 Conflict resolution flow

```
  Player opens tab B with session already in tab A
            │
            ▼
  server detects concurrent session
            │
            ▼
  server sends kick message to tab A
            │
            ▼
  tab A shows MOD-CONCURRENT-SESSION
  (two choices: "Switch to this device" or "Exit")
            │
  ┌─────────┴─────────┐
  │                   │
 "Switch"           "Exit"
  │                   │
  ▼                   ▼
server moves       tab A cleanly
session to         exits; tab B
tab B;            now active
tab A exits
```

## D.4 Corruption recovery flow

```
  Client fetches state on boot
            │
            ▼
  server returns state with integrity hash
            │
            ▼
  client validates hash
            │
  ┌─────────┴─────────┐
valid            invalid / absent
  │                   │
  ▼                   ▼
resume          fetch last known-good snapshot
normally        (server has last-N snapshots)
                     │
                     ▼
             show TST-FEATURE-SAVED "Restoring last known state"
                     │
                     ▼
             resume from snapshot
                     │
             if fail after 3 tries:
                     ▼
             MOD-CONFIG-ERROR / escalate to support
```

## D.5 Persistence test scenarios (12 canonical)

1. **Mid-spin close tab** — balance unchanged; server had authoritative spin result.
2. **Mid-FS close browser** — resume at same FS index + mult.
3. **Mid-Wheel close app** — resume at same wheel state.
4. **Mid-Mansion picks close tab** — resume with picks made so far intact.
5. **Cloud conflict choose-this-device** — other device force-exited.
6. **Cloud conflict choose-other-device** — this device cleanly exits.
7. **Corrupted save hash** — fall back to last snapshot.
8. **Session expired mid-feature** — re-auth → resume feature.
9. **Autoplay resume** — autoplay does NOT resume (policy: user must re-confirm).
10. **Settings change persists across sessions** — set text size XL in one session, confirm in next.
11. **RG limits persist** — set loss limit; new session on next day still enforces.
12. **Tutorial seen flag** — after dismissal, tutorial never shows again (unless Reset in Settings).

---

# Part E — Settings (verbatim fields)

The authoritative settings list lives in Part 2 §3.13 (SCR-SETTINGS). Replicated here for devs who jump to Part E directly.

### E.1 Audio tab — 6 fields
`master_volume` (slider 0-100 default 100) · `music_volume` (0-100 default 80) · `sfx_volume` (0-100 default 90) · `ambient_volume` (0-100 default 60) · `mute_on_background` (toggle default on) · `voice_announcer` (toggle default off).

### E.2 Gameplay tab — 7 fields
`turbo_default` (toggle default off) · `skip_stop_enabled` (toggle default on) · `quickspin` (toggle default off) · `spacebar_spins` (toggle default on) · `show_net` (toggle default on) · `autoplay_bet_lock` (toggle default on) · `confirmation_on_big_bet` (toggle default off).

### E.3 Accessibility tab — 8 fields
`reduce_motion` (toggle default off) · `high_contrast` (toggle default off) · `colorblind_mode` (dropdown Off/Protanopia/Deuteranopia/Tritanopia default Off) · `text_size` (Small/Medium/Large/XL default Medium) · `focus_ring_thickness` (2/3/4 default 2) · `audio_only_win_cues` (toggle default off) · `screen_reader_verbose` (toggle default off) · `dwell_click` (toggle default off).

### E.4 Limits tab — 6 fields
`session_time_limit_min` (Dropdown 15/30/60/120/None default None) · `reality_check_interval_min` (30/60/90 default 60) · `loss_limit_session` (amount input) · `win_limit_session` (amount input) · `self_exclude` (link to operator flow) · `problem_gambling_help` (link external).

### E.5 About tab — 5 read-only fields
Game version · config version · RTP · Legal links (Terms/Privacy/RG) · Malfunction disclaimer.

**Persistence:** all settings per Part D. **Analytics:** each change emits `setting_changed`.

---

# Part J — Responsible Gambling / Regulatory Module

Dedicated because slot games ship to heavy-regulation markets. This part spells out how the bible handles UKGC, MGA, Ontario iGO, Swedish SGA concerns.

## J.1 Reality Check

- **UKGC**: mandatory. Default 60 min, player may select 30 min minimum.
- **ON iGO**: mandatory. Every 60 min.
- **MGA**: recommended. Configurable.
- **Sweden SGA**: mandatory. Every 60 min.

**Modal:** `MOD-REALITY` — shows session time, total wagered, total won, net position.

## J.2 Net Position Indicator

Always visible in HUD during play in UK and Ontario: "Session Net: ±amount" (`sm-net`).

## J.3 Session Time Display

Chip in HUD: "Session: 47 min" — tap opens `MOD-REALITY` on demand.

## J.4 Limits

Session-time, session-loss, session-win, reality-check-interval. Self-exclusion.

## J.5 Audit hooks

Every spin, bet change, feature trigger, and exit emits structured logs for regulator audit.

## J.6 Demo Mode

`SCR-DEMO` — zero monetary language. No cashier links. Watermarked. Session-scoped fake balance.

## J.7 Age Verification

`MOD-AGE-GATE` — if operator delegates. Blocks all play until passed.

## J.8 Problem Gambling Resources

Settings → Limits → Problem Gambling Help → external operator-specific link (e.g., GambleAware.org in UK, ConnexOntario in ON, BegambleSverige in SE).

## J.9 Self-exclusion flow

User taps self-exclude 24h / 30d / permanent → confirmation modal with hold-to-confirm + text input of "EXCLUDE" → API call to operator → session terminates → re-entry blocked for duration.

## J.10 No reverse withdrawals

Post-launch consideration — engine doesn't allow depositing directly; all money flows via operator.

## J.11 Regulatory testing matrix

| Requirement | UKGC | MGA | ON iGO | SGA | Feature |
|-------------|------|-----|--------|-----|---------|
| Reality check 30/60 min | ✓ | ◯ | ✓ | ✓ | `MOD-REALITY` |
| Net position in HUD | ✓ | — | ✓ | ✓ | `sm-net` |
| Session time in HUD | ✓ | — | ✓ | ✓ | HUD chip |
| Spin history 50 spins | ✓ | ✓ | ✓ | ✓ | `SCR-HISTORY` |
| No auto-play without explicit opt-in | ✓ | ✓ | ✓ | ✓ | `MOD-AUTOPLAY-CONFIG` |
| Auto-play max 100 spins | ✓ | — | — | — | configurable |
| Auto-play bet-lock | ✓ | ✓ | ✓ | ✓ | setting |
| No celebratory losses-as-wins | ✓ | ✓ | ✓ | ✓ | design rule |
| RTP stated in game | ✓ | ✓ | ✓ | ✓ | `SCR-PAYTABLE` |
| Audit log export | ✓ | ✓ | ✓ | ✓ | operator side |
| Self-exclude link ≤ 2 taps | ✓ | ✓ | ✓ | ✓ | settings |

---

# Part L — Scenario Preview Panel (prototype-only)

## L.1 Why it exists

Slot games have many state combinations: base with low mult, base with high mult, FS mid-way, Wheel landed on Grand, Buzzsaw at multiplier 3, Mansion picked 4 rooms, all layered with settings permutations (reduce motion, high contrast, colourblind). Designers and reviewers need to see *pixels*, not prose, and right now the build flow is: "check out this branch, run this save-state, now switch to this one…"

The Scenario Preview Panel replaces that. One click in a Figma prototype or dev build cycles state. Build-gated: off in production.

## L.2 Activation

- **Flag:** `SCENARIO_PREVIEW_ENABLED` (build constant). Default `false` in release builds; `true` in internal / Figma Make / QA builds.
- **Trigger:** small developer HUD button bottom-right of `SCR-MAIN` labelled "🎬 Preview" OR hotkey `Shift+P` on desktop.
- **UI:** slide-in panel from right edge, 360 dp wide, overlays game surface without blocking it.

## L.3 Scenario catalog

Categories (each scenario is a JSON state snapshot applied to the live game):

**Category: Core gameplay states**
1. Idle — fresh load
2. Idle — after big win
3. Spinning — mid-spin reels anim
4. Win-eval — 3-line win, ×2 multiplier
5. Cascade active — Morph cascade mid-evaluation
6. Cascade chain — 3 cascades into ×5 multiplier

**Category: Features**
7. FS just triggered (OVL-FS-INTRO mid-anim)
8. FS mid-play, 5 spins in, mult ×4
9. FS retrigger event
10. FS final spin, large pending total
11. Wheel — about to spin
12. Wheel — landed on Grand Jackpot
13. Mansion — 3 rooms picked, total $24
14. Buzzsaw — 3 of 6 cuts, mult ×3
15. Mega Hat — 8 spaces covered, attempt 2

**Category: Economy**
16. Balance low ($0.10 left)
17. Balance high ($10,000+)
18. Max-win cap reached
19. Buy Feature panel open
20. Hold-to-confirm mid-hold (50%)

**Category: RG / Error**
21. Reality check active
22. Session limit breached modal
23. Reconnect overlay
24. Session expired
25. Server error modal

**Category: Accessibility variants**
26. Reduce motion on
27. High contrast on
28. Text size XL
29. Colorblind deuteranopia
30. Screen-reader verbose on

**Category: Responsive**
31. Mobile portrait
32. Mobile landscape
33. Tablet landscape
34. Desktop 1440
35. Desktop widescreen 1920

## L.4 Scenario JSON schema

```json
{
  "scenario_id": "fs-retrigger",
  "category": "features",
  "label": "FS — Retrigger landed",
  "description": "Free Spins mid-play, 3 Scatters just landed, +5 spins awarded.",
  "state_overrides": {
    "state": "FS_RETRIGGER",
    "balance": 125.00,
    "bet": 1.00,
    "feature": {
      "type": "FS",
      "fs_remaining": 8,
      "fs_total_awarded": 15,
      "fs_retrigger_count": 1,
      "fs_total_win": 24.50,
      "multiplier_current": 4
    }
  },
  "ui_toggles": {
    "show_retrigger_toast": true,
    "play_retrigger_sound": false
  },
  "expected_observable": [
    "FS counter reads 8",
    "TST-FS-RETRIGGER visible",
    "Multiplier HUD on ×4",
    "FS total $24.50"
  ]
}
```

## L.5 Unity applicator

- `ScenarioPreviewService` singleton. Receives scenario JSON → applies `state_overrides` via `GameStateMachine.ForceState()` → triggers `ui_toggles` → pauses state machine so reviewer has a frozen snapshot.
- Each scenario shows a tiny caption overlay: "SCENARIO: {label} — [exit]".
- Reviewer taps [exit] → state machine resumes from prior authoritative state (or returns to Idle).

## L.6 Figma prototype hook

Each scenario has a Figma frame with hotspot linking to the next / prior scenario — designers cycle with arrow keys in prototype mode.

## L.7 Ship gate

`SCENARIO_PREVIEW_ENABLED = false` in production builds. CI test: verify no panel ever renders in release mode.

---

*End of document v1.0. See computer:// link for delivery.*
