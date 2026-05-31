import {
  type AppSyncSubmitGameActionResult,
  mapSubmitGameActionHandlerResponse
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
  createStartNextHandHandler,
  type StartNextHandHandler
} from "../rooms/handler.ts";

export type StartNextHandLambdaHandler = (
  event: AppSyncResolverEvent
) => Promise<AppSyncSubmitGameActionResult>;

let deployedHandler: StartNextHandLambdaHandler | null = null;

export async function handler(
  event: AppSyncResolverEvent
): Promise<AppSyncSubmitGameActionResult> {
  return getDeployedHandler()(event);
}

export function createStartNextHandLambdaHandler(
  startNextHand: StartNextHandHandler
): StartNextHandLambdaHandler {
  return async (event) =>
    mapSubmitGameActionHandlerResponse(await startNextHand(event));
}

function getDeployedHandler(): StartNextHandLambdaHandler {
  deployedHandler ??= createStartNextHandLambdaHandler(
    createStartNextHandHandler({
      engineContext: createDeployedEngineContext(),
      resolverContext: createDeployedResolverContext(),
      store: createDeployedMultiplayerStore()
    })
  );

  return deployedHandler;
}
