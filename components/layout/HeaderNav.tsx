"use client";

import Link from "next/link";
import { useAccount } from "wagmi";

const NAV_LINK_CLASSES = "hover:text-neon-cyan transition-colors";

// Landing nav for anonymous visitors vs. app nav once a wallet is connected
// — logged-in users shouldn't be steered back to marketing anchors, they
// should get the app's own navigation (browse, dashboard).
export default function HeaderNav() {
  const { isConnected } = useAccount();

  if (isConnected) {
    return (
      <nav className="text-off-white/70 hidden items-center gap-8 font-mono text-sm sm:flex">
        <Link href="/startups" className={NAV_LINK_CLASSES}>
          EXPLORAR_STARTUPS
        </Link>
        <Link href="/profile" className={NAV_LINK_CLASSES}>
          MI_PANEL
        </Link>
      </nav>
    );
  }

  return (
    <nav className="text-off-white/70 hidden items-center gap-8 font-mono text-sm sm:flex">
      <Link href="/#como-funciona" className={NAV_LINK_CLASSES}>
        CÓMO_FUNCIONA
      </Link>
      <Link href="/#para-quien-es-esto" className={NAV_LINK_CLASSES}>
        PARA_QUIÉN_ES_ESTO
      </Link>
      <Link href="/#startups" className={NAV_LINK_CLASSES}>
        STARTUPS
      </Link>
    </nav>
  );
}
