import { Text, type TextProps, type TextStyle } from "react-native";

import { fonts } from "../theme";

interface GameTextProps extends TextProps {
  readonly variant?: "heading" | "score" | "label";
}

const variantStyles: Record<NonNullable<GameTextProps["variant"]>, TextStyle> = {
  heading: {
    fontFamily: fonts.display,
    fontSize: 28,
    letterSpacing: 1.5
  },
  label: {
    fontFamily: fonts.displayRegular,
    fontSize: 13,
    letterSpacing: 1.2
  },
  score: {
    fontFamily: fonts.display,
    fontSize: 48,
    letterSpacing: 2
  }
};

export function GameText({ variant = "heading", style, ...props }: GameTextProps) {
  return <Text style={[variantStyles[variant], style]} {...props} />;
}
