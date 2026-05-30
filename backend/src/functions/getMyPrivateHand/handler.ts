import {
  mapGetMyPrivateHandInputToStoreRequest,
  mapPrivateHandRecordToAppSyncResponse,
  type AppSyncGetMyPrivateHandInput,
  type AppSyncPrivateHandResponse
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
  parseSeatIndex,
  type AppSyncResolverEvent
} from "../shared/appsync-input.ts";

export interface GetMyPrivateHandHandlerDependencies {
  readonly store: MultiplayerStore;
}

export type GetMyPrivateHandHandler = (
  event: AppSyncResolverEvent
) => Promise<AppSyncPrivateHandResponse>;

export function createGetMyPrivateHandHandler(
  dependencies: GetMyPrivateHandHandlerDependencies
): GetMyPrivateHandHandler {
  return async (event) => {
    const actor = extractBackendActor(event.identity);
    const input = parseGetMyPrivateHandInput(event);
    const storeRequest = mapGetMyPrivateHandInputToStoreRequest(
      input,
      event.identity
    );
    const privateHand = await dependencies.store.loadPrivateHand({
      gameId: storeRequest.gameId,
      seatIndex: storeRequest.seatIndex
    });

    return mapPrivateHandRecordToAppSyncResponse(
      privateHand,
      actor,
      storeRequest.seatIndex
    );
  };
}

export const getMyPrivateHandHandler = createGetMyPrivateHandHandler({
  store: createUnimplementedMultiplayerStore()
});

function parseGetMyPrivateHandInput(
  event: AppSyncResolverEvent
): AppSyncGetMyPrivateHandInput {
  const args = parseArguments(event, "getMyPrivateHand");
  const input = parseInputObject(args.input, "getMyPrivateHand.input");

  return {
    gameId: parseNonEmptyString(input.gameId, "getMyPrivateHand.gameId"),
    seatIndex: parseSeatIndex(input.seatIndex, "getMyPrivateHand.seatIndex")
  };
}
