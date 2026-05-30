import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

import { palette, radius, spacing } from "../theme";

interface TextFieldProps extends TextInputProps {
  readonly label: string;
}

export function TextField({ label, style, ...inputProps }: TextFieldProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={palette.subtle}
        style={[styles.input, style]}
        {...inputProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs
  },
  input: {
    backgroundColor: palette.surfaceAlt,
    borderColor: palette.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: palette.ink,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  label: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: "700"
  }
});
