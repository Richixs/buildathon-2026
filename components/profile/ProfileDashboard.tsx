"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useAccount } from "wagmi";
import { Briefcase, Rocket } from "lucide-react";
import ProgressBar from "@/components/startup/ProgressBar";
import { shortenAddress } from "@/lib/address";
import type { ProfileRole } from "@/components/profile/RegistrationForm";

interface FetchedProfile {
  address: string;
  username: string;
  bio: string;
  link: string | null;
  role: ProfileRole;
  legalName: string | null;
}

interface InvestmentSummary {
  id: string;
  projectName: string;
  amountHsk: number;
}

interface StartupSummary {
  id: string;
  name: string;
  progressPct: number;
}

// Only the profile row (role/legalName) comes from Prisma for now —
// investments/campaigns aren't modeled in the DB yet.
const MOCK_INVESTMENTS: InvestmentSummary[] = [];
const MOCK_STARTUPS: StartupSummary[] = [];

function formatAddress(address?: string): string {
  if (!address) return "Conectando...";
  return shortenAddress(address);
}

export default function ProfileDashboard() {
  const { address } = useAccount();
  const [profile, setProfile] = useState<FetchedProfile | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(address));
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [trackedAddress, setTrackedAddress] = useState(address);

  // Reset synchronously during render when the address changes (e.g. wallet
  // disconnected or switched) instead of in an effect — avoids an extra
  // cascading render. See: https://react.dev/learn/you-might-not-need-an-effect
  if (address !== trackedAddress) {
    setTrackedAddress(address);
    setProfile(null);
    setIsLoading(Boolean(address));
  }

  useEffect(() => {
    if (!address) return;

    let cancelled = false;

    fetch(`/api/profile?address=${address}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address]);

  async function handleUpgrade(legalName: string) {
    if (!address) return;

    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, role: "startup", legalName }),
    });

    if (res.ok) {
      setProfile(await res.json());
    }
  }

  if (!address) return null;

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <p className="text-neon-cyan font-mono text-sm tracking-widest">
          [ OBTENIENDO_DATOS_ONCHAIN... ]
        </p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center py-20">
        <p className="text-off-white/70 font-mono text-sm">
          No se encontró un perfil para esta wallet.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col">
      <header className="border-neon-cyan relative flex flex-row items-center gap-6 border-2 p-6">
        <Image
          src={`https://api.dicebear.com/9.x/pixel-art/svg?seed=${address}`}
          alt="Avatar del perfil"
          width={96}
          height={96}
          unoptimized
          className="border-neon-cyan/40 h-24 w-24 shrink-0 border-2"
        />
        <div className="flex flex-col gap-2">
          <h1 className="text-neon-cyan font-mono text-2xl font-bold">
            {profile.username}
          </h1>
          <span className="text-muted-teal font-mono text-sm">
            {formatAddress(address)}
          </span>
          <p className="text-off-white/70 max-w-xl font-sans text-sm leading-6">
            {profile.bio}
          </p>
        </div>

        {profile.role === "startup" && (
          <span className="bg-neon-cyan/10 text-neon-cyan border-neon-cyan absolute right-4 bottom-4 inline-flex items-center gap-1 border px-2 py-1 font-mono text-xs">
            [✓] VERIFIED_FOUNDER
          </span>
        )}
      </header>

      <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2">
        <section aria-label="Mis Inversiones">
          <h2 className="text-off-white border-muted-teal mb-4 flex items-center gap-2 border-b pb-2 font-mono">
            <Briefcase className="text-muted-teal h-5 w-5" />
            MIS_INVERSIONES
          </h2>

          {MOCK_INVESTMENTS.length === 0 ? (
            <div className="bg-terminal-gray border-muted-teal border p-6 text-center">
              <p className="text-off-white/70 font-sans text-sm">
                Todavía no has invertido en ningún proyecto.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {MOCK_INVESTMENTS.map((investment) => (
                <div
                  key={investment.id}
                  className="border-muted-teal/40 bg-terminal-gray/60 flex items-center justify-between gap-3 border p-4"
                >
                  <span className="font-mono text-sm font-bold">
                    {investment.projectName}
                  </span>
                  <span className="text-neon-cyan font-mono text-xs">
                    {investment.amountHsk} HSK
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section aria-label="Mis Startups">
          <h2 className="text-off-white border-muted-teal mb-4 flex items-center gap-2 border-b pb-2 font-mono">
            <Rocket className="text-muted-teal h-5 w-5" />
            MIS_STARTUPS
          </h2>

          {profile.role === "investor" ? (
            <EmptyStartupsState
              onLaunchClick={() => setIsUpgradeModalOpen(true)}
            />
          ) : MOCK_STARTUPS.length === 0 ? (
            <MinimalStartupEmptyState
              onCreateCampaignClick={() =>
                alert("Redirigiendo a creación de contrato...")
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {MOCK_STARTUPS.map((startup) => (
                <div
                  key={startup.id}
                  className="border-muted-teal/40 bg-terminal-gray/60 flex flex-col gap-2 border p-4"
                >
                  <span className="font-mono text-sm font-bold">
                    {startup.name}
                  </span>
                  <ProgressBar value={startup.progressPct} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {isUpgradeModalOpen && (
        <UpgradeToStartupModal
          onCancel={() => setIsUpgradeModalOpen(false)}
          onConfirm={async (legalName) => {
            await handleUpgrade(legalName);
            setIsUpgradeModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function EmptyStartupsState({ onLaunchClick }: { onLaunchClick: () => void }) {
  return (
    <div className="bg-terminal-gray border-muted-teal flex flex-col items-center gap-4 border p-6 text-center">
      <p className="text-off-white/70 font-sans text-sm leading-6">
        ¿Tienes un proyecto en mente? Tokeniza tu equity y consigue a tus
        primeros inversores hoy mismo.
      </p>
      <button
        type="button"
        onClick={onLaunchClick}
        className="bg-neon-cyan text-crt-black border-neon-cyan shadow-brutal-teal hover:shadow-brutal-teal-sm border-2 px-6 py-2 font-mono font-bold transition-all hover:translate-x-[2px] hover:translate-y-[2px]"
      >
        LANZAR_MI_STARTUP
      </button>
    </div>
  );
}

function MinimalStartupEmptyState({
  onCreateCampaignClick,
}: {
  onCreateCampaignClick: () => void;
}) {
  return (
    <div className="bg-terminal-gray border-muted-teal border p-6 text-center">
      <p className="text-muted-teal mb-4 font-mono">[ 0 CAMPAÑAS ACTIVAS ]</p>
      <button
        type="button"
        onClick={onCreateCampaignClick}
        className="bg-neon-cyan text-crt-black border-neon-cyan shadow-brutal-teal hover:shadow-brutal-teal-sm border-2 px-6 py-2 font-mono font-bold transition-all hover:translate-x-[2px] hover:translate-y-[2px]"
      >
        CREAR_NUEVA_CAMPAÑA
      </button>
    </div>
  );
}

function UpgradeToStartupModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (legalName: string) => void | Promise<void>;
}) {
  const [legalName, setLegalName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleConfirm() {
    const trimmed = legalName.trim();
    if (!trimmed) return;

    setIsSubmitting(true);
    try {
      await onConfirm(trimmed);
    } finally {
      setIsSubmitting(false);
    }
  }

  return createPortal(
    <div className="bg-crt-black/80 fixed inset-0 z-[80] flex items-center justify-center p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Actualizar a perfil de Startup"
        className="border-neon-cyan bg-terminal-gray shadow-brutal flex w-full max-w-sm flex-col gap-4 border-2 p-6"
      >
        <h2 className="text-neon-cyan font-mono text-lg font-bold tracking-widest">
          ACTUALIZAR_A_STARTUP
        </h2>

        <label className="flex flex-col gap-1.5">
          <span className="text-off-white/70 font-mono text-xs tracking-widest">
            NOMBRE LEGAL
          </span>
          <input
            id="upgrade-legal-name"
            name="legalName"
            type="text"
            value={legalName}
            onChange={(event) => setLegalName(event.target.value)}
            className="border-muted-teal bg-crt-black text-off-white focus:border-neon-cyan focus:shadow-brutal-sm w-full border px-3 py-2 font-mono text-sm transition-colors outline-none"
          />
        </label>

        <div className="mt-2 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="border-off-white/30 hover:border-neon-cyan hover:text-neon-cyan flex-1 border-2 px-4 py-2 font-mono text-sm font-bold transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || !legalName.trim()}
            className="bg-neon-cyan text-crt-black border-neon-cyan shadow-brutal-teal hover:shadow-brutal-teal-sm flex-1 border-2 px-4 py-2 font-mono text-sm font-bold transition-all hover:translate-x-[2px] hover:translate-y-[2px] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Actualizando..." : "Actualizar Perfil"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
