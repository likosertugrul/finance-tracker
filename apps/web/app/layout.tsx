import type { ReactNode, ReactElement } from "react";
import "./globals.css";

export const metadata = {
  title: "Finance — Portföy",
  description: "Cross-platform FinTech — gerçek zamanlı portföy",
};

export default function RootLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
