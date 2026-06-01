import { fireEvent, render } from "@testing-library/react-native";

import { LocalGameStartScreen } from "../LocalGameStartScreen";

describe("LocalGameStartScreen", () => {
  it("starts local practice with no-trump disabled by default", () => {
    const navigation = { navigate: jest.fn() };
    const view = render(
      <LocalGameStartScreen navigation={navigation as never} route={{} as never} />
    );

    fireEvent.press(view.getByText("Deal 'Em Up"));

    expect(navigation.navigate).toHaveBeenCalledWith("LocalGame", {
      noTrump: false,
      targetMarks: 7
    });
  });

  it("starts local practice with no-trump enabled", () => {
    const navigation = { navigate: jest.fn() };
    const view = render(
      <LocalGameStartScreen navigation={navigation as never} route={{} as never} />
    );

    fireEvent.press(view.getByLabelText("No Trump"));
    fireEvent.press(view.getByText("Deal 'Em Up"));

    expect(navigation.navigate).toHaveBeenCalledWith("LocalGame", {
      noTrump: true,
      targetMarks: 7
    });
  });
});
