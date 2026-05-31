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
  createGetRoomHandler
} from "../rooms/handler.ts";

const getRoom = createGetRoomHandler({
  store: createDeployedMultiplayerStore()
});

export async function handler(
  event: AppSyncResolverEvent
): Promise<AppSyncRoomView> {
  return getRoom(event);
}
