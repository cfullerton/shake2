# Variant Readiness Review

Last reviewed: 2026-05-30

## Executive Summary

The current contract and trump model is solid for standard numeric Texas 42, but it is not variant-ready yet.

The engine currently assumes exactly one playable contract shape:

```ts
StandardNumericContract = {
  kind: "standardNumeric";
  bid: NumericBid;
  declarer: SeatIndex;
  trumpSuit: TrumpSuit;
}
```

That works for numeric bids from 30 through 42 with one pip trump suit. It becomes brittle for variants because bidding, trump selection, trick ranking, hand scoring, mark awards, actions, events, snapshots, runtime schemas, bots, and UI all depend on that one shape.

Before adding the first variant, `StandardNumericContract` should become one member of a `Contract` discriminated union. The first refactor should preserve behavior and only make standard numeric a first-class union member.

## Current Model

Current implemented assumptions:

- `BidCall` is only `pass | numeric`.
- `NumericBid` is limited to integer amounts from 30 through 42.
- `WinningBid` always contains a `NumericBid`.
- `StandardNumericContract` always contains a concrete pip `trumpSuit`.
- `TrumpSuit` is one of blanks, ones, twos, threes, fours, fives, or sixes.
- `DominoSuit` is currently an alias of `TrumpSuit`.
- `CallFortyTwoTrumpActionPayload` only accepts a pip trump suit.
- `FortyTwoTrickPlayState.contract` is a `StandardNumericContract`.
- `FortyTwoTrumpCalledPayload.contract` is a `StandardNumericContract`.
- Trick winner logic always uses highest trump first, then highest led-suit domino.
- Hand scoring always awards positive captured points to the trick-winning team.
- Numeric bid outcome is always `biddingTeamPoints >= bid.amount`.
- Mark awards are always exactly one mark to the bidding team when made, or exactly one mark to the opposing team when set.
- `RuleConfig.enabledContracts` has future flags, but the command layer does not implement or reject enabled variants.

Current deliberate product deviation:

- A non-trump domino currently leads only its higher pip suit. For example, `6-4` leads sixes, not fours. This matches the latest UI request, but it differs from the broader v2 rules spec that says a leader may choose either suit for non-trump two-pip dominoes.

## Variant Blockers

| Variant | Current blockers |
|---|---|
| Mark bids | `BidCall` has no mark-bid member. `WinningBid` requires `NumericBid`. Bidding validation only compares numeric amounts from 30-42. `HandScore` stores `bidAmount`, not bid/contract outcome data. Mark awards are fixed at one mark, so multi-mark rewards and set penalties cannot be represented. |
| 84 | The whole scoring path assumes a 42-point hand. `RuleConfig.scoring.handTotalPoints` is 42, `scoreCompletedHand` rejects non-42 totals, `NumericBid` caps at 42, and mark awards are fixed at one. There is no contract-level scoring mode that can double trick/count values or otherwise represent an 84-point target. |
| Follow-me | The engine requires a pip trump suit before trick play begins. `callTrump`, `CallFortyTwoTrumpActionPayload`, `TRUMP_CALLED`, `isDominoTrump`, `getLegalLedSuits`, and `determineTrickWinner` all require a known `TrumpSuit`. Follow-me needs a contract state where trump is absent, delayed, or derived from the declarer's first lead. |
| No-trump | `StandardNumericContract` requires `trumpSuit`, and trick resolution always checks trump first. There is no `trump: none` concept, no no-trump legal trump call, and no no-trump winner helper that only evaluates led suit. |
| Nello | The winner and scoring model are high-card, positive-capture, numeric-bid oriented. Nello likely needs no-trump or low-trump behavior, low-wins ranking, inverted objectives, and different made/set scoring. The exact local rule definition is also not documented enough to implement safely. |
| Sevens | The current model has no sevens contract definition. Bids, trump calls, trick ranking, point scoring, and mark awards are all standard numeric only. The product rule for sevens needs to be specified before code: objective, legal play impact, scoring, and mark value. |
| Splash | There is no bid type, hand-eligibility check, or mark-award model for splash. If splash eligibility depends on holding a number of doubles, the bidding command must inspect the bidder's hand and the action/schema must represent the bid distinctly from numeric 30-42. |
| Plunge | There is no bid type, hand-eligibility check, partner/trump-decision flow, or multi-mark award model for plunge. If plunge lets the bidder's partner choose trump, the current `declarer calls trump` invariant is wrong for that contract. |

## Should StandardNumericContract Become A Union?

Yes. `StandardNumericContract` should become a member of a broader `Contract` discriminated union before variants are implemented.

Recommended direction:

```ts
type Contract =
  | StandardNumericContract;

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

The first step should not add variant members. It should only make current behavior explicit through a union shape. Existing callers can keep compatibility helpers such as `getContractTrumpSuit(contract)` while the codebase moves away from direct `contract.trumpSuit` reads.

Why this should happen before variants:

- Actions/events/snapshots need a stable serializable contract shape before multiplayer persistence depends on it.
- Runtime schemas need a safe way to reject unsupported contract kinds.
- Trick and scoring helpers need to dispatch by contract kind, not by scattered `if variant flag` branches.
- Bot and UI legal-action selectors need to ask the engine for legal contract actions instead of hard-coding pip trump choices.
- Mark bids, no-trump, follow-me, splash, plunge, sevens, and nello cannot all be modeled as a `trumpSuit` field.

Avoid a loose shape such as `trumpSuit?: TrumpSuit`. Optional fields would make illegal combinations easy to serialize and hard to validate. A discriminated union keeps unsupported states unrepresentable.

## Minimal Refactor Before Variants

Do this as a behavior-preserving slice before adding any variant:

1. Introduce `Contract` and `TrumpSelection` types.

   Keep `StandardNumericContract` as the only member initially. Represent trump as a nested discriminated value, such as `{ kind: "pip"; suit: TrumpSuit }`.

2. Replace direct `contract.trumpSuit` access with contract helpers.

   Add helpers such as `getContractTrumpSuit`, `isDominoTrumpForContract`, `getLegalLedSuitsForContract`, `determineTrickWinnerForContract`, and `getContractMarkAwards`. For now, each helper should only support `standardNumeric`.

3. Make scoring contract-aware.

   Change scoring entry points from `scoreCompletedHand(completedTricks, winningBid)` toward `scoreCompletedHand(completedTricks, contract, rules)`. For standard numeric, preserve the existing 42-point total and one-mark made/set behavior.

4. Make bidding result contract-capable.

   Keep `BidCall` behavior unchanged, but prepare `WinningBid` and contract creation so future mark/special bids do not have to masquerade as numeric bids.

5. Validate `RuleConfig` capabilities at game creation.

   Until variants exist, either reject enabled variant flags or document and test that standard mode requires all `enabledContracts` flags to be false. The current state can store enabled flags that do not affect behavior, which is dangerous for multiplayer rooms.

6. Update action/event/snapshot schemas.

   Event payloads, public snapshots, private records, idempotency records, and runtime parsers should understand the contract union and reject unsupported contract kinds at boundaries.

7. Extract deterministic full-hand fixtures.

   Variant work needs compact, reusable fixtures that can prove bidding, trump/contract selection, trick winner behavior, scoring, mark awards, replay, and redaction without rebuilding hands inline.

This refactor should not rename phases yet. The existing `"trump"` phase and `fortyTwo.trump.called` event can remain as compatibility names until a real variant requires a more generic `"contract"` phase.

## Tests Required Before The First Variant

Required behavior-preservation tests:

- Existing standard numeric bidding, trump, trick, scoring, command, replay, local-session, and multiplayer tests still pass.
- `Contract` union serializes and round-trips for the standard numeric contract.
- Runtime schemas reject unknown contract kinds and malformed trump selections.
- Standard numeric `TRUMP_CALLED` events replay to the same `trickPlay` state after the union refactor.
- Standard numeric full-hand integration tests still prove total hand points equal 42 and marks are awarded exactly as before.

Required config-safety tests:

- Standard rules expose all variant flags as disabled.
- Game creation rejects or explicitly normalizes unsupported enabled variant flags.
- `allPassBehavior: "redeal"` is rejected or covered as unsupported until redeal behavior exists.
- `maximumNumericBid`, `minimumBid`, `handTotalPoints`, `tricksPerHand`, and `targetMarks` are honored from `RuleConfig` where they are claimed to be configurable.

Required contract/trick tests:

- Every pip trump suit still identifies trump correctly.
- Double-high trump ranking still holds for every pip trump suit.
- Trump dominoes still belong only to trump under default rules.
- No-trump and follow-me actions are rejected while unsupported.
- Unsupported special contract bids are rejected while their flags are disabled.
- Legal-action selectors never expose unsupported contracts.

Required scoring/replay tests:

- Hand scoring is driven by contract kind for standard numeric.
- Made exact, made over target, and set-by-one still work through command-emitted events.
- Forged accepted events with unsupported contract kinds fail validated replay.
- Public multiplayer snapshots never leak contract-private data if future contracts add hidden declarations or partner choices.

Required fixture/simulation tests:

- Shared fixture helpers can create deterministic dealt hands without duplicating dominoes.
- At least one command-layer complete hand fixture proves standard numeric behavior after the refactor.
- Local bot simulations still complete hands and games using legal actions only.

## Recommended First Variant After Refactor

No variant should be implemented until the union and schema work above is complete.

After that, the safest first variant is no-trump because it mostly removes trump ranking instead of introducing eligibility, partner choice, inverted scoring, or multi-mark awards. Even then, it should be implemented behind `RuleConfig.enabledContracts` with disabled-by-default behavior and full command/replay/schema tests.

Do not start with nello, splash, plunge, or sevens. Those need product-rule clarification in addition to engine architecture work.
