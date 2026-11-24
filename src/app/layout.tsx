import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "CampusVault - Zero-Trust Document Exchange",
  description:
    "Secure campus document exchange platform with zero-trust architecture",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#F4F3EE] text-[#202923] antialiased selection:bg-[#477B70]/20 selection:text-[#183A35]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
