# Variant Readiness Review

Last reviewed: 2026-06-01

## Executive Summary

The contract-model refactor described in PR #9 is implemented for standard numeric Texas 42, and the first no-trump engine foundation slice is now in place.

The engine no longer treats contract data as a flat `contract.trumpSuit` assumption. It now uses a discriminated contract union with contract-aware helper paths for trump resolution, trick resolution, hand scoring, mark awards, and runtime validation.

Variant support is still product-incomplete, but the engine now supports the `standardNumeric` and `noTrump` contract members behind explicit rule configuration. Local practice setup UI and multiplayer room/API controls still need to expose the no-trump option.

## Current Model (Implemented)

Current implemented assumptions and behavior:

- `BidCall` is still only `pass | numeric`.
- `NumericBid` is still limited to integer amounts from 30 through 42.
- `Contract` is now a discriminated union:

```ts
type Contract = NoTrumpContract | StandardNumericContract;

type StandardNumericContract = {
  kind: "standardNumeric";
  bid: NumericBid;
  declarer: SeatIndex;
  trump: {
    kind: "pip";
    suit: TrumpSuit;
  };
};

type NoTrumpContract = {
  kind: "noTrump";
  bid: NumericBid;
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
- Runtime validation rejects unsupported contract kinds (`assertContract` in validation/replay boundaries).
- `RuleConfig.enabledContracts.noTrump` gates no-trump calls. Standard rules keep it disabled.

Current deliberate product deviation (unchanged):

- A non-trump domino currently leads only its higher pip suit (for example, `6-4` leads sixes, not fours).

## Variant Blockers (After Refactor)

| Variant | Current blockers |
|---|---|
| Mark bids | No mark-bid call type or contract member is implemented yet; multi-mark award semantics are still missing. |
| 84 | No 84 contract member/bid flow or doubled hand-value scoring semantics are implemented. |
| Follow-me | Contract union is ready, but no follow-me contract kind, delayed/derived trump lifecycle, or command/action flow exists. |
| No-trump | Engine foundation exists behind `RuleConfig.enabledContracts.noTrump`; remaining work is local setup UI, multiplayer room/API controls, and broader fixture coverage. |
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

Implemented engine-only, with no local or multiplayer UI controls yet:

1. Added `RuleConfig.enabledContracts.noTrump`.
2. Added `NoTrumpContract` with `trump: { kind: "none" }`.
3. Added generalized trump selection call plumbing while preserving legacy `trumpSuit` actions.
4. Added no-trump trick winner behavior: no trump override; highest led-suit domino wins.
5. Reused standard numeric bid amount and one-mark made/set scoring for no-trump.
6. Added focused tests for no-trump gating, command routing, trick behavior, and standard behavior preservation.

## Remaining Work Before Product Variant Availability

The engine groundwork is in place for no-trump, but these are still required before users can select it end to end:

- Add local practice setup controls and active-game contract selection UI.
- Add multiplayer room/start controls and API input parsing for variant selection.
- Add multiplayer active-game contract selection UI and subscription/snapshot smoke coverage.
- Add broader fixture-backed command/replay tests for no-trump full-hand made/set outcomes.
- Keep unsupported contract kinds rejected at boundaries until each variant is fully implemented.

## Test Expectations Going Forward

Still required for each new variant increment:

- Existing standard numeric behavior remains unchanged.
- Contract serialization and replay remain deterministic.
- Runtime validation rejects malformed/unsupported contract values.
- Command-emitted events replay to the same state.
- Public multiplayer snapshots remain safely redacted if future contracts add hidden/private fields.

## Recommended Next Variant Work

Finish no-trump product exposure next: local practice first, then multiplayer room/API and active-game UI. No-trump remains the safest first variant because it mostly removes trump ranking instead of adding multi-actor partner/trump decision flows.

Do not start with nello, splash, plunge, or sevens before product-rule clarification and dedicated fixture-backed tests.
