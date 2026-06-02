import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Colors } from "@/constants/Colors";
import { Badge } from "@/components/Badge";
import { clearToken } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Doctor } from "@/lib/types";

const APP_VERSION = "1.0.0";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function ProfileScreen() {
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Doctor>("/api/profile/me")
      .then(setDoctor)
      .catch(() => setDoctor(null))
      .finally(() => setLoading(false));
  }, []);

  async function handleSignOut() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await clearToken();
          router.replace("/login");
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.pageTitle}>Profile</Text>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : doctor ? (
          <>
            <View style={styles.avatarSection}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{getInitials(doctor.name)}</Text>
              </View>
              <Text style={styles.doctorName}>{doctor.name}</Text>
              <Text style={styles.doctorEmail}>{doctor.email}</Text>
              <View style={{ marginTop: 8 }}>
                <Badge label={doctor.role.replace("_", " ")} variant="blue" />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Clinics</Text>
              {doctor.clinics.map((clinic) => (
                <View key={clinic.id} style={styles.clinicRow}>
                  <Text style={styles.clinicName}>{clinic.name}</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <View style={styles.center}>
            <Text style={styles.errorText}>Unable to load profile</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
          activeOpacity={0.7}
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>DentalOS v{APP_VERSION}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingBottom: 48 },
  pageTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 24,
  },
  avatarSection: {
    alignItems: "center",
    marginBottom: 28,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatarText: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "700",
  },
  doctorName: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  doctorEmail: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
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
  },
  clinicRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  clinicName: {
    fontSize: 14,
    color: Colors.textPrimary,
  },
  signOutButton: {
    borderWidth: 1.5,
    borderColor: Colors.danger,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 24,
  },
  signOutText: {
    color: Colors.danger,
    fontSize: 15,
    fontWeight: "600",
  },
  version: {
    textAlign: "center",
    fontSize: 12,
    color: Colors.textMuted,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  errorText: { fontSize: 14, color: Colors.textMuted },
});
