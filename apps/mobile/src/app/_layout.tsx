import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors } from "@/lib/theme";

export default function Layout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTintColor: colors.ink,
          headerTitleStyle: { fontWeight: "600" },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Framecast" }} />
        <Stack.Screen name="record" options={{ headerShown: false, presentation: "fullScreenModal" }} />
        <Stack.Screen name="v/[id]" options={{ title: "" }} />
      </Stack>
    </>
  );
}
