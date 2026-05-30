import { render } from "@testing-library/react-native";

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
});

