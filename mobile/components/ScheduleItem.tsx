import { View, Text } from "react-native";
import { Colors } from "@/constants/Colors";

type StatusType = "confirmed" | "pending" | "cancelled";

interface ScheduleItemProps {
  startTime: string;
  endTime: string;
  clinicName: string;
  nurseName?: string;
  status?: StatusType;
}

const statusColors: Record<StatusType, string> = {
  confirmed: Colors.success,
  pending: Colors.warning,
  cancelled: Colors.danger,
};

export function ScheduleItem({
  startTime,
  endTime,
  clinicName,
  nurseName,
  status = "confirmed",
}: ScheduleItemProps) {
  return (
    <View
      style={{
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: 10,
        padding: 14,
        marginBottom: 10,
        flexDirection: "row",
        alignItems: "flex-start",
      }}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: statusColors[status],
          marginTop: 5,
          marginRight: 12,
        }}
      />
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 15,
            fontWeight: "700",
            color: Colors.textPrimary,
            marginBottom: 3,
          }}
        >
          {startTime} – {endTime}
        </Text>
        <Text style={{ fontSize: 13, color: Colors.textSecondary }}>
          {clinicName}
        </Text>
        {nurseName ? (
          <Text
            style={{ fontSize: 12, color: Colors.textMuted, marginTop: 2 }}
          >
            Nurse: {nurseName}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
