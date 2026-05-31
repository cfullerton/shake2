import {
  type AppSyncRoomView
} from "../../appsync/contracts.ts";
import {
  createDeployedMultiplayerStore
} from "../shared/deployed-runtime.ts";
import {
  type AppSyncResolverEvent
} from "../shared/appsync-input.ts";
import {
  createGetRoomByCodeHandler
} from "../rooms/handler.ts";

const getRoomByCode = createGetRoomByCodeHandler({
  store: createDeployedMultiplayerStore()
});

export async function handler(
  event: AppSyncResolverEvent
): Promise<AppSyncRoomView> {
  return getRoomByCode(event);
}
