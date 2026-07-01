import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#0b0e14" },
          headerTintColor: "#e6e9ef",
          contentStyle: { backgroundColor: "#0b0e14" },
          title: "Finance",
        }}
      />
    </>
  );
}
