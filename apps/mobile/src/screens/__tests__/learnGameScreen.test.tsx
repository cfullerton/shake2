import { fireEvent, render } from "@testing-library/react-native";

import { LearnGameScreen } from "../LearnGameScreen";

describe("LearnGameScreen", () => {
  it("explains core Texas 42 concepts for new players", () => {
    const navigate = jest.fn();
    const view = render(
      <LearnGameScreen
        navigation={{ navigate } as never}
        route={{} as never}
      />
    );

    expect(view.getByText("Texas 42 in plain English")).toBeTruthy();
    expect(view.getByText("How a hand flows")).toBeTruthy();
    expect(view.getByText("Where the 42 points come from")).toBeTruthy();
    expect(view.getByText("Bidding and trump")).toBeTruthy();
    expect(view.getByText("Playing tricks")).toBeTruthy();
    expect(view.getByText("6-4")).toBeTruthy();

    fireEvent.press(view.getByText("Start Practice"));

    expect(navigate).toHaveBeenCalledWith("LocalGameStart");
  });
});
