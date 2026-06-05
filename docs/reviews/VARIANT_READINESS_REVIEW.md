# Variant Readiness Review

Last reviewed: 2026-06-01

## Executive Summary

The contract-model refactor described in PR #9 is implemented for standard numeric Texas 42, and the no-trump plus mark-bid engine, local practice, and multiplayer exposure slices are now in place.

The engine no longer treats contract data as a flat `contract.trumpSuit` assumption. It now uses a discriminated contract union with contract-aware helper paths for trump resolution, trick resolution, hand scoring, mark awards, and runtime validation.

Variant support is still product-incomplete, but the engine now supports the `standardNumeric` and `noTrump` contract members behind explicit rule configuration, and mark bids as a gated bid type on those contracts. Local practice and multiplayer can expose no-trump through setup/start-game controls and active-game trump selection, and can expose mark bids through setup/start-game controls and bidding surfaces.

## Current Model (Implemented)

Current implemented assumptions and behavior:

- `BidCall` supports `pass | numeric | marks`.
- `NumericBid` is limited to integer amounts from 30 through 42.
- `MarkBid` is gated by `RuleConfig.enabledContracts.markBids`. The opening mark bidder may bid one or two marks; later mark bids must climb exactly one mark, up to the target marks.
- `Contract` is now a discriminated union:

```ts
type Contract = NoTrumpContract | StandardNumericContract;

type StandardNumericContract = {
  kind: "standardNumeric";
  bid: NumericBid | MarkBid;
  declarer: SeatIndex;
  trump: {
    kind: "pip";
    suit: TrumpSuit;
  };
};

type NoTrumpContract = {
  kind: "noTrump";
  bid: NumericBid | MarkBid;
  declarer: SeatIndex;
  trump: {
    kind: "none";
  };
};
```

- A compatibility `trumpSuit` getter may still exist internally, but callers are being moved to contract helpers.
- `FortyTwoTrickPlayState.contract` and `FortyTwoTrumpCalledPayload.contract` are typed as `Contract`.
- Trick winner and legal-led-suit paths are contract-aware (`determineTrickWinnerForContract`, `getLegalLedSuitsForContract`).
- Trump lookup and trump checks are contract-aware (`getContractTrumpSuit`, `getContractTrumpSelection`, `isDominoTrumpForContract`).
- Hand scoring is now contract-aware: `scoreCompletedHand(completedTricks, contract, rules)`.
- Mark awards are now contract-aware via `getContractMarkAwards(contract, biddingTeamId, outcome)`.
- Mark bids require the bidding team to capture all 42 hand points and award the bid mark count to the bidding team if made or to opponents if set.
- Runtime validation rejects unsupported contract kinds (`assertContract` in validation/replay boundaries).
- `RuleConfig.enabledContracts.noTrump` gates no-trump calls. Standard rules keep it disabled.

Current deliberate product deviation (unchanged):

- A non-trump domino currently leads only its higher pip suit (for example, `6-4` leads sixes, not fours).

## Variant Blockers (After Refactor)

| Variant | Current blockers |
|---|---|
| Mark bids | Engine, local practice UI, and multiplayer UI/API exposure exist behind `RuleConfig.enabledContracts.markBids`; remaining work is broader fixture and deployed smoke coverage. |
| 84 | No 84 contract member/bid flow or doubled hand-value scoring semantics are implemented. |
| Follow-me | Contract union is ready, but no follow-me contract kind, delayed/derived trump lifecycle, or command/action flow exists. |
| No-trump | Engine foundation, local practice UI, and multiplayer room/API/active-game exposure exist behind `RuleConfig.enabledContracts.noTrump`; remaining work is broader fixture and deployed smoke coverage. |
| Nello | No nello contract member, low-wins trick model, inverted objective handling, or scoring semantics are implemented. |
| Sevens | No sevens contract/bid definition, play semantics, or scoring model is implemented. |
| Splash | No splash bid/contract member, eligibility checks, or scoring/mark model is implemented. |
| Plunge | No plunge bid/contract member, partner/trump-decision flow, or multi-mark awards are implemented. |

## Has StandardNumericContract Become A Union Member?

Yes. This is now implemented.

The first refactor slice is complete:

- `Contract`/`TrumpSelection` structure exists for standard numeric and no-trump contracts.
- Core trick/scoring/trump helpers now dispatch through contract-aware entry points.
- Runtime validation rejects unsupported contract kinds at replay/schema boundaries.

## Completed Refactor Slice (PR #9)

Implemented and behavior-preserving for standard numeric:

1. Introduced `Contract` and nested trump selection shape.
2. Added contract-aware helper paths:
   - `getContractTrumpSuit`
   - `isDominoTrumpForContract`
   - `getLegalLedSuitsForContract`
   - `determineTrickWinnerForContract`
   - `getContractMarkAwards`
3. Migrated hand scoring entrypoint to `scoreCompletedHand(completedTricks, contract, rules)`.
4. Updated state/event typing and validation to use `Contract`.
5. Added tests for standard-numeric contract round-trip and rejection of unsupported contract kinds during validated replay.

## Completed No-Trump Engine Foundation Slice

Implemented as the rules foundation:

1. Added `RuleConfig.enabledContracts.noTrump`.
2. Added `NoTrumpContract` with `trump: { kind: "none" }`.
3. Added generalized trump selection call plumbing while preserving legacy `trumpSuit` actions.
4. Added no-trump trick winner behavior: no trump override; highest led-suit domino wins.
5. Reused standard numeric bid amount and one-mark made/set scoring for no-trump.
6. Added focused tests for no-trump gating, command routing, trick behavior, and standard behavior preservation.

## Completed No-Trump Local Practice Slice

Implemented for local practice only:

1. Added a local practice setup toggle for No Trump.
2. Routed the toggle into `createLocalGameSession` through engine-owned rule construction.
3. Added `LegalTrumpCall`/`callLocalGameTrumpSelection` plumbing so the UI can call pip trump or no-trump without duplicating rule checks.
4. Updated local practice trump selection to render a No Trump tile when legal.
5. Updated local activity/status formatting to show No Trump.
6. Added focused local session and mobile screen tests.

## Completed No-Trump Multiplayer Exposure Slice

Implemented for multiplayer:

1. Added sanitized `StartGameInput.noTrump` parsing at the AppSync/backend boundary.
2. Routed the backend flag into engine-owned multiplayer rule construction instead of letting clients submit arbitrary rule objects.
3. Added mobile lobby host controls for No Trump.
4. Added generalized mobile trump-selection payloads so active-game UI can call pip trump or No Trump.
5. Updated multiplayer active-game status, trump labels, and legal play hints for no-trump contracts.
6. Added focused engine, backend, mobile client, lobby, and active-game tests.

## Completed Mark-Bid Variant Slice

Implemented for local practice and multiplayer:

1. Added `MarkBid` to the engine bid model behind `RuleConfig.enabledContracts.markBids`.
2. Added the mark-bid ladder: first mark bidder may bid one or two marks; later mark bids climb exactly one mark.
3. Scored mark bids as all-42-point contracts with bid-mark awards to the bidding team when made or opponents when set.
4. Routed mark-bid rules through local practice setup and multiplayer start-game input instead of accepting arbitrary rules from clients.
5. Added mobile local/lobby controls and active-game bid buttons for legal mark bids.
6. Added focused engine, backend, mobile client, lobby, and active-game tests.

## Remaining Work Before Product Variant Availability

The engine, local practice, and multiplayer control paths are in place for no-trump and mark bids, but these are still required before treating them as fully product-hardened:

- Add broader fixture-backed command/replay tests for no-trump full-hand made/set outcomes.
- Add broader fixture-backed command/replay tests for mark-bid full-hand made/set outcomes across multiple declarers.
- Add deployed subscription/snapshot smoke coverage for no-trump multiplayer actions.
- Add deployed subscription/snapshot smoke coverage for mark-bid multiplayer actions.
- Keep unsupported contract kinds rejected at boundaries until each variant is fully implemented.

## Test Expectations Going Forward

Still required for each new variant increment:

- Existing standard numeric behavior remains unchanged.
- Contract serialization and replay remain deterministic.
- Runtime validation rejects malformed/unsupported contract values.
- Command-emitted events replay to the same state.
- Public multiplayer snapshots remain safely redacted if future contracts add hidden/private fields.

## Recommended Next Variant Work

Harden no-trump and mark bids with broader full-hand fixtures and deployed multiplayer smoke coverage before starting another variant. They remain safer than nello, splash, plunge, or sevens because they do not add multi-actor partner/trump decision flows.

Do not start with nello, splash, plunge, or sevens before product-rule clarification and dedicated fixture-backed tests.
