import {
  type MultiplayerActionIdempotencyRecord,
  type MultiplayerDynamoDbTransactionWritePlan,
  type MultiplayerStoredGameRecords,
  type MultiplayerWritePlan
} from "../game-engine.ts";

export interface LoadGameSnapshotInput {
  readonly gameId: string;
}

export interface LoadIdempotencyResultInput {
  readonly actionId: string;
  readonly gameId: string;
}

export interface CommitWritePlanInput {
  readonly gameId: string;
  readonly transaction: MultiplayerDynamoDbTransactionWritePlan;
  readonly writePlan: MultiplayerWritePlan;
}

export interface MultiplayerStore {
  loadGameSnapshot(
    input: LoadGameSnapshotInput
  ): Promise<MultiplayerStoredGameRecords>;
  loadIdempotencyResult(
    input: LoadIdempotencyResultInput
  ): Promise<MultiplayerActionIdempotencyRecord | null>;
  commitWritePlan(input: CommitWritePlanInput): Promise<void>;
}

export function createUnimplementedMultiplayerStore(): MultiplayerStore {
  return {
    async loadGameSnapshot(): Promise<MultiplayerStoredGameRecords> {
      throw new Error("MultiplayerStore.loadGameSnapshot is not implemented.");
    },
    async loadIdempotencyResult(): Promise<MultiplayerActionIdempotencyRecord | null> {
      throw new Error("MultiplayerStore.loadIdempotencyResult is not implemented.");
    },
    async commitWritePlan(): Promise<void> {
      throw new Error("MultiplayerStore.commitWritePlan is not implemented.");
    }
  };
}
