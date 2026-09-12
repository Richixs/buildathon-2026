"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, X } from "lucide-react";
import { shortenAddress } from "@/lib/address";

export default function WalletQrModal({
  address,
  onClose,
}: {
  address: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleCopy() {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return createPortal(
    <div
      className="bg-crt-black/80 fixed inset-0 z-[80] flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Código QR de la wallet"
        onClick={(event) => event.stopPropagation()}
        className="border-neon-cyan bg-terminal-gray shadow-brutal-lg relative flex w-full max-w-xs flex-col items-center gap-4 border-2 p-6"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="text-off-white/50 hover:text-neon-cyan absolute top-3 right-3 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-neon-cyan font-mono text-sm font-bold tracking-widest">
          MI_WALLET
        </h2>

        <div className="border-neon-cyan/40 border-2 bg-white p-3">
          <QRCodeSVG
            value={address}
            size={192}
            fgColor="#0B0C10"
            bgColor="#FFFFFF"
          />
        </div>

        <div className="border-off-white/20 bg-crt-black flex w-full items-center justify-between gap-2 border px-3 py-2">
          <div className="flex items-center gap-2">
            <Image
              src={`https://api.dicebear.com/9.x/pixel-art/svg?seed=${address}`}
              alt="Avatar de la wallet"
              width={28}
              height={28}
              unoptimized
              className="border-neon-cyan/40 h-7 w-7 border"
            />
            <span className="text-off-white font-mono text-xs">
              {shortenAddress(address)}
            </span>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="text-neon-cyan hover:text-off-white flex items-center gap-1 font-mono text-xs transition-colors"
          >
            {copied ? (
              <>
                <Check className="text-retro-green h-3.5 w-3.5" />
                Copiado
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copiar
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
