import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle
} from "react-native";

import { palette, radius, spacing } from "../theme";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends Omit<PressableProps, "children" | "style"> {
  readonly children: string;
  readonly icon?: ReactNode;
  readonly loading?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly variant?: ButtonVariant;
}

export function Button({
  children,
  disabled,
  icon,
  loading = false,
  style,
  variant = "primary",
  ...pressableProps
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style
      ]}
      {...pressableProps}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? palette.surface : palette.teal} />
      ) : (
        <>
          {icon}
          <Text style={[styles.label, styles[`${variant}Label`]]}>{children}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    borderRadius: radius.sm,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm
  },
  danger: {
    backgroundColor: palette.red
  },
  dangerLabel: {
    color: palette.surface
  },
  disabled: {
    opacity: 0.48
  },
  ghost: {
    backgroundColor: "transparent"
  },
  ghostLabel: {
    color: palette.teal
  },
  label: {
    fontSize: 16,
    fontWeight: "700"
  },
  pressed: {
    opacity: 0.82
  },
  primary: {
    backgroundColor: palette.teal
  },
  primaryLabel: {
    color: palette.surface
  },
  secondary: {
    backgroundColor: palette.surfaceAlt,
    borderColor: palette.border,
    borderWidth: 1
  },
  secondaryLabel: {
    color: palette.ink
  }
});
