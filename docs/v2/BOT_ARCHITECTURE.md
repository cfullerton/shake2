# Bot Architecture

## Goal

Bots should use the same legal-action engine as human players and never bypass validation.

## Bot V1 — Legal Random

- Bids conservatively or passes.
- Plays a random legal domino.
- Always obeys rules.

Purpose: test full hand flow.

## Bot V2 — Basic Heuristic

Bidding: estimate hand strength from doubles, trump concentration, and count dominoes.

Playing: follow suit, win when useful, save trump if partner is winning, dump count when partner likely wins.

## API

```ts
type BotDecisionInput = {
  snapshot: FortyTwoSnapshot;
  seat: SeatIndex;
  legalActions: FortyTwoAction[];
  difficulty: "random" | "basic" | "advanced";
};

type BotDecision = {
  action: FortyTwoAction;
  explanation?: string;
};
```

## Tests

- Bot only returns legal actions.
- Bot completes 1,000 simulated hands without engine rejection.
- Bot cannot see hidden hands except its own.
- Bot is deterministic under fixed seed.
