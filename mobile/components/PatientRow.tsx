import { View, Text, TouchableOpacity } from "react-native";
import { Colors } from "@/constants/Colors";

interface PatientRowProps {
  name: string;
  patientRef: string;
  rightText?: string;
  onPress?: () => void;
}

export function PatientRow({
  name,
  patientRef,
  rightText,
  onPress,
}: PatientRowProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: Colors.surface,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
      }}
      activeOpacity={0.7}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 15,
            fontWeight: "600",
            color: Colors.textPrimary,
            marginBottom: 2,
          }}
        >
          {name}
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: Colors.textMuted,
            fontVariant: ["tabular-nums"],
          }}
        >
          {patientRef}
        </Text>
      </View>
      {rightText ? (
        <Text
          style={{
            fontSize: 13,
            color: Colors.textSecondary,
            marginRight: 6,
          }}
        >
          {rightText}
        </Text>
      ) : null}
      <Text style={{ fontSize: 18, color: Colors.textMuted }}>{"›"}</Text>
    </TouchableOpacity>
  );
}
