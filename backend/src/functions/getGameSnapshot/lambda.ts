import {
  createDeployedMultiplayerStore
} from "../shared/deployed-runtime.ts";
import {
  type AppSyncPublicGameSnapshot
} from "../../appsync/contracts.ts";
import {
  createGetGameSnapshotHandler
} from "./handler.ts";
import {
  type AppSyncResolverEvent
} from "../shared/appsync-input.ts";

const getGameSnapshot = createGetGameSnapshotHandler({
  store: createDeployedMultiplayerStore()
});

export async function handler(
  event: AppSyncResolverEvent
): Promise<AppSyncPublicGameSnapshot> {
  return getGameSnapshot(event);
}
