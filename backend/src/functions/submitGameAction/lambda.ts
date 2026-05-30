import {
  createDeployedEngineContext,
  createDeployedMultiplayerStore,
  createDeployedResolverContext
} from "../shared/deployed-runtime.ts";
import {
  createSubmitGameActionHandler
} from "./handler.ts";
import {
  type SubmitGameActionAppSyncEvent,
  type SubmitGameActionResponse
} from "../../types/index.ts";

const submitGameAction = createSubmitGameActionHandler({
  engineContext: createDeployedEngineContext(),
  resolverContext: createDeployedResolverContext(),
  store: createDeployedMultiplayerStore()
});

export async function handler(
  event: SubmitGameActionAppSyncEvent
): Promise<SubmitGameActionResponse> {
  return submitGameAction(event);
}
