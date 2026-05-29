import type { PropsWithChildren } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import {
  awardMarks as awardGameMarks,
  createScorekeeperGame,
  undoLastScore as undoGameScore,
  type PlayerSeat,
  type ScorekeeperGame,
  type TeamId
} from "@shake2/game-engine";

import { loadPersistedGames, savePersistedGames } from "../storage/gameStorage";

export interface NewGameDraft {
  readonly dealer: PlayerSeat;
  readonly name: string;
  readonly playerNames: Record<PlayerSeat, string>;
  readonly targetMarks: number;
  readonly teamNames: Record<TeamId, string>;
}

interface GameStoreValue {
  readonly awardMarks: (
    gameId: string,
    teamId: TeamId,
    marks: number,
    note: string
  ) => Promise<void>;
  readonly createGame: (draft: NewGameDraft) => Promise<ScorekeeperGame>;
  readonly error: string | null;
  readonly findGame: (gameId: string) => ScorekeeperGame | undefined;
  readonly games: readonly ScorekeeperGame[];
  readonly loading: boolean;
  readonly undoLastScore: (gameId: string) => Promise<void>;
}

const GameContext = createContext<GameStoreValue | null>(null);

export function GameProvider({ children }: PropsWithChildren) {
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<readonly ScorekeeperGame[]>([]);
  const [loading, setLoading] = useState(true);
  const gamesRef = useRef<readonly ScorekeeperGame[]>([]);

  useEffect(() => {
    let active = true;

    async function loadGames() {
      try {
        const savedGames = await loadPersistedGames();

        if (!active) {
          return;
        }

        gamesRef.current = savedGames;
        setGames(savedGames);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Saved games could not load.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadGames();

    return () => {
      active = false;
    };
  }, []);

  const commitGames = useCallback(
    async (
      updater: (currentGames: readonly ScorekeeperGame[]) => readonly ScorekeeperGame[]
    ) => {
      const nextGames = updater(gamesRef.current);
      gamesRef.current = nextGames;
      setGames(nextGames);

      try {
        await savePersistedGames(nextGames);
        setError(null);
      } catch (saveError) {
        const message =
          saveError instanceof Error ? saveError.message : "Saved games could not update.";
        setError(message);
        throw saveError;
      }
    },
    []
  );

  const createGame = useCallback(
    async (draft: NewGameDraft) => {
      const createdAt = new Date().toISOString();
      const game = createScorekeeperGame({
        createdAt,
        dealer: draft.dealer,
        id: createLocalId("game"),
        name: draft.name,
        playerNames: draft.playerNames,
        targetMarks: draft.targetMarks,
        teamNames: draft.teamNames
      });

      await commitGames((currentGames) => [game, ...currentGames]);
      return game;
    },
    [commitGames]
  );

  const awardMarks = useCallback(
    async (gameId: string, teamId: TeamId, marks: number, note: string) => {
      const createdAt = new Date().toISOString();
      const trimmedNote = note.trim();

      await commitGames((currentGames) =>
        currentGames.map((game) => {
          if (game.id !== gameId) {
            return game;
          }

          return awardGameMarks(game, {
            createdAt,
            id: createLocalId("score"),
            marks,
            teamId,
            ...(trimmedNote ? { note: trimmedNote } : {})
          });
        })
      );
    },
    [commitGames]
  );

  const undoLastScore = useCallback(
    async (gameId: string) => {
      await commitGames((currentGames) =>
        currentGames.map((game) =>
          game.id === gameId
            ? undoGameScore(game, { updatedAt: new Date().toISOString() })
            : game
        )
      );
    },
    [commitGames]
  );

  const findGame = useCallback(
    (gameId: string) => gamesRef.current.find((game) => game.id === gameId),
    []
  );

  const value = useMemo<GameStoreValue>(
    () => ({
      awardMarks,
      createGame,
      error,
      findGame,
      games,
      loading,
      undoLastScore
    }),
    [awardMarks, createGame, error, findGame, games, loading, undoLastScore]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGameStore(): GameStoreValue {
  const value = useContext(GameContext);

  if (!value) {
    throw new Error("useGameStore must be used within GameProvider.");
  }

  return value;
}

function createLocalId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
