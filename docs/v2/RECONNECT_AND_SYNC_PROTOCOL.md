# Reconnect and Sync Protocol

## Problem

Mobile apps lose realtime connectivity frequently. The app must handle backgrounding, OS suspension, phone calls, rural signal, duplicate retry, and subscription disconnects.

## Client State

```ts
type ClientSyncState = {
  gameId: string;
  lastAppliedEventSequence: number;
  snapshotVersion: number;
  connectionStatus: "connected" | "reconnecting" | "offline";
  pendingActions: GameActionEnvelope[];
};
```

## On App Resume

1. Mark state as reconnecting.
2. Fetch latest snapshot.
3. Compare `lastEventSequence`.
4. Replace local game view with authoritative snapshot.
5. Clear accepted pending actions.
6. Resubmit safe pending actions if idempotency keys exist.
7. Resume subscription.

## Event Gap Detection

If client receives event sequence 15 but last applied is 13, event 14 was missed. Stop applying realtime events, fetch latest snapshot, then resume.

Current mobile baseline: active multiplayer games inspect `onGameUpdated` safe event summaries. If a live payload advances beyond the current sequence and those summaries do not bridge every missing sequence, the app calls `getReconnectView` and replaces local public/private state with the authoritative response.

## Optimistic UI

Allowed for button spinners and temporary previews. Not allowed as final truth for trick winner, hand score, mark award, or next dealer.
