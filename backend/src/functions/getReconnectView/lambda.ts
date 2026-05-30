import {
  createDeployedMultiplayerStore
} from "../shared/deployed-runtime.ts";
import {
  type AppSyncReconnectView
} from "../../appsync/contracts.ts";
import {
  createGetReconnectViewHandler
} from "./handler.ts";
import {
  type AppSyncResolverEvent
} from "../shared/appsync-input.ts";

const getReconnectView = createGetReconnectViewHandler({
  store: createDeployedMultiplayerStore()
});

export async function handler(
  event: AppSyncResolverEvent
): Promise<AppSyncReconnectView> {
  return getReconnectView(event);
}
