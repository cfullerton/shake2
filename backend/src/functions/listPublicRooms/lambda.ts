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
  createListPublicRoomsHandler
} from "../rooms/handler.ts";

const listPublicRooms = createListPublicRoomsHandler({
  store: createDeployedMultiplayerStore()
});

export async function handler(
  event: AppSyncResolverEvent
): Promise<readonly AppSyncRoomView[]> {
  return listPublicRooms(event);
}
