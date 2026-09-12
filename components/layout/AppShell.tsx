import { type ReactNode } from "react";
import Link from "next/link";
import ConnectButton from "@/components/web3/ConnectButton";
import HeaderNav from "@/components/layout/HeaderNav";

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-crt-black text-off-white relative flex flex-1 flex-col">
      <div className="bg-crt-scanlines pointer-events-none fixed inset-0 z-50" />

      <header className="border-neon-cyan/20 bg-crt-black/90 sticky top-0 z-40 border-b backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="text-neon-cyan font-mono text-lg font-bold tracking-widest"
          >
            EQUITY_CHAIN<span className="text-off-white/40">_v0.1</span>
          </Link>
          <HeaderNav />
          <ConnectButton />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-24 px-6 py-20">
        {children}
      </main>

      <footer className="border-neon-cyan/20 border-t">
        <div className="text-off-white/40 mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 font-mono text-xs sm:flex-row">
          <span>© 2026 EQUITY_CHAIN — SECURITY TOKENS + ESCROW ON-CHAIN</span>
          <span>
            STATUS:{" "}
            <span className="text-retro-green">ALL_SYSTEMS_NOMINAL</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
