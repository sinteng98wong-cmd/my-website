import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { Colors } from "@/constants/Colors";
import { api } from "@/lib/api";
import type { Visit } from "@/lib/types";

interface TreatmentType {
  id: string;
  name: string;
}

export default function TreatmentEntryScreen() {
  const { visitId } = useLocalSearchParams<{ visitId: string }>();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [treatmentTypes, setTreatmentTypes] = useState<TreatmentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [treatmentTypeId, setTreatmentTypeId] = useState("");
  const [billedAmount, setBilledAmount] = useState("");
  const [collectedAmount, setCollectedAmount] = useState("");
  const [doctorSplit, setDoctorSplit] = useState("0.7");
  const [labFee, setLabFee] = useState("0");

  useEffect(() => {
    if (!visitId) return;
    Promise.all([
      api.get<Visit>(`/api/visits/${visitId}`),
      api.get<TreatmentType[]>("/api/treatment-types"),
    ])
      .then(([v, types]) => {
        setVisit(v);
        setTreatmentTypes(types);
        if (types.length > 0) setTreatmentTypeId(types[0].id);
      })
      .catch(() => setVisit(null))
      .finally(() => setLoading(false));
  }, [visitId]);

  async function handleSave() {
    if (!treatmentTypeId) {
      Alert.alert("Error", "Please select a treatment type.");
      return;
    }

    const billed = parseFloat(billedAmount);
    const collected = parseFloat(collectedAmount);
    const split = parseFloat(doctorSplit);
    const lab = parseFloat(labFee);

    if (isNaN(billed) || isNaN(collected)) {
      Alert.alert("Error", "Please enter valid amounts.");
      return;
    }

    setSaving(true);
    try {
      await api.post(`/api/visits/${visitId}/treatments`, {
        treatmentTypeId,
        billedAmount: billed,
        collectedAmount: collected,
        doctorSplit: split,
        labFee: lab,
      });
      Alert.alert("Saved", "Treatment entry saved successfully.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save";
      Alert.alert("Error", message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView contentContainerStyle={styles.content}>
          {visit && (
            <View style={styles.visitInfo}>
              <Text style={styles.patientName}>
                {visit.patient.name}
              </Text>
              <Text style={styles.visitMeta}>
                {visit.visitRef} ·{" "}
                {new Date(visit.visitDate).toLocaleDateString("en-MY", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </Text>
            </View>
          )}

          <View style={styles.formSection}>
            <Text style={styles.sectionTitle}>Treatment Details</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Treatment Type</Text>
              <View style={styles.pickerContainer}>
                {treatmentTypes.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[
                      styles.pickerOption,
                      treatmentTypeId === t.id && styles.pickerOptionActive,
                    ]}
                    onPress={() => setTreatmentTypeId(t.id)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.pickerOptionText,
                        treatmentTypeId === t.id &&
                          styles.pickerOptionTextActive,
                      ]}
                    >
                      {t.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Billed Amount (RM)</Text>
              <TextInput
                style={styles.input}
                value={billedAmount}
                onChangeText={setBilledAmount}
                placeholder="0.00"
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Collected Amount (RM)</Text>
              <TextInput
                style={styles.input}
                value={collectedAmount}
                onChangeText={setCollectedAmount}
                placeholder="0.00"
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Doctor Split (0–1)</Text>
              <TextInput
                style={styles.input}
                value={doctorSplit}
                onChangeText={setDoctorSplit}
                placeholder="0.70"
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Lab Fee (RM)</Text>
              <TextInput
                style={styles.input}
                value={labFee}
                onChangeText={setLabFee}
                placeholder="0.00"
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
              />
              <Text style={styles.fieldNote}>
                Lab fee is not shown on the patient invoice. It is only used in
                commission calculations.
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Save Treatment</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
  visitInfo: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  patientName: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.primaryDark,
    marginBottom: 3,
  },
  visitMeta: {
    fontSize: 12,
    color: Colors.primary,
    fontVariant: ["tabular-nums"],
  },
  formSection: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  field: { marginBottom: 16 },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.textPrimary,
    backgroundColor: Colors.background,
  },
  fieldNote: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 5,
    lineHeight: 16,
  },
  pickerContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pickerOption: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  pickerOptionActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pickerOptionText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: "500",
  },
  pickerOptionTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  saveButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});
