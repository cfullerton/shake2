import { CommonActions } from "@react-navigation/native";
import {
  awardMarks as awardGameMarks,
  createScorekeeperGame,
  type ScorekeeperGame
} from "@shake2/game-engine";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

import { useGameStore } from "../../state/GameStore";
import { HistoryScreen } from "../HistoryScreen";
import { NewGameScreen } from "../NewGameScreen";
import { ScorekeeperScreen } from "../ScorekeeperScreen";
import { TeamSetupScreen } from "../TeamSetupScreen";

jest.mock("../../state/GameStore", () => ({
  useGameStore: jest.fn()
}));

type StoreValue = ReturnType<typeof useGameStore>;

const mockUseGameStore = useGameStore as jest.MockedFunction<typeof useGameStore>;
const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

beforeEach(() => {
  jest.clearAllMocks();
  mockUseGameStore.mockReset();
});

describe("NewGameScreen", () => {
  it("blocks invalid target marks before navigation", () => {
    const navigation = { navigate: jest.fn() };
    const view = render(
      <NewGameScreen navigation={navigation as never} route={{} as never} />
    );

    fireEvent.changeText(view.getByDisplayValue("7"), "0");
    fireEvent.press(view.getByText("Continue"));

    expect(alertSpy).toHaveBeenCalledWith(
      "Check target marks",
      "Target marks must be a positive whole number."
    );
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it("opens team setup with a normalized game name and selected dealer", () => {
    const navigation = { navigate: jest.fn() };
    const view = render(
      <NewGameScreen navigation={navigation as never} route={{} as never} />
    );

    fireEvent.changeText(view.getByDisplayValue("Friday Night 42"), "   ");
    fireEvent.press(view.getByText("East"));
    fireEvent.press(view.getByText("Continue"));

    expect(navigation.navigate).toHaveBeenCalledWith("TeamSetup", {
      dealer: "east",
      name: "Texas 42",
      targetMarks: 7
    });
  });
});

describe("TeamSetupScreen", () => {
  it("creates a game from default team and player names", async () => {
    const createGame = jest.fn().mockResolvedValue({ id: "game-created" });
    const navigation = { dispatch: jest.fn() };

    mockUseGameStore.mockReturnValue(
      buildStore({
        createGame
      })
    );

    const view = render(
      <TeamSetupScreen
        navigation={navigation as never}
        route={
          {
            params: {
              dealer: "south",
              name: "League Night",
              targetMarks: 9
            }
          } as never
        }
      />
    );

    fireEvent.press(view.getByText("Create Game"));

    await waitFor(() => {
      expect(createGame).toHaveBeenCalledWith({
        dealer: "south",
        name: "League Night",
        playerNames: {
          east: "East",
          north: "North",
          south: "South",
          west: "West"
        },
        targetMarks: 9,
        teamNames: {
          eastWest: "East / West",
          northSouth: "North / South"
        }
      });
    });

    expect(navigation.dispatch).toHaveBeenCalledWith(
      CommonActions.reset({
        index: 1,
        routes: [
          { name: "Home" },
          {
            name: "Scorekeeper",
            params: {
              gameId: "game-created"
            }
          }
        ]
      })
    );
  });
});

describe("ScorekeeperScreen", () => {
  it("shows the current dealer and submits a mark award", async () => {
    const game = createTestGame();
    const awardMarks = jest.fn().mockResolvedValue(undefined);
    const navigation = { navigate: jest.fn() };

    mockUseGameStore.mockReturnValue(
      buildStore({
        awardMarks,
        findGame: () => game
      })
    );

    const view = render(
      <ScorekeeperScreen
        navigation={navigation as never}
        route={{ params: { gameId: game.id } } as never}
      />
    );

    expect(view.getByText("Nora")).toBeTruthy();
    fireEvent.press(view.getByText("Add to Nora / Sam"));

    await waitFor(() => {
      expect(awardMarks).toHaveBeenCalledWith(game.id, "northSouth", 1, "");
    });

    fireEvent.press(view.getByText("History"));
    expect(navigation.navigate).toHaveBeenCalledWith("History", { gameId: game.id });
  });

  it("enables undo after a hand and reflects dealer rotation", async () => {
    const game = awardGameMarks(createTestGame(), {
      createdAt: "2026-05-29T12:05:00.000Z",
      id: "score-1",
      marks: 1,
      note: "Opening hand",
      teamId: "northSouth"
    });
    const undoLastScore = jest.fn().mockResolvedValue(undefined);

    mockUseGameStore.mockReturnValue(
      buildStore({
        findGame: () => game,
        undoLastScore
      })
    );

    const view = render(
      <ScorekeeperScreen
        navigation={{ navigate: jest.fn() } as never}
        route={{ params: { gameId: game.id } } as never}
      />
    );

    expect(view.getByText("Eli")).toBeTruthy();
    fireEvent.press(view.getByText("Undo"));

    await waitFor(() => {
      expect(undoLastScore).toHaveBeenCalledWith(game.id);
    });
  });
});

describe("HistoryScreen", () => {
  it("renders hand history with the hand dealer and supports undo", async () => {
    const game = awardGameMarks(createTestGame(), {
      createdAt: "2026-05-29T12:05:00.000Z",
      id: "score-1",
      marks: 2,
      note: "Opening hand",
      teamId: "northSouth"
    });
    const undoLastScore = jest.fn().mockResolvedValue(undefined);

    mockUseGameStore.mockReturnValue(
      buildStore({
        findGame: () => game,
        undoLastScore
      })
    );

    const view = render(
      <HistoryScreen
        navigation={{} as never}
        route={{ params: { gameId: game.id } } as never}
      />
    );

    expect(view.getByText("Hand 1")).toBeTruthy();
    expect(view.getByText("Dealer: Nora (North)")).toBeTruthy();
    expect(view.getByText("Opening hand")).toBeTruthy();

    fireEvent.press(view.getByText("Undo Latest"));

    await waitFor(() => {
      expect(undoLastScore).toHaveBeenCalledWith(game.id);
    });
  });
});

function buildStore(overrides: Partial<StoreValue> = {}): StoreValue {
  return {
    awardMarks: jest.fn().mockResolvedValue(undefined),
    createGame: jest.fn(),
    error: null,
    findGame: jest.fn(),
    games: [],
    loading: false,
    undoLastScore: jest.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

function createTestGame(): ScorekeeperGame {
  return createScorekeeperGame({
    createdAt: "2026-05-29T12:00:00.000Z",
    dealer: "north",
    id: "game-flow-test",
    name: "Test Table",
    playerNames: {
      east: "Eli",
      north: "Nora",
      south: "Sam",
      west: "Wade"
    },
    targetMarks: 7,
    teamNames: {
      eastWest: "Eli / Wade",
      northSouth: "Nora / Sam"
    }
  });
}
