import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Colors } from "@/constants/Colors";
import { Header } from "@/components/Header";
import { PatientRow } from "@/components/PatientRow";
import { Badge } from "@/components/Badge";
import { api } from "@/lib/api";
import type { QueueItem } from "@/lib/types";

const statusVariant: Record<
  QueueItem["status"],
  "blue" | "amber" | "green"
> = {
  waiting: "amber",
  in_progress: "blue",
  done: "green",
};

const statusLabel: Record<QueueItem["status"], string> = {
  waiting: "Waiting",
  in_progress: "In Progress",
  done: "Done",
};

export default function QueueScreen() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchQueue = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const data = await api.get<QueueItem[]>(`/api/queue?date=${today}`);
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Header title="Queue" subtitle="Today's patients" />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchQueue(true)}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No patients in queue</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View>
              <PatientRow
                name={item.patient.name}
                patientRef={item.patient.patientRef}
                rightText={item.startTime}
                onPress={() => router.push(`/patient/${item.patient.id}`)}
              />
              <View style={styles.statusRow}>
                <Badge
                  label={statusLabel[item.status]}
                  variant={statusVariant[item.status]}
                />
                {item.treatments.length > 0 && (
                  <Text style={styles.treatmentText}>
                    {item.treatments
                      .map((t) => t.treatmentType.name)
                      .join(", ")}
                  </Text>
                )}
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: { fontSize: 15, color: Colors.textMuted },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  treatmentText: {
    fontSize: 12,
    color: Colors.textSecondary,
    flex: 1,
  },
});
