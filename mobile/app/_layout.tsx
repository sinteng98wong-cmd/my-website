import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { router } from "expo-router";
import { getToken } from "@/lib/auth";

export default function RootLayout() {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      const token = await getToken();
      if (!token) {
        router.replace("/login");
      }
      setChecked(true);
    }
    checkAuth();
  }, []);

  if (!checked) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="patient/[id]"
        options={{ headerShown: true, title: "Patient" }}
      />
      <Stack.Screen
        name="treatment/[visitId]"
        options={{ headerShown: true, title: "Treatment Entry" }}
      />
    </Stack>
  );
}
