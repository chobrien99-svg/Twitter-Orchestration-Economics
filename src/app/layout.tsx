import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Orchestration Economics — X pipeline",
  description: "Compose, review, and schedule X posts.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <Link href="/" className="nav-brand">
            Orchestration Economics
          </Link>
          <Link href="/">Queue</Link>
          <Link href="/compose">Compose</Link>
          <Link href="/voice-samples">Voice</Link>
        </nav>
        <div className="container">{children}</div>
      </body>
    </html>
  );
}
