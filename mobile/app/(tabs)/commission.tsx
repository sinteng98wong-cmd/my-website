import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "@/constants/Colors";
import { Header } from "@/components/Header";
import { Badge } from "@/components/Badge";
import { StatsCard } from "@/components/StatsCard";
import { api } from "@/lib/api";
import type { Commission } from "@/lib/types";

function formatMYR(amount: number): string {
  return `RM ${amount.toFixed(2)}`;
}

function getMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  const d = new Date(parseInt(year), parseInt(month) - 1, 1);
  return d.toLocaleDateString("en-MY", { month: "long", year: "numeric" });
}

function prevMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nextMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function CommissionScreen() {
  const [month, setMonth] = useState(currentYearMonth());
  const [records, setRecords] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCommissions = useCallback(
    async (m: string, isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const data = await api.get<Commission[]>(
          `/api/commission?month=${m}&doctorId=me`
        );
        setRecords(data);
      } catch {
        setRecords([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchCommissions(month);
  }, [month, fetchCommissions]);

  const totalPayout = records.reduce((sum, r) => sum + r.finalPayout, 0);
  const activeRecords = records.filter((r) => r.status !== "forfeited");
  const forfeitedCount = records.filter((r) => r.status === "forfeited").length;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Header title="Commission" />

      <View style={styles.monthPicker}>
        <TouchableOpacity
          onPress={() => setMonth(prevMonth(month))}
          style={styles.arrowBtn}
          activeOpacity={0.7}
        >
          <Text style={styles.arrowText}>{"‹"}</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{getMonthLabel(month)}</Text>
        <TouchableOpacity
          onPress={() => setMonth(nextMonth(month))}
          style={styles.arrowBtn}
          activeOpacity={0.7}
        >
          <Text style={styles.arrowText}>{"›"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <StatsCard label="Total Payout" value={formatMYR(totalPayout)} />
        <View style={{ width: 10 }} />
        <StatsCard label="Records" value={String(records.length)} />
        <View style={{ width: 10 }} />
        <StatsCard label="Forfeited" value={String(forfeitedCount)} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchCommissions(month, true)}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No commission records</Text>
            </View>
          }
          renderItem={({ item }) => {
            const forfeited = item.status === "forfeited";
            return (
              <View style={styles.recordCard}>
                <View style={styles.recordTop}>
                  <Text style={styles.patientName} numberOfLines={1}>
                    {item.treatment.visit.patient.name}
                  </Text>
                  <Text
                    style={[
                      styles.payout,
                      forfeited && styles.payoutForfeited,
                    ]}
                  >
                    {formatMYR(item.finalPayout)}
                  </Text>
                </View>
                <Text style={styles.treatmentName} numberOfLines={1}>
                  {item.treatment.treatmentType.name}
                </Text>
                <View style={styles.recordBottom}>
                  {forfeited ? (
                    <Badge label="Forfeited" variant="red" />
                  ) : item.status === "paid" ? (
                    <Badge label="Paid" variant="green" />
                  ) : (
                    <Badge label="Pending" variant="amber" />
                  )}
                  <Text style={styles.txAmount}>
                    Tx: {formatMYR(item.txAmount)} · Lab: {formatMYR(item.labFee)}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  monthPicker: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 16,
  },
  arrowBtn: { padding: 8 },
  arrowText: { fontSize: 22, color: Colors.primary, fontWeight: "600" },
  monthLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.textPrimary,
    minWidth: 160,
    textAlign: "center",
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: { fontSize: 15, color: Colors.textMuted },
  recordCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  recordTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 3,
  },
  patientName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  payout: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.success,
  },
  payoutForfeited: {
    color: Colors.danger,
    textDecorationLine: "line-through",
  },
  treatmentName: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  recordBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  txAmount: {
    fontSize: 11,
    color: Colors.textMuted,
    flex: 1,
  },
});
