import { Tabs } from "expo-router";
import { Text } from "react-native";
import { Colors } from "@/constants/Colors";

function TabIcon({ symbol, focused }: { symbol: string; focused: boolean }) {
  return (
    <Text
      style={{
        fontSize: 20,
        color: focused ? Colors.tabBarActive : Colors.tabBarInactive,
      }}
    >
      {symbol}
    </Text>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.tabBarBackground,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: Colors.tabBarActive,
        tabBarInactiveTintColor: Colors.tabBarInactive,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Schedule",
          tabBarIcon: ({ focused }) => (
            <TabIcon symbol="📅" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="queue"
        options={{
          title: "Queue",
          tabBarIcon: ({ focused }) => (
            <TabIcon symbol="📋" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="commission"
        options={{
          title: "Commission",
          tabBarIcon: ({ focused }) => (
            <TabIcon symbol="📊" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) => (
            <TabIcon symbol="👤" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
