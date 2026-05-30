import {
  mapGetReconnectViewInputToClientSyncState,
  mapReconnectRecordsToAppSyncResponse,
  type AppSyncGetReconnectViewInput,
  type AppSyncReconnectView
} from "../../appsync/contracts.ts";
import { extractBackendActor } from "../../auth/identity.ts";
import {
  createUnimplementedMultiplayerStore,
  type MultiplayerStore
} from "../../dynamodb/store.ts";
import {
  parseArguments,
  parseInputObject,
  parseNonEmptyString,
  parseNonNegativeInteger,
  parsePendingActionIds,
  type AppSyncResolverEvent
} from "../shared/appsync-input.ts";

export interface GetReconnectViewHandlerDependencies {
  readonly store: MultiplayerStore;
}

export type GetReconnectViewHandler = (
  event: AppSyncResolverEvent
) => Promise<AppSyncReconnectView>;

export function createGetReconnectViewHandler(
  dependencies: GetReconnectViewHandlerDependencies
): GetReconnectViewHandler {
  return async (event) => {
    const actor = extractBackendActor(event.identity);
    const input = parseGetReconnectViewInput(event);
    const clientState = mapGetReconnectViewInputToClientSyncState(input);
    const records = await dependencies.store.loadReconnectRecords({
      actorPlayerId: actor.playerId,
      gameId: input.gameId,
      pendingActionIds: input.pendingActionIds ?? []
    });

    return mapReconnectRecordsToAppSyncResponse(records, actor, clientState);
  };
}

export const getReconnectViewHandler = createGetReconnectViewHandler({
  store: createUnimplementedMultiplayerStore()
});

function parseGetReconnectViewInput(
  event: AppSyncResolverEvent
): AppSyncGetReconnectViewInput {
  const args = parseArguments(event, "getReconnectView");
  const input = parseInputObject(args.input, "getReconnectView.input");

  return {
    gameId: parseNonEmptyString(input.gameId, "getReconnectView.gameId"),
    lastAppliedEventSequence: parseNonNegativeInteger(
      input.lastAppliedEventSequence,
      "getReconnectView.lastAppliedEventSequence"
    ),
    pendingActionIds: parsePendingActionIds(
      input.pendingActionIds,
      "getReconnectView.pendingActionIds"
    ),
    snapshotVersion: parseNonNegativeInteger(
      input.snapshotVersion,
      "getReconnectView.snapshotVersion"
    )
  };
}
