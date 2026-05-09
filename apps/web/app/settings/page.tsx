import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function SettingsPage() {
  return (
    <main className="shell">
      <h1>Settings</h1>
    </main>
  );
}
