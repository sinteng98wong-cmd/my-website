import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { Colors } from "@/constants/Colors";
import { Badge } from "@/components/Badge";
import { api } from "@/lib/api";
import type { Patient, Visit } from "@/lib/types";

interface PatientDetail extends Patient {
  visits: Visit[];
}

function formatMYR(amount: number): string {
  return `RM ${amount.toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function PatientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api
      .get<PatientDetail>(`/api/patients/${id}`)
      .then(setPatient)
      .catch(() => setPatient(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!patient) {
    return (
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Patient not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Patient Info</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Ref</Text>
            <Text style={styles.infoValueMono}>{patient.patientRef}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>
              {patient.isForeigner ? "Passport" : "IC Number"}
            </Text>
            <Text style={styles.infoValue}>
              {patient.isForeigner ? patient.passportNo : patient.icNumber}
            </Text>
          </View>

          {patient.phone ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Phone</Text>
              <Text style={styles.infoValue}>{patient.phone}</Text>
            </View>
          ) : null}

          {patient.email ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{patient.email}</Text>
            </View>
          ) : null}

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Home Clinic</Text>
            <Text style={styles.infoValue}>{patient.homeClinic.name}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Type</Text>
            <Badge
              label={patient.isForeigner ? "Foreigner" : "Local"}
              variant={patient.isForeigner ? "amber" : "blue"}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Visit History</Text>
          {patient.visits.length === 0 ? (
            <View style={styles.emptyVisits}>
              <Text style={styles.emptyText}>No visit records</Text>
            </View>
          ) : (
            patient.visits.map((visit) => {
              const total = visit.treatments.reduce(
                (sum, t) => sum + t.billedAmount,
                0
              );
              return (
                <TouchableOpacity
                  key={visit.id}
                  style={styles.visitCard}
                  onPress={() =>
                    router.push(`/treatment/${visit.id}`)
                  }
                  activeOpacity={0.7}
                >
                  <View style={styles.visitTop}>
                    <Text style={styles.visitDate}>
                      {formatDate(visit.visitDate)}
                    </Text>
                    <Text style={styles.visitAmount}>{formatMYR(total)}</Text>
                  </View>
                  <Text style={styles.visitRef}>{visit.visitRef}</Text>
                  {visit.treatments.length > 0 && (
                    <Text style={styles.visitTreatments}>
                      {visit.treatments
                        .map((t) => t.treatmentType.name)
                        .join(", ")}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, paddingBottom: 48 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  errorText: { fontSize: 15, color: Colors.textMuted },
  section: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    marginBottom: 16,
    overflow: "hidden",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  infoLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
  },
  infoValue: {
    fontSize: 13,
    color: Colors.textPrimary,
    fontWeight: "500",
    flex: 2,
    textAlign: "right",
  },
  infoValueMono: {
    fontSize: 13,
    color: Colors.textPrimary,
    fontWeight: "500",
    flex: 2,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  emptyVisits: {
    padding: 20,
    alignItems: "center",
  },
  emptyText: { fontSize: 14, color: Colors.textMuted },
  visitCard: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  visitTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  visitDate: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  visitAmount: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.primary,
  },
  visitRef: {
    fontSize: 11,
    color: Colors.textMuted,
    marginBottom: 4,
    fontVariant: ["tabular-nums"],
  },
  visitTreatments: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
});
