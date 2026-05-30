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
  createSubmitGameActionHandler,
  type SubmitGameActionHandler
} from "./handler.ts";
import {
  type SubmitGameActionAppSyncEvent
} from "../../types/index.ts";

export type SubmitGameActionLambdaHandler = (
  event: SubmitGameActionAppSyncEvent
) => Promise<AppSyncSubmitGameActionResult>;

let deployedHandler: SubmitGameActionLambdaHandler | null = null;

export async function handler(
  event: SubmitGameActionAppSyncEvent
): Promise<AppSyncSubmitGameActionResult> {
  return getDeployedHandler()(event);
}

export function createSubmitGameActionLambdaHandler(
  submitGameAction: SubmitGameActionHandler
): SubmitGameActionLambdaHandler {
  return async (event) =>
    mapSubmitGameActionHandlerResponse(await submitGameAction(event));
}

function getDeployedHandler(): SubmitGameActionLambdaHandler {
  deployedHandler ??= createSubmitGameActionLambdaHandler(
    createSubmitGameActionHandler({
      engineContext: createDeployedEngineContext(),
      resolverContext: createDeployedResolverContext(),
      store: createDeployedMultiplayerStore()
    })
  );

  return deployedHandler;
}
