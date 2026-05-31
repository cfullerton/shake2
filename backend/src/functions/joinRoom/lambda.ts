import {
  type AppSyncRoomView
} from "../../appsync/contracts.ts";
import {
  createDeployedEngineContext,
  createDeployedMultiplayerStore
} from "../shared/deployed-runtime.ts";
import {
  type AppSyncResolverEvent
} from "../shared/appsync-input.ts";
import {
  createJoinRoomHandler
} from "../rooms/handler.ts";

const joinRoom = createJoinRoomHandler({
  engineContext: createDeployedEngineContext(),
  store: createDeployedMultiplayerStore()
});

export async function handler(
  event: AppSyncResolverEvent
): Promise<AppSyncRoomView> {
  return joinRoom(event);
}
