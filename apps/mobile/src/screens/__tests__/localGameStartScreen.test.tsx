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
      markBids: false,
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
      markBids: false,
      noTrump: true,
      targetMarks: 7
    });
  });

  it("starts local practice with mark bids enabled", () => {
    const navigation = { navigate: jest.fn() };
    const view = render(
      <LocalGameStartScreen navigation={navigation as never} route={{} as never} />
    );

    fireEvent.press(view.getByLabelText("Mark Bids"));
    fireEvent.press(view.getByText("Deal 'Em Up"));

    expect(navigation.navigate).toHaveBeenCalledWith("LocalGame", {
      markBids: true,
      noTrump: false,
      targetMarks: 7
    });
  });
});
