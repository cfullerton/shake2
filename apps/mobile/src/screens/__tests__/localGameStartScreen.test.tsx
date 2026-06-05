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
      speedUpWhenDecided: false,
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
      speedUpWhenDecided: false,
      targetMarks: 7
    });
  });

  it("starts local practice with decided-hand auto-end enabled", () => {
    const navigation = { navigate: jest.fn() };
    const view = render(
      <LocalGameStartScreen navigation={navigation as never} route={{} as never} />
    );

    fireEvent.press(view.getByLabelText("Speed up play when outcome is decided"));
    fireEvent.press(view.getByText("Deal 'Em Up"));

    expect(navigation.navigate).toHaveBeenCalledWith("LocalGame", {
      noTrump: false,
      speedUpWhenDecided: true,
      targetMarks: 7
    });
  });
});
