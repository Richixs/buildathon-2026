import type { Metadata } from "next";
import { Space_Mono, Inter } from "next/font/google";
import Web3Provider from "@/components/web3/Web3Provider";
import "./globals.css";

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EQUITY_CHAIN",
  description:
    "Crowdfunding de equity tokenizado (SAFE) en HashKey Chain: tu capital queda en escrow on-chain y se libera por hitos.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${spaceMono.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}
