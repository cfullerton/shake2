import {
  toPublicGameSnapshot,
  type AppSyncPublicGameSnapshot
} from "../../appsync/contracts.ts";
import { extractBackendActor } from "../../auth/identity.ts";
import {
  createUnimplementedMultiplayerStore,
  type MultiplayerStore
} from "../../dynamodb/store.ts";
import {
  parseArguments,
  parseNonEmptyString,
  type AppSyncResolverEvent
} from "../shared/appsync-input.ts";

export interface GetGameSnapshotHandlerDependencies {
  readonly store: MultiplayerStore;
}

export type GetGameSnapshotHandler = (
  event: AppSyncResolverEvent
) => Promise<AppSyncPublicGameSnapshot>;

export function createGetGameSnapshotHandler(
  dependencies: GetGameSnapshotHandlerDependencies
): GetGameSnapshotHandler {
  return async (event) => {
    extractBackendActor(event.identity);

    const args = parseArguments(event, "getGameSnapshot");
    const gameId = parseNonEmptyString(args.gameId, "getGameSnapshot.gameId");
    const snapshot = await dependencies.store.loadPublicSnapshot({
      gameId
    });

    return toPublicGameSnapshot(snapshot.payload);
  };
}

export const getGameSnapshotHandler = createGetGameSnapshotHandler({
  store: createUnimplementedMultiplayerStore()
});
