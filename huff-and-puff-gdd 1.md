# Huff and Puff — Game Design Document

**Version:** 1.0 | **Date:** April 2026 | **Status:** Draft — Approved for Development

**Project Code:** E_2387 — Slot Game

**Platform:** WebGL (Browser-based) | **Engine:** Unity | **Orientation:** Landscape | **Art Style:** Glossy Cartoon Casino — 2D

---

## Section 1: Executive Summary

### 1.1 Game Overview

| Field | Detail |
|---|---|
| Title | Huff and Puff |
| Genre | Video Slot / Cascading Morph Slot |
| Platform | WebGL (Chrome, Edge, Firefox, Safari — desktop + touch) |
| Engine | Unity (LTS 2022.3+, WebGL Build Module) |
| Orientation | Landscape |
| Art Style | Glossy Cartoon Casino — 2D |
| Grid | 3 rows × 5 reels |
| Volatility Profile | Medium–High (escalating multipliers + multi-tier jackpot) |
| Target RTP | TBD by math model — recommended range 94%–96.5% for demo |

**Concept Summary:** Huff and Puff is a cascading morph slot game built on a 3×5 reel grid. Winning symbols morph into new symbols, creating chain reactions with escalating multipliers (up to ×5 in base, ×10 in Free Spins). The game features Golden Symbols that can burst into adjacent Wilds, a Scatter-triggered Free Spins mode with boosted multipliers, and a Wheel Feature offering four distinct bonus experiences — Jackpot tiers, Mansion Bonus, Buzzsaw Bonus, and Mega Hat Bonus. A Buy Feature allows instant access to Free Spins or the Wheel Feature.

### 1.2 Design Pillars

**Pillar 1 — Every Spin Has Comeback Potential.** The morph chain + escalating multiplier system means even a modest initial win can snowball into a significant payout. Players should always feel "one more chain step away" from a big hit.

**Pillar 2 — Visual Spectacle on Every Win.** Morphing symbols, bursting wilds, and cascading fills create a continuous animation show. Wins should feel kinetic and alive — not just a number ticking up.

**Pillar 3 — Layered Depth, Instant Clarity.** The base spin-and-win loop must be understandable in 10 seconds. The morph chains, golden symbols, and bonus features add depth for returning players without creating confusion for first-timers.

**Pillar 4 — Feature Variety Sustains Sessions.** Four distinct Wheel bonuses (Jackpot, Mansion, Buzzsaw, Mega Hat) plus Free Spins ensure long sessions never feel repetitive.

**Conflict Resolution:** If Pillars 2 and 3 conflict (e.g., a spectacular animation that confuses the player), Pillar 3 wins — clarity always trumps spectacle.

### 1.3 Target Audience & Platform

**Primary Audience:** Casual-to-mid-core slot game players aged 25–45 who enjoy feature-rich video slots with cascading/tumble mechanics. Players familiar with titles like Big Bad Wolf, Reactoonz, or Sweet Bonanza.

**Secondary Audience:** Demo/showcase audiences evaluating the game for potential real-money or social casino deployment.

**Platform:** WebGL browser-based. Desktop browsers (Chrome, Edge, Firefox, Safari) with full touch-screen support via Pointer Events API. Mouse + touch input parity. No real-money integration — demo economy only.

### 1.4 Art Direction Summary

| Aspect | Direction |
|---|---|
| Style | Glossy Cartoon Casino — vibrant, saturated, clean outlines |
| Type | 2D sprites and UI, particle effects for wins and features |
| Character Symbols | 4 themed characters with custom 2–3 second win animations |
| Basic Symbols | 8 standard slot items with glow/burst/pop animations |
| Background | Themed environment with integrated 3×5 reel holder, animated reel rolling |
| Asset Production | Primarily AI-generated with manual artist polish |

### 1.5 Feature Scope

| Status | Features |
|---|---|
| In Scope | Reel Engine (3×5), Symbol Evaluation, Morphing Symbols with chain multipliers, Golden Symbols, Bursting Wild, Scatter + Free Spins (10 spins), Wheel Feature (Jackpot/Mansion/Buzzsaw/Mega Hat), Buy Feature, Bet Controls, Autoplay, Quick Spin, Paytable UI, Settings (SFX/Music), Demo Economy, Analytics (15 events), Win Display & Balance Tracking |
| Out of Scope | Real-money integration, server-authoritative RNG, backend/online features, external website integration, user tracking system configuration, real-money compliance/certification |
| Future Consideration | Server-side RNG for live deployment, real-money economy, tournament/leaderboard mode, reskin pipeline (Mo' Mummy confirmed as 2nd game — art-only reskin) |

---

## Section 2: Core Gameplay Loop

### 2.1 Session Flow

Launch → Set Bet → Spin (deduct bet) → Reel Stop & Evaluate → Win Found? If yes: Morph Chain (morph → fill → re-evaluate, advancing multiplier each step) → Chain Ends → Check Feature Triggers (Scatter → Free Spins, Wheel trigger) → Run Feature if triggered → Credit Winnings → Update Balance → Ready for Next Spin. If no win: skip directly to Feature Check.

### 2.2 Game State Machine

| State | Description | Valid Transitions |
|---|---|---|
| IDLE | Awaiting player input. Bet adjustment allowed. | → SPINNING, → BUY_CONFIRM |
| SPINNING | Reels in motion. Controls locked except Quick Spin. | → EVALUATING |
| EVALUATING | Win detection algorithm runs across all lines/ways. | → MORPH_CHAIN (if win), → FEATURE_CHECK (if no win) |
| MORPH_CHAIN | Winning symbols morph. New symbols fill. Multiplier advances. | → MORPH_CHAIN (new win), → FEATURE_CHECK (chain ends) |
| FEATURE_CHECK | Check for Scatter trigger, Wheel trigger. | → FREE_SPINS, → WHEEL_FEATURE, → WIN_PRESENTATION |
| FREE_SPINS | 10 Free Spins session with boosted multipliers. | → WHEEL_FEATURE, → WIN_PRESENTATION |
| WHEEL_FEATURE | Wheel spin → resolve bonus. | → WIN_PRESENTATION |
| BUY_CONFIRM | Confirmation dialog for Buy Feature. | → FREE_SPINS, → WHEEL_FEATURE, → IDLE (cancel) |
| WIN_PRESENTATION | Display total win, animate, credit balance. | → IDLE |

### 2.3 State Transition Table

| From State | Trigger Event | To State | Actions on Transition |
|---|---|---|---|
| IDLE | Player taps Spin | SPINNING | Deduct bet, disable controls, start reel animation |
| IDLE | Autoplay tick | SPINNING | Same as Spin, decrement autoplay counter |
| IDLE | Player taps Buy | BUY_CONFIRM | Show confirmation dialog with cost |
| BUY_CONFIRM | Confirm | FREE_SPINS or WHEEL | Deduct buy cost, enter feature |
| BUY_CONFIRM | Cancel | IDLE | Close dialog, re-enable controls |
| SPINNING | All reels stopped | EVALUATING | Lock reels, run win evaluation |
| EVALUATING | Win(s) detected | MORPH_CHAIN | Highlight wins, set multiplier, start morph |
| EVALUATING | No win | FEATURE_CHECK | Skip to feature check |
| MORPH_CHAIN | New win after morph | MORPH_CHAIN | Advance multiplier, accumulate win |
| MORPH_CHAIN | No win after morph | FEATURE_CHECK | Finalize chain total |
| FEATURE_CHECK | 3+ Scatters | FREE_SPINS | Initialize 10 free spins |
| FEATURE_CHECK | Wheel trigger | WHEEL_FEATURE | Load wheel UI |
| FEATURE_CHECK | No feature | WIN_PRESENTATION | Display results |
| FREE_SPINS | All spins done | WIN_PRESENTATION | Sum total, show accumulated win |
| FREE_SPINS | Retrigger | FREE_SPINS | Add spins to remaining count |
| WHEEL_FEATURE | Bonus resolved | WIN_PRESENTATION | Credit bonus winnings |
| WIN_PRESENTATION | Animation complete | IDLE | Update balance, re-enable controls |

### 2.4 Session Pacing

| Phase | Target Duration | Quick Spin |
|---|---|---|
| Reel Spin | 1.5–2.0s | 0.4–0.6s |
| Win Evaluation Visual | 0.3–0.5s | 0.15s |
| Single Morph Step | 0.8–1.2s | 0.4–0.6s |
| Full Morph Chain (avg 2–3 steps) | 2.5–4.0s | 1.0–1.5s |
| Feature Trigger Fanfare | 1.0–1.5s | 0.5s |
| Win Presentation (normal) | 0.5–1.0s | 0.3s |
| Win Presentation (Big Win) | 3.0–5.0s (skippable) | 1.5s |
| Total Non-Feature Spin Cycle | ~3–6s | ~1.5–3s |

---

## Section 3: Reel Engine

### 3.1 Grid Layout

Fixed 3-row × 5-reel grid. Each cell holds exactly one symbol at rest. Cell reference: grid[row][reel], zero-indexed. Total visible cells: 15. Each reel renders 1 buffer symbol above and below during spin animation for continuity.

### 3.2 Reel Strip Composition

Each reel has an independent virtual reel strip — a looping symbol array. Strip length and symbol distribution control hit frequency and RTP.

**Symbol Categories:**

| ID Range | Category | Strip Frequency |
|---|---|---|
| S01–S08 | Basic Items (8 types, Low Pay) | ~8–12 per reel |
| C01–C04 | Character Symbols (4 types, High Pay) | ~3–6 per reel |
| W01 | Wild Symbol (Primary) | ~1–3 per reel |
| W02 | Golden Wild / Bursting Wild | ~0–2 per reel (reel-restricted) |
| SC01 | Scatter (Free Games) | ~1–2 per reel |
| G01 | Golden Symbol (modifier) | ~1–3 per reel (reel-restricted) |

All reel strips are defined in `reel_config.json`, not hardcoded. Base Game and Free Spins use different strip configurations. Strip lengths can differ between reels (typical: 50–80 symbols).

### 3.3 Spin Mechanics

Each reel spins independently with staggered stop timing (50ms stagger between reels). Spin lifecycle per reel: IDLE → ACCELERATE (0.2–0.3s, ease-in) → FULL_SPEED (0.4–0.8s, linear) → DECELERATE (0.25–0.35s, ease-out cubic) → LAND (snap to target) → SETTLE (0.08–0.12s, overshoot bounce) → LOCKED.

Quick Spin skips ACCELERATE and FULL_SPEED. 30ms stagger. Total: ~0.4–0.6s.

### 3.4 RNG — Reel Stop Selection

The outcome is determined BEFORE reels start moving. Animation is cosmetic.

**Algorithm:** For each reel (0–4), generate `stopIndex = RNG.nextInt(0, stripLength-1)`. Visible symbols: Row 0 = strip[(stopIndex-1) mod length], Row 1 = strip[stopIndex], Row 2 = strip[(stopIndex+1) mod length]. Result: 3×5 grid fully determined. Exactly 5 RNG calls per spin.

**PRNG:** Xorshift128+ (fast, good distribution, deterministic for replay). Uniform random over strip indices — symbol frequency controlled entirely by strip composition. Future server deployment swaps in `ServerOutcomeProvider` behind `IOutcomeProvider` interface.

### 3.5 Anticipation Logic

Visual-only system — does not influence outcomes. Triggers when partial patterns are detected on stopped reels while remaining reels still spin. Affects animation speed and audio of remaining reels. Never alters RNG results.

---

## Section 4: Symbol System & Paytable

### 4.1 Symbol Inventory

| ID | Symbol | Category | Win Animation |
|---|---|---|---|
| S01–S08 | Basic Items (10, J, Q, K, A, Gem Blue, Gem Green, Gem Red) | Low Pay | Glow + Pop/Burst |
| C01 | Character 1 (Pig — Straw) | High Pay | Custom 2–3s animation + particles |
| C02 | Character 2 (Pig — Sticks) | High Pay | Custom 2–3s animation + particles |
| C03 | Character 3 (Pig — Bricks) | High Pay | Custom 2–3s animation + particles |
| C04 | Character 4 (Wolf) | Premium Pay | Custom 2–3s animation + particles |
| W01 | Wild Symbol (Standard) | Wild | Glow + Burst + Expand pulse |
| W02 | Wild Symbol (Bursting/Golden Wild) | Wild + Special | Burst explosion to adjacent cells |
| SC01 | Scatter (Free Games) | Scatter | Screen flash + audio sting |
| G01 | Golden Symbol | Special (modifier) | Golden pulse + conversion animation |

Total unique symbol IDs: 16.

### 4.2 Paytable Values

All payouts as multipliers of total bet. Loaded from `paytable_config.json`.

| Symbol | ×3 | ×4 | ×5 |
|---|---|---|---|
| C04 (Wolf) | 2.0× | 5.0× | 25.0× |
| C03 (Pig — Bricks) | 1.5× | 3.0× | 15.0× |
| C02 (Pig — Sticks) | 1.0× | 2.5× | 10.0× |
| C01 (Pig — Straw) | 0.8× | 2.0× | 7.5× |
| S08 (Gem Red) | 0.5× | 1.5× | 5.0× |
| S07 (Gem Green) | 0.4× | 1.2× | 4.0× |
| S06 (Gem Blue) | 0.3× | 1.0× | 3.0× |
| S05 (A) | 0.2× | 0.8× | 2.5× |
| S04 (K) | 0.2× | 0.7× | 2.0× |
| S03 (Q) | 0.15× | 0.5× | 1.5× |
| S02 (J) | 0.15× | 0.5× | 1.5× |
| S01 (10) | 0.1× | 0.4× | 1.0× |

**Scatter Pays (count anywhere):** 3 = 2.0× + 10 Free Spins, 4 = 10.0× + 10 Free Spins, 5 = 50.0× + 10 Free Spins.

Wild symbols (W01, W02) have no standalone payout — substitution only.

### 4.3 Payline Definition

10 fixed paylines, all always active. Wins pay left-to-right on adjacent reels. Highest win per line only. Wins on different lines are additive.

**Payline patterns (row indices per reel):**

| Line | R1 | R2 | R3 | R4 | R5 |
|---|---|---|---|---|---|
| 1 | 1 | 1 | 1 | 1 | 1 |
| 2 | 0 | 0 | 0 | 0 | 0 |
| 3 | 2 | 2 | 2 | 2 | 2 |
| 4 | 0 | 1 | 2 | 1 | 0 |
| 5 | 2 | 1 | 0 | 1 | 2 |
| 6 | 0 | 0 | 1 | 2 | 2 |
| 7 | 2 | 2 | 1 | 0 | 0 |
| 8 | 1 | 0 | 0 | 0 | 1 |
| 9 | 1 | 2 | 2 | 2 | 1 |
| 10 | 0 | 1 | 0 | 1 | 0 |

### 4.4 Win Evaluation Algorithm

For each payline: count consecutive matching symbols from left (Reel 0). Wild (W01, W02) substitutes for all paying symbols but NOT Scatter (SC01) or Golden (G01). If match count ≥ 3 and paytable entry exists, record win. Keep best win per line. Scatter evaluated independently by count anywhere on grid.

### 4.5 Win Priority Rules

1. Scatter wins always paid regardless of other wins.
2. On a single payline, only highest-value interpretation counts.
3. A symbol can contribute to multiple payline wins simultaneously.
4. Wild adopts identity producing highest payout on that line.
5. Golden conversion happens AFTER standard evaluation.
6. All-wilds payline pays as highest-paying symbol (C04).
7. If Scatter + Wheel trigger overlap, features queue: Free Spins first, then Wheel.

---

## Section 5: Symbol Evaluation System — Special Symbols

### 5.1 Special Symbol Registry

| ID | Type | Behavior | Evaluation Phase |
|---|---|---|---|
| W01 | Substitution | Replaces any paying symbol for win calc | During standard eval |
| W02 | Substitution + Trigger | Substitutes + triggers Bursting Wild if part of win | Standard eval + post-eval burst |
| SC01 | Count-based | Pays anywhere, triggers Free Spins at 3+ | Independent scatter eval |
| G01 | Conversion | Golden overlay on base symbol, converts to W02 when winning | Post-eval conversion |
| M01 | System (internal) | Flags cells for morphing after win | Post-win marking |

### 5.2 Special Symbol Behaviors

**W01 (Standard Wild):** Pure substitution for S01–S08, C01–C04. No standalone pay. Does NOT trigger burst. Morphed when part of a win.

**W02 (Golden Wild / Bursting Wild):** Substitutes like W01. When part of any win, triggers Bursting Wild feature (Section 9). Reel-restricted. Multiple W02 in same evaluation burst independently, left-to-right. W02 is morphed after burst resolves.

**SC01 (Scatter):** Count-based, position-independent. Cannot be substituted by Wilds. Pays AND triggers Free Spins simultaneously. NEVER morphed. NEVER overwritten by burst. Cannot receive Golden modifier.

**G01 (Golden Symbol):** Modifier on any base paying symbol (S01–S08, C01–C04). During eval, treated as its base symbol. After eval, if part of a win, converts to W02 which then bursts. Win amount uses original base symbol value before conversion.

**M01 (Morph Marker):** Internal system flag. Not player-facing. Applied to all winning positions (except SC01) after evaluation completes.

### 5.3 Evaluation Order of Operations

This is the canonical execution order for every spin and morph chain step:

1. **Standard Win Evaluation** — For each payline, check left-to-right matches with Wild substitution. Record best win per payline.
2. **Scatter Evaluation** — Count SC01 anywhere on grid. If 3+, record scatter win and set Free Spins trigger.
3. **Bursting Wild Resolution** — If any W02 in winning positions, execute burst (Section 9). Resolve left-to-right.
4. **Golden Symbol Handler** — If any Golden-flagged symbol in winning positions, convert to W02 and execute additional burst.
5. **Morph Target Marking** — All winning positions (except SC01) flagged M01.
6. **Accumulate Win** — stepWin = sum of all wins × current multiplier. Advance multiplier.
7. **Morph Execution** — Remove M01 cells, fill with new symbols (Section 7).
8. **Re-Evaluate** — Return to Step 1 with new grid. If wins found, chain continues. If not, chain ends.
9. **Chain End** — Reset multiplier, check feature triggers, proceed to features or win presentation.

Maximum chain depth safety cap: 50 iterations.

---

## Section 6: Item Replace System (Cascading Wins)

### 6.1 Fill Model: Morph-in-Place

Huff and Puff uses morph-in-place, NOT gravity-drop. Winning symbols dissolve at their current position. New symbols appear in the SAME cell. Non-winning symbols never move. Grid layout is always stable.

### 6.2 Chain Reaction Rules

A chain occurs when morphed symbols create new winning combinations. Each chain step: evaluate grid → record wins → apply multiplier → resolve specials → mark morph targets → execute morph → re-evaluate. Chain ends when morph produces no new wins. No artificial cap on chain length (50-step safety cap for edge cases).

Features triggered during a chain are queued until chain completes. Queue order: Scatter (Free Spins) → Wheel.

### 6.3 Board State Preservation

Non-winning standard symbols persist unchanged. SC01 (Scatter) always persists. Non-winning Wilds and Golden Symbols persist. Burst-created symbols persist until they participate in a win. All morphs are logged in a MorphRecord array for replay/debugging.

### 6.4 Animation Sequencing

Per chain step (~1.2–1.5s normal, ~0.5–0.7s Quick Spin): Win Highlight (0.4–0.6s) → Morph Out (0.25–0.35s) → Morph In (0.25–0.35s) → Settle (0.15–0.25s) → Re-Evaluate. All morph-outs simultaneous, all morph-ins simultaneous. Win counter updates at each step with count-up animation.

---

## Section 7: Morphing Symbols System

### 7.1 Morph Trigger

Morphing activates whenever evaluation detects winning combinations. Every symbol in a win is flagged for morphing except SC01. Minimum: 3 cells. Maximum: 15 cells. Wilds, Golden Symbols, and burst-created symbols all morph when they participate in wins.

### 7.2 Morph Symbol Selection

Replacement symbols are selected via weighted random from a morph pool — separate from reel strips. Each game mode has its own pool.

**Base Game Morph Pool (template weights):** S01: 15, S02: 14, S03: 13, S04: 12, S05: 11, S06: 10, S07: 9, S08: 8, C01: 7, C02: 6, C03: 5, C04: 4, W01: 3, W02: 2, SC01: 5. Total: 124.

**Free Spins Morph Pool:** Higher-pay symbols boosted, wilds boosted, scatter boosted for retrigger potential. S01–S05: 8 each, S06–S08: 8 each, C01–C04: 7 each, W01: 5, W02: 4, SC01: 9. Total: 110.

RNG calls per morph step: 1 per morphed cell (symbol selection) + 1 conditional per eligible cell (Golden chance).

### 7.3 Multiplier Sequence — Base Game

×1 → ×2 → ×3 → ×5. Each chain step with a payline win advances multiplier by one index. Caps at ×5 for all remaining steps.

### 7.4 Multiplier Sequence — Free Spins

×2 → ×4 → ×6 → ×10. Same advancement logic. Caps at ×10. This is the primary mathematical driver of Free Spins value — a 3-step chain in Free Spins pays roughly 2× the same chain in base game.

### 7.5 Multiplier Reset Conditions

Resets on: chain end, new spin start, mode change (Base↔Free Spins). Never carried between spins. Wheel Feature has its own payout logic — multiplier not applicable.

### 7.6 Win Calculation Formulas

**Single step:** stepWin = stepBaseWin × multiplier[min(chainStepIndex, 3)]

**Full chain:** chainTotal = Σ(stepBaseWin[n] × multiplier[min(n, 3)]) for all winning steps

**Full spin:** spinPayout = chainTotal + scatterWin + featureWinnings

**Win Tiers:** Standard (< 5× bet), Nice (5–14.99×), Big (15–29.99×), Mega (30–49.99×), Super (50×+). Configured in `win_tiers_config.json`.

---

## Section 8: Golden Symbols Handler

### 8.1 Appearance Rules

Golden is a modifier on standard paying symbols (S01–S08, C01–C04). Appears via two pathways: reel stop (secondary RNG pass per eligible cell) and morph fill (Golden chance roll on new symbol).

**Base Game:** Eligible on Reels 2, 3, 4. Chance: 4–5% per eligible cell.

**Free Spins:** Eligible on all 5 reels. Chance: 3–7% per cell. Wider spread, higher rates.

Cannot apply to SC01, W01, or W02.

### 8.2 Conversion Logic

When a Golden Symbol participates in a win: (1) win is calculated using base symbol value, (2) Golden converts to W02, (3) W02 triggers Bursting Wild. Multiple Goldens in same win each convert independently.

### 8.3 Interaction with Morph System

Pipeline: Win Evaluation (Golden as base symbol) → Burst Resolution (natural W02) → Golden Conversion (Golden → W02, triggers additional bursts) → Morph Marking (all winning positions including converted) → Morph Execution → Re-Evaluate. Non-winning Golden Symbols persist with their golden flag intact.

### 8.4 Visual Feedback

Idle: base symbol + golden shimmer overlay, slow pulse, orbiting sparkles. Conversion moment: 0.5s transformation — overlay intensifies, symbol shrinks, burst of golden particles, W02 expands into position. Audio: ascending chime glissando + metallic transformation SFX.

---

## Section 9: Bursting Wild Feature

### 9.1 Trigger Condition

Activates when W02 is part of any winning combination. Two pathways: natural W02 on reel strip, or Golden conversion to W02. Multiple W02 resolve sequentially left-to-right. W02 created by burst is prevented (burst places W01, not W02).

### 9.2 Burst Count

Determined by weighted random. Base Game: 1 cell (40%), 2 cells (30%), 3 cells (20%), 4 cells (10%). Free Spins: 1 (25%), 2 (30%), 3 (25%), 4 (20%) — boosted higher counts.

### 9.3 Adjacency & Position Selection

All 8 surrounding cells (horizontal, vertical, diagonal). Cells outside grid boundary excluded. Cells occupied by SC01 excluded. Cells already claimed by prior burst excluded. Burst count clamped to available candidates. Positions selected by random without replacement.

### 9.4 Burst Symbol

Burst places W01 (Standard Wild) in target cells. Not W02 — prevents recursive burst chains. Configured in `burst_config.json`. Burst-created Wilds persist until they participate in a win, then morph normally.

### 9.5 Edge Cases

Corner positions have 3 adjacent cells max. All-scatter adjacency causes burst to fizzle (0 targets). Adjacent un-burst W02 is overwritten by W01 (loses W02 identity). Burst-created Wilds contribute to wins on re-evaluation — this is the feature's primary value.

---

## Section 10: Multiplier Manager

### 10.1 State Machine

Dual sequence indexed state machine. Base Game: [×1, ×2, ×3, ×5]. Free Spins: [×2, ×4, ×6, ×10]. Advances one index per chain step with payline win. Caps at last index. Resets on chain end or new spin.

### 10.2 Escalation Timing

Multiplier applied to current step's win BEFORE advancement. Advancement happens AFTER win calculation, BEFORE next morph. Scatter-only wins do NOT advance multiplier. Multiple payline wins in same step = single advancement.

### 10.3 Cap Behavior

At maximum index, value stays for all remaining chain steps. No further escalation, no overflow. Extended chains at cap still accumulate significant wins due to the high multiplier.

### 10.4 Expected Multiplier Contribution

| Chain Length | Base Avg Multiplier | Free Spins Avg Multiplier |
|---|---|---|
| 1 step | 1.0 | 2.0 |
| 2 steps | 1.5 | 3.0 |
| 3 steps | 2.0 | 4.0 |
| 4 steps | 2.75 | 5.5 |
| 5 steps | 3.2 | 6.4 |
| N steps (N≥4) | Converges toward 5.0 | Converges toward 10.0 |

---

## Section 11: Scatter & Free Spins Mechanic

### 11.1 Scatter Rules

SC01 evaluated by count anywhere on 3×5 grid. Wild does NOT substitute for Scatter. Position-independent. Morph-immune, burst-immune, Golden-immune. Can appear on all reels.

**Scatter Payout:** 3 = 2.0× total bet + 10 FS, 4 = 10.0× + 10 FS, 5 = 50.0× + 10 FS. Scatter payout credited BEFORE Free Spins session begins.

### 11.2 Free Spins Session

10 automatic spins using boosted parameters. Bet locked at triggering spin's level.

**Modified Parameters During Free Spins:**

| Parameter | Base Game | Free Spins |
|---|---|---|
| Reel Strips | baseGame config | freeSpins config (higher-value density) |
| Morph Pool | Base weights | Boosted high-pay, wilds, scatters |
| Multiplier Sequence | ×1→×2→×3→×5 | ×2→×4→×6→×10 |
| Golden Chance | 4–5% on Reels 2–4 | 3–7% on all reels |
| Golden Eligible Reels | Reels 2, 3, 4 | All 5 reels |
| Burst Count Weights | 40/30/20/10 | 25/30/25/20 |

Payline definitions, paytable values, grid size, evaluation algorithm, burst symbol — all unchanged.

### 11.3 Retrigger Rules

3+ Scatters during Free Spins add spins: 3 = +5, 4 = +8, 5 = +10. No retrigger limit (100-spin safety cap per session). Scatter payout credited immediately on retrigger.

### 11.4 Free Spins RNG

Same PRNG instance as base game — continuous sequence, no reseeding. Same algorithm for all randomization.

### 11.5 Win Accumulation

Running total counter visible throughout session. Each spin win adds to running total. End sequence: final total count-up, tier-appropriate celebration, total credited to balance, transition back to base game.

---

## Section 12: Wheel Feature

### 12.1 Trigger

Natural trigger: RNG-based check after every chain resolution. Base Game: 0.5% chance per spin. Free Spins: 1.0%. Buy Feature: instant access (Section 13). Trigger rates are templates — tuned by math model.

### 12.2 Wheel Segments

| Segment | Bonus Mode | Probability |
|---|---|---|
| WH_JP | Jackpot | 30% |
| WH_MN | Mansion Bonus | 25% |
| WH_BZ | Buzzsaw Bonus | 25% |
| WH_MH | Mega Hat Bonus | 20% |

Outcome determined by RNG before spin animation. 12 total segments on wheel, color-coded per bonus.

### 12.3 Wheel Animation

4–7 seconds total: pre-spin buildup (0.5s), acceleration (0.8s), full speed (1.5–3s), deceleration (1.5–2.5s), landing with bounce (0.3s), result reveal (1.0s). Tick audio as pointer passes segments, slowing with deceleration.

### 12.4 Jackpot Feature

Four tiers: Grand (500× bet), Major (100×), Minor (25×, bet-level scaled), Mini (10×, bet-level scaled). Tier selection by weighted random: Mini 50%, Minor 30%, Major 15%, Grand 5%.

Mini and Minor scale with bet level: minimum bet = 1.0× base, maximum bet = 3.0× base. Grand and Major are fixed multipliers.

Reveal animation: four tier icons displayed, shuffle/flash, non-winners dim, winner enlarges with tier-appropriate celebration.

### 12.5 Mansion Bonus

Buzzsaw spaces get mansions. Hats land on the grid — each hat landing assigns a mansion. Duplicate hat on existing mansion relocates to empty space. Full screen (15 mansions) = any additional hat pays 10× bet.

Payout scales with mansion count: 1=1×, 3=3×, 6=10×, 10=50×, 15=500× (full screen). Configuration in `mansion_config.json`.

### 12.6 Buzzsaw Bonus

Buzzsaws start from landed positions, move right across their row. Each cell passed gets a straw house border. Multiple buzzsaws on same row upgrade borders: straw (1×) → wood (3×) → brick (8×) → mansion (25×). Payout = sum of all cell border values × total bet. Maximum: 15 cells at mansion = 375× bet.

### 12.7 Mega Hat Bonus

Reels spin with oversized hats covering 4–15 spaces total. More spaces = better start. Distribution weighted toward lower counts (4 spaces = 16.7%, 6 spaces = 12%, 15 spaces < 1%). Hat positions determine starting advantages for collection bonus with additional prize spins.

### 12.8 Wheel Feature State Flow

WF_TRIGGER → WF_INTRO → WF_SPIN → WF_REVEAL → WF_BONUS_DISPATCH (route to Jackpot/Mansion/Buzzsaw/Mega Hat) → WF_PAYOUT → WF_EXIT (return to calling context).

---

## Section 13: Buy Feature System

### 13.1 Purchasable Features

Buy Free Spins: instant 10 Free Spins (no scatter payout). Buy Wheel: instant Wheel spin. Both deliver features identical to natural triggers.

### 13.2 Cost Formulas

Buy Free Spins: 75× total bet. Buy Wheel: 50× total bet. Costs scale with bet level. Configured in `buy_feature_config.json`. Costs tuned by math model so buying does not give higher RTP than natural play.

### 13.3 Economy Deduction

Atomic operation: cost deducted and feature delivered as indivisible transaction. Balance validated before deduction. Insufficient balance prevents purchase.

### 13.4 UI/UX

Buttons below reel frame. Dynamic cost display updates on bet change. Greyed out when unaffordable or during non-IDLE states. Confirmation dialog with hold-to-confirm (1.0s hold, circular progress ring) to prevent accidental purchases. Hidden during features and Autoplay.

---

## Section 14: Bet Control & Game Economy

### 14.1 Bet Structure

Total bet = base bet × 10 paylines. 9 bet levels: base bet from 1 to 100 coins. Total bet range: 10–1,000 coins. Default: level 4 (100 total). All levels in `bet_config.json`.

| Level | Base Bet | Total Bet |
|---|---|---|
| 1 | 1 | 10 |
| 2 | 2 | 20 |
| 3 | 5 | 50 |
| 4 | 10 | 100 |
| 5 | 20 | 200 |
| 6 | 25 | 250 |
| 7 | 50 | 500 |
| 8 | 75 | 750 |
| 9 | 100 | 1,000 |

### 14.2 Demo Economy

Starting balance: 50,000 coins. Session-only (no persistence across browser sessions). Restart available when balance reaches 0. No real-money integration. Settings persist via browser IndexedDB.

### 14.3 Balance Updates

Deducted on spin start (instant). Credited on win (count-up animation scaled to amount). Auto-reduce bet to highest affordable level when balance drops below current bet. Disable spin at 0 balance, show restart dialog with session stats.

### 14.4 Insufficient Balance

Balance < current bet: auto-reduce to affordable level. Balance < minimum bet (10): disable spin, show restart prompt. Balance = 0: disable all controls, restart dialog with session stats.

---

## Section 15: Game Controls & UI Mechanics

### 15.1 Controls

Primary: Spin (center-bottom), Stop/Quick Spin (replaces Spin during spin), Autoplay (toggle), Quick Spin (toggle), Bet Up/Down/Max, Buy Free Spins, Buy Wheel, Menu, Exit, Settings, Paytable.

Display elements: Balance (bottom-left), Bet (bottom-center-left), Win (bottom-center-right), Multiplier Indicator (top-right of reels), Free Spins Counter (top-center, FS only), Free Spins Running Total (bottom-center, FS only).

### 15.2 Button State Matrix

All bet controls, buy buttons, and autoplay enabled in IDLE only. Menu, Exit, Settings accessible in most states. Spin hidden during spin (replaced by Stop). All controls hidden during features except Menu/Exit/Settings and Quick Spin toggle.

### 15.3 Autoplay

Configuration panel: spin count (10, 25, 50, 100, infinite) + optional stop conditions (balance increase/decrease limit, stop on feature, stop on big win). Uses preset bet. 0.5s delay between spins. Manual stop available at any time. Bet controls disabled during Autoplay.

### 15.4 Quick Spin

Persistent toggle. Reduces all animation durations by ~50%. Affects reel spin, morph chain, burst, celebrations, transitions. Stop button available during spin for instant resolution.

### 15.5 Win Celebrations

Scaled to win size. Standard (< 5×): in-place text pulse. Nice (5–15×): enlarged counter + particles. Big (15–30×): full-screen overlay, coin shower, fanfare. Mega (30–50×): extended celebration + screen shake. Super (50×+): maximum celebration. All skippable by tap.

---

## Section 16: HUD & Paytable UI

### 16.1 HUD Layout

Top bar: Menu, Paytable, Settings (left); Multiplier (right); Exit (far right). Center: Reel Area. Info bar: Balance, Bet controls, Win display. Action bar: Buy buttons (edges), Quick Spin, Autoplay, Spin (center).

### 16.2 HUD Mode Variants

Base Game: full controls visible. Free Spins: bet controls and buy buttons hidden, spin counter and running total added, bet locked display. Wheel Feature: all action controls hidden, bet locked display.

### 16.3 Paytable

6-page scrollable overlay. Page 1: High-pay symbol values. Page 2: Low-pay symbol values. Page 3: Special symbols (Wild, Bursting Wild, Scatter, Golden). Page 4: Morphing mechanics and multiplier sequences. Page 5: Free Spins and Wheel Feature rules. Page 6: Payline diagrams. All values read from config — never hardcoded.

### 16.4 Responsive Design

Reference: 1920×1080. Supports 1280×720 to 3840×2160 and ultrawide. Fit-height for wider screens, fit-width for narrower. Touch targets minimum 44px at any resolution. UI elements anchored to reel frame (multiplier), screen edges (top bar), or fixed offset from reels (info/action bars).

---

## Section 17: Settings & Audio

### 17.1 Settings Menu

Compact overlay: Music Volume slider (0–100%, default 70%), SFX Volume slider (0–100%, default 90%), Mute All toggle, Quick Spin toggle, Restart Economy button. Non-blocking — game continues behind panel. Audio changes apply instantly.

### 17.2 Audio Architecture

Channels: Music (1 stream, crossfade), SFX_Primary (4 concurrent), SFX_Secondary (2), SFX_UI (2), SFX_Celebration (1, ducks other channels). Audio ducking: celebrations reduce music to 20–30%.

### 17.3 Music

5 tracks: Base Game Theme (120 BPM, upbeat casino jazz), Free Spins Theme (135 BPM, elevated energy), Wheel Feature Theme (100 BPM, dramatic game show), Bonus Resolution (110 BPM, whimsical adventure), Big Win Celebration (140 BPM, triumphant fanfare — plays once). Crossfade transitions between tracks (0.8–1.0s).

### 17.4 Sound Effects

~35 unique SFX across categories: Core Gameplay (spin start/stop, anticipation, wins), Morph & Chain (dissolve, appear, multiplier advance, cap reached), Special Symbols (golden land/convert, burst impact/expand/target, scatter land/win), Features (FS intro/retrigger/end, wheel spin/tick/land, jackpot reveal, mansion/buzzsaw/mega hat events), UI (button click, toggle, slider, dialog, bet change, balance refill).

### 17.5 Audio Design Principles

Feedback hierarchy (features > wins > mechanics > UI > ambient). Pitch as information (higher = more valuable). Avoid audio fatigue (short, varied frequent sounds). Silence before reveals. Maximum 4 simultaneous SFX.

### 17.6 WebGL Audio

"Tap to Play" splash required — browsers block audio until first interaction. AudioContext resume on user gesture. Tab visibility handler pauses/resumes audio. Pre-decode all SFX during loading. Format: .ogg (preferred for WebGL).

---

## Section 18: RNG Architecture & Fairness

### 18.1 Algorithm

Xorshift128+ — fast, good distribution, deterministic. Period: 2^128-1. 64-bit output per call. Passes BigCrush test suite. Not cryptographically secure (not needed for demo).

### 18.2 Seed Management

Single seed per session from system timestamp. Single PRNG instance for entire game. No reseeding during session. Seed logged for replay. Debug seed override in development builds.

### 18.3 RNG Call Registry

Complete list of every randomization point:

| System | Purpose | Calls Per Event |
|---|---|---|
| Reel Engine | Stop position per reel | 5 per spin |
| Golden Handler | Overlay chance per cell | Up to 15 per spin |
| Morph System | Symbol selection | 1 per morphed cell |
| Morph System | Golden chance on fill | 1 per eligible cell |
| Burst Feature | Burst count | 1 per burst |
| Burst Feature | Position selection | 1 per target cell |
| Wheel Feature | Trigger check | 1 per spin |
| Wheel Feature | Segment outcome | 1 per wheel spin |
| Wheel Feature | Animation params | 2 per wheel spin |
| Jackpot | Tier selection | 1 per jackpot |
| Mansion Bonus | Hat appearance + relocation | Variable |
| Mega Hat Bonus | Hat spaces + layout + prizes | Variable |

Systems with NO RNG: win evaluation, multiplier advancement, scatter detection, balance updates, buzzsaw movement, animation timing, UI state changes.

### 18.4 Typical RNG Calls Per Spin

No win: 12–16 calls. Single win with morph: 19–22. 3-step chain: 28–34. Chain with Golden burst: 38–43. Full Free Spins session: 250–350.

### 18.5 Fairness

Demo build: all RNG client-side. Acceptable for demo, not for real-money. Architecture future-proofed via IOutcomeProvider interface — LocalRNGProvider (demo) swaps with ServerOutcomeProvider (real-money) without touching game logic. RTP is emergent from configuration (strips, pools, weights) — never forced per-spin. Verified by Monte Carlo simulation (10M+ spins).

---

## Section 19: Analytics Events

### 19.1 Event Inventory (15 Events)

1. **session_start** — Game loaded. Params: rngSeed, startingBalance, platform, appVersion, screenResolution.
2. **session_end** — Player exits. Params: sessionDuration, totalSpins, totalWagered, totalWon, sessionRTP, endReason.
3. **spin** — Every spin. Params: spinNumber, gameMode, betLevel, totalBet, spinType (manual/autoplay/free_spin).
4. **spin_result** — Spin resolved. Params: totalWin, winMultiple, winTier, chainLength, maxMultiplier, paylinesWon, scatters, goldens, bursts.
5. **feature_trigger** — Feature activated. Params: featureType, triggerSource (natural/buy), scatterCount, buyCost.
6. **free_spins_complete** — FS session ended. Params: totalSpins, retriggerCount, sessionTotalWin, longestChain, maxMultiplier, sessionDuration.
7. **wheel_feature_complete** — Wheel resolved. Params: wheelOutcome, totalWin, jackpotTier, mansionCount, buzzsawCount, hatSpaces.
8. **buy_feature** — Feature purchased. Params: featureType, cost, balanceBefore, balanceAfter.
9. **big_win** — Win ≥ 15× bet. Params: winTier, winAmount, winMultiple, source, celebrationSkipped.
10. **economy_restart** — Balance reset. Params: restartNumber, spinsPlayed, totalWagered, totalWon, timeSinceLastRestart.
11. **bet_change** — Bet level changed. Params: previousBet, newBet, changeType, currentBalance.
12. **autoplay_start** — Autoplay activated. Params: spinsRequested, totalBet, stopConditions.
13. **autoplay_stop** — Autoplay ended. Params: reason, spinsCompleted, totalWagered, totalWon, duration.
14. **error** — Runtime error. Params: errorType, errorMessage, gameState, stackTrace, recoveryAction.
15. **settings_change** — Setting modified. Params: setting, previousValue, newValue.

### 19.2 Dispatch Rules

Non-blocking async dispatch. Batched (50 events or 30 seconds). Session-end forces synchronous flush. Retry on failure (3 attempts, then local storage fallback). No PII. All string fields capped at 256 chars.

---

## Section 20: Technical Specifications

### 20.1 Engine & Tools

Unity (LTS 2022.3+) with WebGL Build Module. TextMeshPro for text. DOTween for animation. Juego in-house SDKs. Brotli/Gzip compression for builds.

### 20.2 WebGL Constraints

Single-threaded (no native threading). No filesystem (save via IndexedDB). Memory cap (~256MB WASM heap). Audio via Web Audio API (requires user gesture to start). Initial load matters (target < 15MB compressed). No Application.Quit() (message to host page).

### 20.3 Browser Requirements

Primary: Chrome 90+, Edge 90+. Secondary: Firefox 95+, Safari 15.4+. Tertiary: Opera 76+, mobile Chrome/Safari. Required: WebGL 2.0 (fallback 1.0), Web Audio API, WebAssembly, IndexedDB.

### 20.4 Performance Targets

| Metric | Target |
|---|---|
| Frame rate | 60 FPS constant |
| Initial load | < 5s on 10 Mbps |
| Initial download | < 15 MB compressed |
| Total assets (streamed) | < 50 MB |
| Runtime memory | < 150 MB |
| Spin logic latency | < 16ms |
| Input response | < 100ms |

### 20.5 Optimization Strategies

Texture atlasing (2048×2048 sheets). Object pooling (particles, UI, symbols — never Instantiate/Destroy at runtime). Audio pre-loading and pooling. Asset streaming (bonus features loaded on demand, not at startup). Canvas split (static HUD frame vs. dynamic counters). Shader warmup during loading. Zero-allocation update loops.

### 20.6 WebGL Audio

"Tap to Play" splash for AudioContext resume. Tab visibility handler (pause on background, resume on focus). Pre-decode all clips during loading. Format: .ogg.

### 20.7 Save System

PlayerPrefs → IndexedDB. Persisted: settings (volume, quick spin), restart count, Free Spins recovery state. Not persisted: balance (session-only), RNG state, spin history.

### 20.8 Host Page Communication

jslib bridge for Unity ↔ host page messaging via postMessage. Exit sends message to host (cannot close tab). Fullscreen via Fullscreen API on user gesture.

### 20.9 Loading Flow

Phase 1 (0–2s): HTML bootstrap, WASM download. Phase 2 (2–5s): Unity init, core assets, shader warmup. Phase 3: "Tap to Play" (user-gated, AudioContext resume). Phase 4: Background streaming of bonus assets during gameplay.

---

## Appendix A: Glossary

| Term | Definition |
|---|---|
| Base Game | Default mode — manual/autoplay spins at chosen bet |
| Cascade/Tumble | Winning symbols removed and replaced (morph-in-place in this game) |
| Chain | Sequence of consecutive wins within single spin via morph system |
| Free Spins | Bonus mode — free automatic spins with enhanced parameters |
| Golden Symbol | Modifier on standard symbol — converts to Bursting Wild on win |
| Grid | Visible 3×5 play area (15 cells) |
| Morph | Replacing a winning symbol with new random symbol in same cell |
| Morph Pool | Weighted table for morph replacement symbols |
| Multiplier | Value amplifying wins during chain (×1→×5 base, ×2→×10 FS) |
| Payline | Predefined pattern for matching symbols (10 fixed lines) |
| PRNG | Pseudorandom number generator (Xorshift128+) |
| Reel Strip | Virtual looping symbol array per reel |
| Retrigger | 3+ Scatters during FS adding more spins |
| RTP | Return to Player — theoretical percentage returned over millions of spins |
| Scatter | Symbol paying by count anywhere, triggering Free Spins at 3+ |
| Volatility | Payout distribution measure (this game: medium-high) |
| Wild | Symbol substituting for others in win combinations |
| Bursting Wild | Wild expanding to 1–4 adjacent cells on win |

## Appendix B: References & Inspirations

| Reference | What Borrowed |
|---|---|
| Big Bad Wolf (Quickspin) | Thematic inspiration, cascading reels concept, character art style |
| Reactoonz (Play'n GO) | Cascading wins with escalating features |
| Sweet Bonanza (Pragmatic Play) | Tumble mechanic with multiplier system |
| Jammin' Jars (Push Gaming) | Growing multiplier wilds concept |
| Huff N' Puff original (Light & Wonder) | Mansion/Buzzsaw/Mega Hat bonus structure |

## Appendix C: Cut Features Log

| Feature | Cut Reason |
|---|---|
| Gravity-drop cascade | Morph-in-place chosen for brand differentiation |
| Progressive jackpot (networked) | Requires server backend — out of scope for demo |
| Gamble / Double-Up | Complexity without thematic fit |
| Achievements / Missions | No persistent progression in demo |
| Multiplayer / Tournament | Requires server infrastructure |
| Dynamic RTP adjustment | Not appropriate for demo — requires server authority |
| Variable payline count | Fixed 10 lines simplifies UX and math |

## Appendix D: Configuration File Index

| File | Contents |
|---|---|
| reel_config.json | Reel strip arrays (base + FS), strip lengths |
| paytable_config.json | Symbol payout values |
| paylines_config.json | 10 payline patterns |
| morph_pool_config.json | Morph symbol weights (base + FS) |
| golden_config.json | Golden eligible reels, chance per reel |
| burst_config.json | Burst count weights, burst symbol |
| multiplier_config.json | Multiplier sequences |
| scatter_config.json | Scatter payouts, retrigger awards |
| wheel_config.json | Trigger chances, segment weights |
| jackpot_config.json | Tier values, bet scaling, tier weights |
| mansion_config.json | Payout table, hat chance, full-screen bonus |
| buzzsaw_config.json | Border pay values |
| megahat_config.json | Hat spaces weights, prize params |
| buy_feature_config.json | Buy costs, enable flags |
| bet_config.json | Bet levels, payline count |
| economy_config.json | Starting balance, restart rules |
| win_tiers_config.json | Celebration thresholds |
| analytics_config.json | SDK settings, batch params |

All 18 config files in StreamingAssets/Config/ — loaded at runtime via UnityWebRequest.

## Appendix E: Multi-Agent Review Notes

**John (PM):** Run RTP simulation (10M+ spins) as first pre-production task. Wheel Feature trigger probability is a placeholder — must be validated against target RTP.

**Sally (UX):** Consider adding 3-spin guided tutorial for demo audiences. Game is playable without it but guided onboarding helps showcase context.

**Winston (Architect):** Memory management is highest WebGL risk. Bonus features (Wheel sub-games) loading during Free Spins could stack 3 asset sets. Implement explicit asset unload after each bonus. Stress-test at 256MB WASM heap. Add memory watchdog (warning at 200MB, low-quality at 230MB).

**Bob (Scrum Master):** Wheel Feature's 4 bonus sub-games are the schedule risk — each is effectively a mini-game. Consider shipping Jackpot-only Wheel initially and adding Mansion/Buzzsaw/Mega Hat in a subsequent sprint if timeline is tight.

---

*End of Document*

*Document prepared using BMAD multi-agent methodology. All values marked as "template" require math model validation before development.*
