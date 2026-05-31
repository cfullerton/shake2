import {
  type AppSyncStartGameResult
} from "../../appsync/contracts.ts";
import {
  createDeployedEngineContext,
  createDeployedMultiplayerStore,
  createDeployedResolverContext
} from "../shared/deployed-runtime.ts";
import {
  type AppSyncResolverEvent
} from "../shared/appsync-input.ts";
import {
  createStartGameHandler
} from "../rooms/handler.ts";

const startGame = createStartGameHandler({
  engineContext: createDeployedEngineContext(),
  resolverContext: createDeployedResolverContext(),
  store: createDeployedMultiplayerStore()
});

export async function handler(
  event: AppSyncResolverEvent
): Promise<AppSyncStartGameResult> {
  return startGame(event);
}
