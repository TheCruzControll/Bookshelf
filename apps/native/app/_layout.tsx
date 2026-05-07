import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#F7F2EA" },
        headerShadowVisible: false,
        headerTitleStyle: { color: "#181512" }
      }}
    />
  );
}

