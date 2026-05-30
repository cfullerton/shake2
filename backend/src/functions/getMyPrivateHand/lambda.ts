import {
  createDeployedMultiplayerStore
} from "../shared/deployed-runtime.ts";
import {
  type AppSyncPrivateHandResponse
} from "../../appsync/contracts.ts";
import {
  createGetMyPrivateHandHandler
} from "./handler.ts";
import {
  type AppSyncResolverEvent
} from "../shared/appsync-input.ts";

const getMyPrivateHand = createGetMyPrivateHandHandler({
  store: createDeployedMultiplayerStore()
});

export async function handler(
  event: AppSyncResolverEvent
): Promise<AppSyncPrivateHandResponse> {
  return getMyPrivateHand(event);
}
