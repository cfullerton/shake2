# Game State Model

Last reviewed: 2026-05-30

## Overview

Texas 42 game state in `@shake2/game-engine` is modeled as a serializable, replayable phase union (`FortyTwoState`) that moves through:

- `setup`
- `dealt`
- `bidding`
- `trump`
- `trickPlay`
- `handComplete`
- `gameComplete`

The state is designed for deterministic command/event replay and multiplayer-safe snapshots.

## Core Match Fields

All phases share match metadata such as:

- `id`
- `version`
- `mode` (`localPractice` or `multiplayer`)
- `rules`
- `dealer`
- `handNumber`
- `marks`
- `targetMarks`
- `seats` / `teams`
- `phase`

## Hand Lifecycle Data

- `dealt`: full `hands` and `deal` metadata
- `bidding`: `bidding` state with bids, highest bid, declarer, and completion status
- `trump`: `trump` call state with winning bid/declarer while waiting for contract selection
- `trickPlay`: `contract`, `currentTrick`, `completedTricks`, and remaining `hands`
- `handComplete`: finalized `completedTricks` plus computed `handScore`

## Contract Shape (Current)

Trick-play state now carries a serializable `contract` object (not just a bare trump suit assumption):

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

The `standardNumeric` and `noTrump` contract members are currently implemented. The discriminated union shape is in place to support future variants without rewriting core state/event boundaries.

## Behavioral Notes

- Contract-aware helpers are used for trump identity, legal led suits, trick-winner resolution, and mark awards.
- Hand scoring is contract-aware (`scoreCompletedHand(completedTricks, contract, rules)`), while preserving standard numeric behavior.
- Runtime validation checks contract shape and rejects unsupported contract kinds during validated replay and boundary parsing.

## Requirements

- Serializable
- Replayable
- Deterministic under accepted-event replay
- Server-authoritative compatible
- Supports reconnect-safe public/private multiplayer views
