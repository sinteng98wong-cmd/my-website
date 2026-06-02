import { View, Text } from "react-native";

const variants = {
  blue: { bg: "#EFF6FF", text: "#1D4ED8" },
  green: { bg: "#F0FDF4", text: "#15803D" },
  amber: { bg: "#FFFBEB", text: "#B45309" },
  red: { bg: "#FEF2F2", text: "#B91C1C" },
  slate: { bg: "#F8FAFC", text: "#475569" },
};

export function Badge({
  label,
  variant = "slate",
}: {
  label: string;
  variant?: keyof typeof variants;
}) {
  const v = variants[variant];
  return (
    <View
      style={{
        backgroundColor: v.bg,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 99,
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ color: v.text, fontSize: 11, fontWeight: "600" }}>
        {label}
      </Text>
    </View>
  );
}
