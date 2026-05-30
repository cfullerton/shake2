import { fireEvent, render } from "@testing-library/react-native";

import { LocalGameScreen } from "../LocalGameScreen";

describe("LocalGameScreen", () => {
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
      expect(view.getByTestId("local-game-human-hand").props.children).toMatch(
        /\d-\d/
      );
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
      fireEvent.press(view.getByText("Sixes"));

      expect(view.getByText("Trick Play")).toBeTruthy();
      expect(view.getByText("Trump")).toBeTruthy();
      expect(view.getByText("Sixes")).toBeTruthy();
      expect(view.getByText("Current score")).toBeTruthy();
      expect(view.getByText("Team A 0 · Team B 0")).toBeTruthy();
      expect(view.queryAllByText(/ as /).length).toBe(0);
    } finally {
      randomSpy.mockRestore();
    }
  });
});
