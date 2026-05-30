# Action / Event / Snapshot Contract

## Purpose

This document defines the shared contract between mobile, rules engine, and future backend.

## Conceptual Model

- Action: a request from a client or local user.
- Event: an accepted immutable fact.
- Snapshot: materialized state after applying events.
- Sequence: monotonically increasing server-side event order.

## Action Envelope

```ts
type GameActionEnvelope<TAction> = {
  schemaVersion: 1;
  actionId: string;
  gameId: string;
  actorId: string;
  actorSeat?: SeatIndex;
  clientCreatedAt: string;
  knownSnapshotVersion?: number;
  knownLastEventSequence?: number;
  action: TAction;
};
```

## Event Envelope

```ts
type GameEventEnvelope<TEvent> = {
  schemaVersion: 1;
  eventId: string;
  gameId: string;
  sequence: number;
  serverCreatedAt: string;
  actorId: string;
  actorSeat?: SeatIndex;
  causationActionId?: string;
  event: TEvent;
};
```

## Snapshot Envelope

```ts
type GameSnapshotEnvelope<TSnapshot> = {
  schemaVersion: 1;
  gameId: string;
  snapshotVersion: number;
  lastEventSequence: number;
  generatedAt: string;
  snapshot: TSnapshot;
};
```

## Scorekeeper Actions

```ts
type ScorekeeperAction =
  | { type: "CREATE_SCOREKEEPER_GAME"; payload: CreateGameInput }
  | { type: "AWARD_MARKS"; payload: AwardMarksInput }
  | { type: "UNDO_LAST_HAND"; payload: { gameId: string } }
  | { type: "ARCHIVE_GAME"; payload: { gameId: string } }
  | { type: "DELETE_GAME"; payload: { gameId: string } };
```

## Full 42 Actions

```ts
type FortyTwoAction =
  | { type: "CREATE_ROOM"; payload: CreateRoomInput }
  | { type: "JOIN_ROOM"; payload: JoinRoomInput }
  | { type: "TAKE_SEAT"; payload: TakeSeatInput }
  | { type: "START_GAME"; payload: StartGameInput }
  | { type: "SUBMIT_BID"; payload: SubmitBidInput }
  | { type: "CALL_TRUMP"; payload: CallTrumpInput }
  | { type: "PLAY_DOMINO"; payload: PlayDominoInput }
  | { type: "REQUEST_UNDO"; payload: RequestUndoInput }
  | { type: "CONCEDE_HAND"; payload: ConcedeHandInput };
```

## Full 42 Events

```ts
type FortyTwoEvent =
  | { type: "ROOM_CREATED"; payload: RoomCreated }
  | { type: "PLAYER_JOINED"; payload: PlayerJoined }
  | { type: "SEAT_TAKEN"; payload: SeatTaken }
  | { type: "GAME_STARTED"; payload: GameStarted }
  | { type: "HAND_DEALT"; payload: HandDealt }
  | { type: "BID_SUBMITTED"; payload: BidSubmitted }
  | { type: "BIDDING_COMPLETED"; payload: BiddingCompleted }
  | { type: "TRUMP_CALLED"; payload: TrumpCalled }
  | { type: "DOMINO_PLAYED"; payload: DominoPlayed }
  | { type: "TRICK_COMPLETED"; payload: TrickCompleted }
  | { type: "HAND_COMPLETED"; payload: HandCompleted }
  | { type: "GAME_COMPLETED"; payload: FortyTwoGameCompleted };
```

## Idempotency

The server must reject duplicate action IDs or return the previously accepted result.

Client may safely retry an action when network status is unknown.

## Stale Clients

If `knownLastEventSequence` is behind the server, the server may accept if the action is still valid, but should reject with `STALE_ACTION` if state-dependent assumptions are wrong.

## Ordering

Only the server assigns event sequence numbers. Clients must not infer truth from local event order.
