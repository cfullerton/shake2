import assert from "node:assert/strict";
import test from "node:test";

import {
  PutCommand,
  TransactWriteCommand
} from "@aws-sdk/lib-dynamodb";

import {
  seedDeployedSmokeGame
} from "./deployed-seed.ts";

test("seeds a ready room then commits a game-start transaction", async () => {
  const client = createRecordingClient();
  const seed = await seedDeployedSmokeGame({
    actorPlayerId: "actor-sub",
    client,
    gameId: "smoke-game-1",
    roomCode: "SMOKE1",
    roomGameIdIndexName: "GameIdIndex",
    roomId: "smoke-room-1",
    tableName: "Shake2Multiplayer"
  });

  assert.equal(seed.gameId, "smoke-game-1");
  assert.equal(seed.roomId, "smoke-room-1");
  assert.equal(seed.actorPlayerId, "actor-sub");
  assert.equal(seed.actorSeat, 1);
  assert.equal(seed.actorSeatEnum, "SEAT_1");
  assert.equal(seed.action.actorId, "actor-sub");
  assert.equal(seed.action.actorSeat, 1);
  assert.equal(seed.action.action.payload.seat, 1);
  assert.deepEqual(seed.action.action.payload.bid, {
    kind: "pass"
  });
  assert.equal(seed.lastEventSequence, 2);
  assert.equal(seed.snapshotVersion, 2);
  assert.equal(client.commands.length, 2);
  assert.ok(client.commands[0] instanceof PutCommand);
  assert.ok(client.commands[1] instanceof TransactWriteCommand);
});

test("seeded ready-room write is conditional and game-start records are separated", async () => {
  const client = createRecordingClient();

  await seedDeployedSmokeGame({
    actorPlayerId: "actor-sub",
    client,
    gameId: "smoke-game-2",
    roomGameIdIndexName: "GameIdIndex",
    tableName: "Shake2Multiplayer"
  });

  const readyRoomPut = client.commands[0] as PutCommand;
  const transaction = client.commands[1] as TransactWriteCommand;
  const readyRoom = readyRoomPut.input.Item;
  const items = transaction.input.TransactItems?.map((item) => item.Put?.Item) ?? [];
  const publicSnapshot = items.find((item) => item?.sk === "SNAPSHOT#LATEST");
  const privateHands = items.filter((item) =>
    typeof item?.sk === "string" && item.sk.startsWith("PRIVATE_HAND#")
  );
  const serializedPublicSnapshot = JSON.stringify(publicSnapshot);

  assert.equal(readyRoomPut.input.ConditionExpression, "attribute_not_exists(#pk) AND attribute_not_exists(#sk)");
  assert.equal(readyRoom?.status, "ready");
  assert.equal(readyRoom?.gameId, undefined);
  assert.equal(publicSnapshot?.gameId, "smoke-game-2");
  assert.equal(privateHands.length, 4);
  assert.doesNotMatch(serializedPublicSnapshot, /"hands"/);
  assert.doesNotMatch(serializedPublicSnapshot, /"viewerHand"/);
  assert.match(serializedPublicSnapshot, /"handCounts"/);
});

test("seeded smoke action is JSON encoded for AppSync AWSJSON input", async () => {
  const client = createRecordingClient();
  const seed = await seedDeployedSmokeGame({
    actionId: "smoke-action-1",
    actorPlayerId: "actor-sub",
    client,
    gameId: "smoke-game-3",
    roomGameIdIndexName: "GameIdIndex",
    tableName: "Shake2Multiplayer"
  });
  const parsed = JSON.parse(seed.actionJson) as typeof seed.action;

  assert.equal(parsed.actionId, "smoke-action-1");
  assert.equal(parsed.actorId, "actor-sub");
  assert.equal(parsed.actorSeat, 1);
  assert.equal(parsed.knownLastEventSequence, seed.lastEventSequence);
  assert.equal(parsed.knownSnapshotVersion, seed.snapshotVersion);
});

function createRecordingClient(): {
  readonly commands: unknown[];
  readonly send: (command: unknown) => Promise<unknown>;
} {
  const commands: unknown[] = [];

  return {
    commands,
    async send(command: unknown): Promise<unknown> {
      commands.push(command);

      return {};
    }
  };
}
