import { App } from "aws-cdk-lib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createMultiplayerInfrastructureConfig,
  createResourceName
} from "./config/multiplayer-config.ts";
import {
  MultiplayerInfrastructureStack
} from "./stacks/multiplayer-infrastructure-stack.ts";

const app = new App();
const stage = app.node.tryGetContext("stage")?.toString() ?? "dev";
const config = createMultiplayerInfrastructureConfig(stage);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

new MultiplayerInfrastructureStack(
  app,
  createResourceName(config, "multiplayer-infra"),
  {
    config,
    description: "Shake2 multiplayer development infrastructure",
    repoRoot
  }
);
