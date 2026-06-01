# Missing Rules

Last reviewed: 2026-06-01

## Scope

This file lists rules and product decisions missing from the current engine compared with broad Texas 42 expectations. It does not mean these are required for the current local standard numeric slice. The default supported rules are intentionally narrow: four-player partnership Texas 42, double-six dominoes, numeric bids from 30 to 42, one pip trump selection, standard trick play, marks scoring, and dealer-forced 30 on all-pass hands. Variant-gated support now exists for no-trump and mark bids.

## Implemented Standard Rules

- Four seats.
- Two fixed teams: seats `0/2` and `1/3`.
- Dealer rotation.
- Bid order starting left of dealer.
- Double-six set with 28 dominoes.
- Deal of 7 dominoes to each seat.
- Count domino scoring for `0-5`, `1-4`, `2-3`, `5-5`, and `6-4`.
- Numeric bids from 30 through 42.
- Increasing bid requirement.
- One bid opportunity per player.
- All-pass dealer-forced 30.
- Declarer is highest bidder or forced dealer.
- Declarer calls one pip trump suit.
- Trump dominoes belong to trump only under default behavior.
- Doubles rank high in trump and non-trump suits.
- Must-follow-suit validation.
- Sloughing only when unable to follow.
- Trick winner by highest trump, otherwise highest led suit.
- Seven tricks per hand.
- One trick point per trick.
- Total hand points of 42.
- Made/set numeric bid outcome.
- One mark to bidding team when made.
- One mark to opponents when set.
- Game completion at target marks.

## Missing Contract And Bid Rules

| Rule | Status | Notes |
|---|---|---|
| Mark bids | Partial | Engine, local practice UI, and multiplayer UI/API exposure exist behind `RuleConfig.enabledContracts.markBids`. Opening mark bidders may bid one or two marks; later mark bids climb exactly one; made/set scoring awards the bid mark count. Broader fixture and deployed smoke coverage are still missing. |
| 84 bids | Missing | Config flag exists only. Requires doubled hand value/scoring behavior and likely distinct contract semantics. |
| Plunge | Missing | Config flag exists only. Needs eligibility rules and scoring/mark awards. |
| Splash | Missing | Config flag exists only. Needs eligibility rules and scoring/mark awards. |
| Nello | Missing | Config flag exists only. Requires low/no-trump style winner logic and scoring rules. |
| Sevens | Missing | Config flag exists only. Requires special contract semantics. |
| Follow-me | Missing | Config flag exists only. Contract union scaffolding now exists, but no follow-me contract member, bid flow, or first-lead trump behavior is implemented. |
| No-trump | Partial | Engine foundation, local practice UI, and multiplayer UI/API exposure exist behind `RuleConfig.enabledContracts.noTrump`: contract member, call action selection, no-trump trick winner behavior, standard one-mark made/set scoring, local setup toggle, multiplayer start-game toggle, and local/multiplayer trump-selection tiles. Broader no-trump full-hand fixtures and deployed smoke coverage are still missing. |
| Low/no-low variants | Missing | Not represented. Product decision needed. |
| Dealer redeal on all-pass | Missing | `RuleConfig.bidding.allPassBehavior` includes `"redeal"`, but the bidding implementation always forces dealer 30. |
| Multiple-mark awards | Partial | Mark bids award the bid mark count. Other high-risk variants such as 84, plunge, and splash still need their own award semantics. |

## Missing Table And Match Rules

| Rule | Status | Notes |
|---|---|---|
| Configurable target marks in full UI | Partial | Local session accepts target marks, but there is no polished product UI or persistence around it. |
| Point scoring mode | Missing | `scoringMode` supports only `"marks"`. |
| Tournament/match structure | Missing | No best-of, match history, standings, or table rotation. |
| Misdeal handling | Missing | No command for misdeal, redeal, or manual correction. |
| Dealer cut/shuffle protocol | Missing | Deterministic shuffle exists, but no multiplayer-verifiable shuffle/cut flow. |
| Reneging penalties | Missing | Illegal plays are rejected before acceptance; there is no post-facto renege adjudication. |
| Undo/concede/adjudication | Missing | Contract docs mention future concepts, but command handlers do not implement them. |
| Spectator rules | Missing | No spectator state or visibility rules. |

## Missing Multiplayer Rule Boundaries

These are not gameplay rules, but they become rule-enforcement requirements once Texas 42 is real-time multiplayer:

- Server-authoritative action acceptance.
- Duplicate action ID handling.
- Accepted-event validation before persistence.
- Stale action policy beyond strict known-version rejection.
- Hidden-hand redaction for clients and bots.
- Reconnect-safe snapshots.
- Event-log migration and replay compatibility.
- Manual correction/admin flow for disputed hands.

## Ambiguous Decisions Needed

1. Should launch support only standard numeric bids, or should common variants such as 84, plunge, splash, nello, or sevens be launch requirements?
2. Should all-pass be dealer-forced 30 everywhere, or should redeal be a selectable table option?
3. Should no-trump or follow-me be first-class contracts?
4. Should doubles ever be a separate suit, or are doubles always high within their pip suit for the supported rule set?
5. Should target marks be configurable per local game, per room, or globally?
6. Should illegal accepted events be impossible by architecture, rejected by validation, or repairable by adjudication commands?
7. Should local practice games persist automatically, ask before discard, or remain intentionally disposable?

## Recommended Sequencing

1. Harden accepted-event validation and runtime schemas before adding variants.
2. Persist full-rules local games before building multiplayer reconnect behavior.
3. Enforce hidden-information DTOs before improving bot strategy.
4. Add one variant at a time behind `RuleConfig`, with fixture-backed tests and no hidden conditionals.
5. Defer tournament, spectator, analytics, and admin workflows until the standard multiplayer game loop is stable.
