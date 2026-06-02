import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "@/constants/Colors";
import { Header } from "@/components/Header";
import { ScheduleItem as ScheduleItemComponent } from "@/components/ScheduleItem";
import { api } from "@/lib/api";
import type { ScheduleItem } from "@/lib/types";

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getDayLabel(d: Date): string {
  const today = new Date();
  if (formatDate(d) === formatDate(today)) return "Today";
  return d.toLocaleDateString("en-MY", { weekday: "short", day: "numeric" });
}

function getLast7Days(): Date[] {
  const days: Date[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days;
}

export default function ScheduleScreen() {
  const days = getLast7Days();
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSchedule = useCallback(
    async (date: string, isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const data = await api.get<ScheduleItem[]>(
          `/api/schedule?date=${date}&doctorId=me`
        );
        setItems(data);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchSchedule(selectedDate);
  }, [selectedDate, fetchSchedule]);

  const todayFormatted = new Date().toLocaleDateString("en-MY", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Header title="Schedule" subtitle={todayFormatted} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.dateStrip}
        contentContainerStyle={styles.dateStripContent}
      >
        {days.map((d) => {
          const key = formatDate(d);
          const active = key === selectedDate;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => setSelectedDate(key)}
              style={[styles.dayChip, active && styles.dayChipActive]}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.dayText, active && styles.dayTextActive]}
              >
                {getDayLabel(d)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchSchedule(selectedDate, true)}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No appointments today</Text>
            </View>
          }
          renderItem={({ item }) => (
            <ScheduleItemComponent
              startTime={item.startTime}
              endTime={item.endTime}
              clinicName={item.clinic.name}
              nurseName={item.nurseName}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  dateStrip: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    maxHeight: 56,
  },
  dateStripContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    flexDirection: "row",
  },
  dayChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  dayChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dayText: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.textSecondary,
  },
  dayTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  list: {
    padding: 16,
    paddingBottom: 32,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 15,
    color: Colors.textMuted,
  },
});
