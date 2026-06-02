import { View, Text } from "react-native";
import { Colors } from "@/constants/Colors";

interface StatsCardProps {
  label: string;
  value: string;
}

export function StatsCard({ label, value }: StatsCardProps) {
  return (
    <View
      style={{
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: 10,
        padding: 16,
        flex: 1,
      }}
    >
      <Text
        style={{
          fontSize: 10,
          fontWeight: "700",
          color: Colors.textMuted,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          marginBottom: 6,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: 22,
          fontWeight: "600",
          color: Colors.textPrimary,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
