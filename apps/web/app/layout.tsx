import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Hone",
  description: "Rank books, follow friends, and discover what to read next."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

