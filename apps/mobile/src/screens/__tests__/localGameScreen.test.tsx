import { act, fireEvent, render } from "@testing-library/react-native";

import { LocalGameScreen } from "../LocalGameScreen";

describe("LocalGameScreen", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => { jest.runOnlyPendingTimers(); });
    jest.useRealTimers();
  });

  it("shows the human hand while bidding", () => {
    const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0.99);

    try {
      const view = render(
        <LocalGameScreen
          navigation={{} as never}
          route={{ params: { targetMarks: 7 } } as never}
        />
      );

      expect(view.getByText("Bidding")).toBeTruthy();
      expect(view.getByText("Your bid")).toBeTruthy();
      expect(view.getByText("Your hand")).toBeTruthy();
      expect(view.getByTestId("local-game-human-hand")).toBeTruthy();
      expect(view.getAllByLabelText(/^Domino \d-\d$/)).toHaveLength(7);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("shows lead plays as dominoes without suit-choice labels", () => {
    const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0.99);

    try {
      const view = render(
        <LocalGameScreen
          navigation={{} as never}
          route={{ params: { targetMarks: 7 } } as never}
        />
      );

      fireEvent.press(view.getByText("Pass"));
      act(() => { jest.runAllTimers(); });

      fireEvent.press(view.getByText("Call Sixes"));
      act(() => { jest.runAllTimers(); });

      expect(view.getByText("Trick Play")).toBeTruthy();
      expect(view.getByText("Table status")).toBeTruthy();
      expect(view.getByText("Turn")).toBeTruthy();
      expect(view.getByText("Current bid")).toBeTruthy();
      expect(view.getAllByText("Trump").length).toBeGreaterThan(0);
      expect(view.getAllByText("Sixes").length).toBeGreaterThan(0);
      expect(view.getByText("Current score")).toBeTruthy();
      expect(view.getByText("North/South 0 · East/West 0")).toBeTruthy();
      expect(view.getByText("Previous trick")).toBeTruthy();
      expect(view.getByTestId("local-game-trick-table")).toBeTruthy();
      expect(view.getByTestId("local-game-trick-seat-top")).toBeTruthy();
      expect(view.getByTestId("local-game-trick-seat-left")).toBeTruthy();
      expect(view.getByTestId("local-game-trick-seat-right")).toBeTruthy();
      expect(view.getByTestId("local-game-trick-seat-bottom")).toBeTruthy();
      expect(view.getByText("Activity")).toBeTruthy();
      expect(view.queryAllByText(/ as /).length).toBe(0);
      expect(view.getByTestId("local-game-domino-3-0")).toBeTruthy();

      fireEvent.press(view.getByLabelText("Select 3-0"));

      expect(view.getByText("3-0 selected")).toBeTruthy();
      expect(view.getByText("Play 3-0")).toBeTruthy();
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("reveals bot plays in the current trick one at a time", () => {
    const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0.99);

    try {
      const view = render(
        <LocalGameScreen
          navigation={{} as never}
          route={{ params: { targetMarks: 7 } } as never}
        />
      );

      fireEvent.press(view.getByText("Pass"));
      act(() => { jest.runAllTimers(); });

      fireEvent.press(view.getByText("Call Sixes"));
      act(() => { jest.runAllTimers(); });

      fireEvent.press(view.getByLabelText("Select 3-0"));
      fireEvent.press(view.getByText("Play 3-0"));
      expect(view.queryByLabelText(/^You \([A-Za-z]+\) played 3-0$/)).toBeTruthy();

      const immediatePlayCount = view.queryAllByLabelText(/played \d-\d$/).length;

      act(() => { jest.advanceTimersByTime(799); });
      expect(view.queryAllByLabelText(/played \d-\d$/).length).toBe(immediatePlayCount);

      act(() => { jest.advanceTimersByTime(1); });
      const afterFirstRevealCount = view.queryAllByLabelText(/played \d-\d$/).length;
      expect(afterFirstRevealCount).toBeGreaterThan(immediatePlayCount);
      expect(afterFirstRevealCount).toBeLessThanOrEqual(immediatePlayCount + 1);

      act(() => { jest.runAllTimers(); });
      expect(view.queryByText("Bots are playing…")).toBeNull();
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("clears revealed table plays when a trick turns over mid-advance", () => {
    const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0.99);

    try {
      const view = render(
        <LocalGameScreen
          navigation={{} as never}
          route={{ params: { targetMarks: 7 } } as never}
        />
      );

      fireEvent.press(view.getByText("Pass"));
      act(() => { jest.runAllTimers(); });

      fireEvent.press(view.getByText("Call Sixes"));
      act(() => { jest.runAllTimers(); });

      let foundClearing = false;

      for (let turn = 0; turn < 7; turn += 1) {
        const legalPlayButton = view.queryAllByLabelText(/^Select \d-\d$/)[0];

        if (!legalPlayButton) {
          break;
        }

        const playsVisibleBeforePlay = view.queryAllByLabelText(/played \d-\d$/).length;
        fireEvent.press(legalPlayButton);

        const playButton = view.queryByText(/^Play \d-\d$/);

        if (!playButton) {
          break;
        }

        fireEvent.press(playButton);

        if (playsVisibleBeforePlay > 0) {
          let previousVisibleCount = view.queryAllByLabelText(/played \d-\d$/).length;

          for (let step = 0; step < 6; step += 1) {
            if (!view.queryByText("Bots are playing…")) {
              break;
            }

            act(() => { jest.advanceTimersByTime(800); });

            const nextVisibleCount = view.queryAllByLabelText(/played \d-\d$/).length;

            if (nextVisibleCount > 0 && nextVisibleCount < previousVisibleCount) {
              foundClearing = true;
              break;
            }

            previousVisibleCount = nextVisibleCount;
          }
        }

        act(() => { jest.runAllTimers(); });

        if (foundClearing) {
          break;
        }
      }

      expect(foundClearing).toBe(true);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("keeps bot animation active when the human leads and wins a trick", () => {
    const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0.99);

    try {
      const view = render(
        <LocalGameScreen
          navigation={{} as never}
          route={{ params: { targetMarks: 7 } } as never}
        />
      );

      fireEvent.press(view.getByText("Pass"));
      act(() => { jest.runAllTimers(); });

      fireEvent.press(view.getByText("Call Sixes"));
      act(() => { jest.runAllTimers(); });

      let foundLeadWinAnimation = false;

      for (let turn = 0; turn < 7; turn += 1) {
        const legalPlayButton = view.queryAllByLabelText(/^Select \d-\d$/)[0];

        if (!legalPlayButton) {
          break;
        }

        fireEvent.press(legalPlayButton);
        const playButton = view.queryByText(/^Play \d-\d$/);

        if (!playButton) {
          break;
        }

        fireEvent.press(playButton);

        const hasVisibleCurrentPlays = view.queryAllByLabelText(/played \d-\d$/).length > 0;
        const isAnimatingBots = Boolean(view.queryByText("Bots are playing…"));

        if (hasVisibleCurrentPlays && isAnimatingBots) {
          foundLeadWinAnimation = true;

          act(() => { jest.advanceTimersByTime(800); });
          expect(view.queryByText("Bots are playing…")).toBeTruthy();

          act(() => { jest.advanceTimersByTime(800); });
          expect(view.queryByText("Bots are playing…")).toBeTruthy();

          act(() => { jest.runAllTimers(); });
          expect(view.queryByText("Bots are playing…")).toBeNull();
          break;
        }

        act(() => { jest.runAllTimers(); });
      }

      expect(foundLeadWinAnimation).toBe(true);
    } finally {
      randomSpy.mockRestore();
    }
  });
});
