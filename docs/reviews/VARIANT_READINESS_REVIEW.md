# Variant Readiness Review

Last reviewed: 2026-05-30

## Executive Summary

The contract-model refactor described in PR #9 is now implemented for standard numeric Texas 42.

The engine no longer treats contract data as a flat `contract.trumpSuit` assumption. It now uses a discriminated contract union with contract-aware helper paths for trump resolution, trick resolution, hand scoring, mark awards, and runtime validation.

Variant support is still incomplete: only the `standardNumeric` contract member is implemented today.

## Current Model (Implemented)

Current implemented assumptions and behavior:

- `BidCall` is still only `pass | numeric`.
- `NumericBid` is still limited to integer amounts from 30 through 42.
- `Contract` is now a discriminated union alias (currently one member):

```ts
type Contract = StandardNumericContract;

type StandardNumericContract = {
  kind: "standardNumeric";
  bid: NumericBid;
  declarer: SeatIndex;
  trump: {
    kind: "pip";
    suit: TrumpSuit;
  };
};
```

- A compatibility `trumpSuit` getter may still exist internally, but callers are being moved to contract helpers.
- `FortyTwoTrickPlayState.contract` and `FortyTwoTrumpCalledPayload.contract` are typed as `Contract`.
- Trick winner and legal-led-suit paths are contract-aware (`determineTrickWinnerForContract`, `getLegalLedSuitsForContract`).
- Trump lookup and trump checks are contract-aware (`getContractTrumpSuit`, `isDominoTrumpForContract`).
- Hand scoring is now contract-aware: `scoreCompletedHand(completedTricks, contract, rules)`.
- Mark awards are now contract-aware via `getContractMarkAwards(contract, biddingTeamId, outcome)`.
- Runtime validation rejects unsupported contract kinds (`assertContract` in validation/replay boundaries).

Current deliberate product deviation (unchanged):

- A non-trump domino currently leads only its higher pip suit (for example, `6-4` leads sixes, not fours).

## Variant Blockers (After Refactor)

| Variant | Current blockers |
|---|---|
| Mark bids | No mark-bid call type or contract member is implemented yet; multi-mark award semantics are still missing. |
| 84 | No 84 contract member/bid flow or doubled hand-value scoring semantics are implemented. |
| Follow-me | Contract union is ready, but no follow-me contract kind, delayed/derived trump lifecycle, or command/action flow exists. |
| No-trump | Contract union is ready, but no no-trump contract kind, call action, winner logic branch, or scoring branch exists. |
| Nello | No nello contract member, low-wins trick model, inverted objective handling, or scoring semantics are implemented. |
| Sevens | No sevens contract/bid definition, play semantics, or scoring model is implemented. |
| Splash | No splash bid/contract member, eligibility checks, or scoring/mark model is implemented. |
| Plunge | No plunge bid/contract member, partner/trump-decision flow, or multi-mark awards are implemented. |

## Has StandardNumericContract Become A Union Member?

Yes. This is now implemented.

The first refactor slice is complete:

- `Contract`/`TrumpSelection` structure exists for standard numeric contracts.
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

## Remaining Work Before First New Variant

The architecture groundwork is in place, but these are still required before adding a non-standard contract:

- Add contract members plus bid/action/event flows for the chosen variant.
- Extend command handlers so enabled variant flags map to real allowed actions (not inert config).
- Add fixture-backed command/replay tests per variant for bidding, contract call/selection, trick resolution, scoring, and mark awards.
- Keep unsupported contract kinds rejected at boundaries until each variant is fully implemented.

## Test Expectations Going Forward

Still required for each new variant increment:

- Existing standard numeric behavior remains unchanged.
- Contract serialization and replay remain deterministic.
- Runtime validation rejects malformed/unsupported contract values.
- Command-emitted events replay to the same state.
- Public multiplayer snapshots remain safely redacted if future contracts add hidden/private fields.

## Recommended First Variant

No-trump remains the safest first variant after this refactor because it mostly removes trump ranking instead of adding multi-actor partner/trump decision flows.

Do not start with nello, splash, plunge, or sevens before product-rule clarification and dedicated fixture-backed tests.
