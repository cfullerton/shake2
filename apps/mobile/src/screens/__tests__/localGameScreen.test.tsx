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
      expect(view.getByText("Status")).toBeTruthy();
      expect(view.getByText("Turn")).toBeTruthy();
      expect(view.getByText("Current bid")).toBeTruthy();
      expect(view.getAllByText("Trump").length).toBeGreaterThan(0);
      expect(view.getAllByText("Sixes").length).toBeGreaterThan(0);
      expect(view.getByText("Current score")).toBeTruthy();
      expect(view.getByText("Team A 0 · Team B 0")).toBeTruthy();
      expect(view.getByText("Previous trick")).toBeTruthy();
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

      const immediatePlayCount = view.queryAllByLabelText(/played \d-\d$/).length;

      act(() => { jest.advanceTimersByTime(799); });
      expect(view.queryAllByLabelText(/played \d-\d$/).length).toBe(immediatePlayCount);

      act(() => { jest.advanceTimersByTime(1); });
      const afterFirstRevealCount = view.queryAllByLabelText(/played \d-\d$/).length;
      expect(afterFirstRevealCount).toBeGreaterThan(immediatePlayCount);
      expect(afterFirstRevealCount).toBeLessThanOrEqual(immediatePlayCount + 1);

      act(() => { jest.runAllTimers(); });
      expect(view.queryAllByLabelText(/played \d-\d$/).length).toBeGreaterThanOrEqual(afterFirstRevealCount);
    } finally {
      randomSpy.mockRestore();
    }
  });
});
