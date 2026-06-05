# Texas 42 Rules Spec

## Scope

This document defines the default rules for standard four-player partnership Texas 42.

The app must separate standard rules from regional variants. The engine should make variants explicit through configuration rather than hidden conditionals.

## Game Setup

- Four players.
- Two teams.
- Partners sit across from each other.
- Standard double-six domino set.
- 28 total dominoes.
- Each player receives 7 dominoes.
- No boneyard.
- One hand contains 7 tricks.

## Seat Model

Seats are clockwise:

```text
Seat 0: Team A
Seat 1: Team B
Seat 2: Team A
Seat 3: Team B
```

Dealer rotates clockwise each hand.

Bid order starts with the player clockwise after dealer.

## Domino Model

A domino is an unordered pair:

```ts
type Pip = 0 | 1 | 2 | 3 | 4 | 5 | 6;

type Domino = {
  high: Pip;
  low: Pip;
};
```

Normalize dominoes so `high >= low`.

Examples:

- `6-4` belongs to the 6 suit and 4 suit.
- `5-5` is a double and belongs to the 5 suit.
- `0-0` is the blank double.

## Count Dominoes

The five count dominoes are:

| Domino | Points |
|---|---:|
| 0-5 | 5 |
| 1-4 | 5 |
| 2-3 | 5 |
| 5-5 | 10 |
| 4-6 | 10 |

Total count points: 35.

Each trick is worth 1 point.

Total hand value:

```text
35 count points + 7 trick points = 42
```

Invariant:

```ts
sum(handPointsByTeam) === 42
```

## Bidding

Default minimum bid: 30.

Players may pass or bid above the current bid.

Default all-pass behavior:

```text
Dealer forced to bid 30
```

Configuration must allow redeal as a future option.

Bid model:

```ts
type NumericBid = {
  kind: "numeric";
  amount: number; // 30-42
};

type MarkBid = {
  kind: "marks";
  marks: number;
};

type BidCall = NumericBid | MarkBid | { kind: "pass" };
```

For M2/M3, implement numeric bids only.

Mark bids, 84, plunge, splash, sevens, and nello should be variant extensions.

## Declarer

The highest bidder becomes declarer.

Declarer chooses contract/trump and leads the first trick.

## Suits

Each pip can be a suit:

```text
blank, one, two, three, four, five, six
```

A non-double belongs to two suits.

When a non-trump domino is led, the leader must specify which suit is being led if the domino has two suits.

Example:

```text
6-4 may be led as sixes or fours unless sixes/fours are trump according to variant behavior.
```

## Trump

Default trump is one pip suit chosen by declarer.

If trump is sixes, all dominoes containing 6 are trump:

```text
6-6, 6-5, 6-4, 6-3, 6-2, 6-1, 6-0
```

Default trump rank high to low:

```text
6-6 > 6-5 > 6-4 > 6-3 > 6-2 > 6-1 > 6-0
```

A trump domino is treated as trump, not as its other suit, when following non-trump suit.

## Follow Suit

Players must follow the led suit if able.

If unable to follow suit, a player may play any domino.

A player with trump only is not considered able to follow a non-trump suit unless a domino also legally belongs to the led non-trump suit under the selected variant. Default: trump identity wins; trump dominoes are trump.

## Trick Winner

A trick is won by:

1. Highest trump played, if any.
2. Otherwise highest domino of the led suit.

The winner leads the next trick.

## Hand Scoring

At hand end:

- Each trick captured adds 1 point.
- Count dominoes captured add their count value.
- Points are summed by team.
- If the bidding team reaches or exceeds its bid, it makes the contract.
- Otherwise it is set.

## Mark Scoring

Default game target: 7 marks.

Default mark behavior:

- Successful numeric bid: bidding team earns 1 mark.
- Failed numeric bid: opposing team earns 1 mark.

Future config may support point scoring or mark values based on bid type.

## Rule Variants

Represent variants explicitly:

```ts
type RuleConfig = {
  schemaVersion: 1;
  scoringMode: "marks";
  targetMarks: number;
  handCompletionMode: "playAllTricks" | "allowConcession" | "autoEndWhenDecided";
  minimumBid: number;
  allPassBehavior: "dealerForcedBid" | "redeal";
  enabledContracts: {
    followMe: boolean;
    nello: boolean;
    sevens: boolean;
    splash: boolean;
    plunge: boolean;
    markBids: boolean;
    eightyFour: boolean;
  };
  trumpBehavior: {
    doublesHigh: boolean;
    trumpDominoBelongsOnlyToTrump: boolean;
  };
};
```

Default:

```ts
const standardRules: RuleConfig = {
  schemaVersion: 1,
  scoringMode: "marks",
  targetMarks: 7,
  handCompletionMode: "playAllTricks",
  minimumBid: 30,
  allPassBehavior: "dealerForcedBid",
  enabledContracts: {
    followMe: false,
    nello: false,
    sevens: false,
    splash: false,
    plunge: false,
    markBids: false,
    eightyFour: false
  },
  trumpBehavior: {
    doublesHigh: true,
    trumpDominoBelongsOnlyToTrump: true
  }
};
```

## Required Edge Case Tests

- Exactly 28 unique dominoes generated.
- Four players receive 7 dominoes each.
- Count domino total is 35.
- Trick points total 7.
- Full hand total is 42.
- Dealer rotates after hand.
- Bid order starts after dealer.
- All-pass dealer-forced bid.
- Made bid exactly.
- Set by one point.
- Trump beats led suit.
- Highest led suit wins when no trump.
- Player cannot slough when holding led suit.
- Trump domino cannot be used as non-trump suit under default config.
- Last trick can capture count dominoes.
- Replaying same event sequence produces same result.
