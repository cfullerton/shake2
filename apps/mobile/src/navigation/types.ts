import type { PlayerSeat } from "@shake2/game-engine";

export type RootStackParamList = {
  Home: undefined;
  LocalGame: {
    targetMarks: number;
  };
  LocalGameStart: undefined;
  LearnGame: undefined;
  NewGame: undefined;
  TeamSetup: {
    dealer: PlayerSeat;
    name: string;
    targetMarks: number;
  };
  Scorekeeper: {
    gameId: string;
  };
  History: {
    gameId: string;
  };
};
