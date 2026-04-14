// app/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NyxCode Relations Blog — Next.js Benchmark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
