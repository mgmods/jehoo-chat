import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JEHOO CHAT — Admin",
  description: "لوحة إدارة JEHOO CHAT",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl"><body>{children}</body></html>;
}
