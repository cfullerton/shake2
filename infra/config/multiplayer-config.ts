import { RemovalPolicy } from "aws-cdk-lib";

export interface MultiplayerInfrastructureConfig {
  readonly appName: string;
  readonly removalPolicy: RemovalPolicy;
  readonly roomGameIdIndexName: string;
  readonly stage: string;
}

export function createMultiplayerInfrastructureConfig(
  stage = "dev"
): MultiplayerInfrastructureConfig {
  return {
    appName: "shake2",
    removalPolicy: stage === "prod" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    roomGameIdIndexName: "GameIdIndex",
    stage
  };
}

export function createResourceName(
  config: Pick<MultiplayerInfrastructureConfig, "appName" | "stage">,
  name: string
): string {
  return `${config.appName}-${config.stage}-${name}`;
}
