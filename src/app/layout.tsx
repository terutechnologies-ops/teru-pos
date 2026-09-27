import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

import { PLATFORM_NAME } from "@/lib/brand";

import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { template: `%s · ${PLATFORM_NAME}`, default: PLATFORM_NAME },
  description: "Sistema de gestión multiempresa",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${plusJakartaSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
