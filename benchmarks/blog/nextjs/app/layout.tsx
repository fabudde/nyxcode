import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Blog",
  description: "Built with Next.js + Prisma + JWT",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
