import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Twitter Orchestration Economics",
  description: "X publishing pipeline with budget-aware scheduling.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          margin: 0,
          padding: "2rem",
          maxWidth: 720,
        }}
      >
        {children}
      </body>
    </html>
  );
}
