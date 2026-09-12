"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Briefcase,
  Check,
  Copy,
  LogOut,
  QrCode,
  Rocket,
  User,
} from "lucide-react";
import { useAppKit } from "@reown/appkit/react";
import { useAccount, useDisconnect } from "wagmi";
import WalletQrModal from "@/components/web3/WalletQrModal";

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

const TRIGGER_BASE_CLASSES =
  "flex items-center gap-2 border-2 px-4 py-2 font-mono text-sm font-bold transition-all duration-100 active:translate-x-1 active:translate-y-1 active:shadow-none";

const MENU_ITEM_CLASSES =
  "flex w-full items-center gap-3 px-3 py-2 font-mono text-sm text-off-white transition-colors hover:bg-neon-cyan/10 hover:text-neon-cyan";

export default function ConnectButton() {
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  if (!isConnected || !address) {
    return (
      <button
        type="button"
        onClick={() => open()}
        className={`${TRIGGER_BASE_CLASSES} border-neon-cyan bg-neon-cyan text-crt-black shadow-brutal-teal hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-brutal-teal-sm`}
      >
        CONECTAR_WALLET
      </button>
    );
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(address!);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDisconnect() {
    setIsOpen(false);
    disconnect();
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`${TRIGGER_BASE_CLASSES} border-neon-cyan text-neon-cyan shadow-brutal bg-transparent hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-brutal-sm`}
      >
        <Image
          src={`https://api.dicebear.com/9.x/pixel-art/svg?seed=${address}`}
          alt="Avatar de la wallet"
          width={24}
          height={24}
          unoptimized
          className="border-neon-cyan/40 h-6 w-6 border"
        />
        {shortenAddress(address)}
      </button>

      {isOpen && (
        <div
          role="menu"
          className="border-neon-cyan bg-crt-black shadow-brutal absolute top-full right-0 z-[60] mt-2 w-56 border-2 p-1"
        >
          <button
            type="button"
            role="menuitem"
            className={MENU_ITEM_CLASSES}
            onClick={() => setIsOpen(false)}
          >
            <User className="h-4 w-4" />
            Ver mi Perfil
          </button>
          <button
            type="button"
            role="menuitem"
            className={MENU_ITEM_CLASSES}
            onClick={() => setIsOpen(false)}
          >
            <Briefcase className="h-4 w-4" />
            Mis Inversiones
          </button>
          <button
            type="button"
            role="menuitem"
            className={MENU_ITEM_CLASSES}
            onClick={() => setIsOpen(false)}
          >
            <Rocket className="h-4 w-4" />
            Mis Startups
          </button>

          <div className="bg-off-white/10 my-1 h-px" />

          <button
            type="button"
            role="menuitem"
            className={MENU_ITEM_CLASSES}
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="text-retro-green h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copied ? "¡Copiado!" : "Copiar Dirección"}
          </button>
          <button
            type="button"
            role="menuitem"
            className={MENU_ITEM_CLASSES}
            onClick={() => {
              setIsOpen(false);
              setIsQrOpen(true);
            }}
          >
            <QrCode className="h-4 w-4" />
            Ver código QR
          </button>

          <div className="bg-off-white/10 my-1 h-px" />

          <button
            type="button"
            role="menuitem"
            className={`${MENU_ITEM_CLASSES} text-warning-orange hover:bg-warning-orange/10 hover:text-warning-orange`}
            onClick={handleDisconnect}
          >
            <LogOut className="h-4 w-4" />
            Desconectar
          </button>
        </div>
      )}

      {isQrOpen && (
        <WalletQrModal address={address} onClose={() => setIsQrOpen(false)} />
      )}
    </div>
  );
}
