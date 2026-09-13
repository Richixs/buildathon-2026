"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { Briefcase, Rocket } from "lucide-react";
import ProgressBar from "@/components/startup/ProgressBar";
import TokenBalance from "@/components/campaigns/TokenBalance";
import { shortenAddress } from "@/lib/address";
import type { ProfileRole } from "@/components/profile/RegistrationForm";

type ProfileTab = "investments" | "startups";

function isProfileTab(value: string | null): value is ProfileTab {
  return value === "investments" || value === "startups";
}

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
  campaignId: string;
  projectName: string;
  tokenSymbol: string;
  tokenAddress: string | null;
  amountHsk: number;
  refunded: boolean;
  status: string;
  remainingMilestones: number;
  totalMilestones: number;
}

interface StartupSummary {
  id: string;
  name: string;
  tokenSymbol: string;
  status: string;
  goalAmount: number;
  raisedAmount: number;
  backers: number;
  progressPct: number;
  remainingMilestones: number;
  totalMilestones: number;
}

// Shapes returned by GET /api/investments?investor= and
// GET /api/campaigns?founder= — see lib/campaigns.ts and
// app/api/investments/route.ts for the full DTOs.
interface InvestmentApiItem {
  id: string;
  amount: number;
  refundedAt?: string | null;
  campaign: {
    id: string;
    title: string;
    tokenSymbol: string;
    tokenAddress?: string | null;
    status: string;
    milestones: { isCompleted: boolean }[];
  };
}

interface CampaignApiItem {
  id: string;
  title: string;
  tokenSymbol: string;
  status: string;
  goalAmount: number;
  raisedAmount: number;
  backers: number;
  milestones: { isCompleted: boolean }[];
}

function remainingOf(milestones: { isCompleted: boolean }[]): number {
  return milestones.filter((m) => !m.isCompleted).length;
}

function MilestonesLeftBadge({
  remaining,
  total,
}: {
  remaining: number;
  total: number;
}) {
  if (total === 0) return null;

  return (
    <span
      className={`font-mono text-xs ${remaining === 0 ? "text-retro-green" : "text-muted-teal"}`}
    >
      {remaining === 0
        ? "[✓] TODOS LOS HITOS CUMPLIDOS"
        : `${remaining}/${total} hitos restantes`}
    </span>
  );
}

function formatAddress(address?: string): string {
  if (!address) return "Conectando...";
  return shortenAddress(address);
}

export default function ProfileDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  const { address } = useAccount();
  const [profile, setProfile] = useState<FetchedProfile | null>(null);
  const [investments, setInvestments] = useState<InvestmentSummary[]>([]);
  const [startups, setStartups] = useState<StartupSummary[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(address));
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [trackedAddress, setTrackedAddress] = useState(address);
  const [activeTab, setActiveTab] = useState<ProfileTab>(
    isProfileTab(tabParam) ? tabParam : "investments",
  );
  const [trackedTabParam, setTrackedTabParam] = useState(tabParam);

  // Reset synchronously during render when the address changes (e.g. wallet
  // disconnected or switched) instead of in an effect — avoids an extra
  // cascading render. See: https://react.dev/learn/you-might-not-need-an-effect
  if (address !== trackedAddress) {
    setTrackedAddress(address);
    setProfile(null);
    setInvestments([]);
    setStartups([]);
    setIsLoading(Boolean(address));
  }

  // Same pattern for ?tab=... — keeps the tab in sync on every navigation,
  // not just the first render (e.g. clicking "Mis Startups" in ConnectButton
  // while already on /profile does a client-side transition, not a remount).
  if (tabParam !== trackedTabParam) {
    setTrackedTabParam(tabParam);
    if (isProfileTab(tabParam)) setActiveTab(tabParam);
  }

  useEffect(() => {
    if (!address) return;

    let cancelled = false;

    async function load(walletAddress: string) {
      const profileRes = await fetch(`/api/profile?address=${walletAddress}`);
      const profileData: FetchedProfile | null = profileRes.ok
        ? await profileRes.json()
        : null;
      if (cancelled) return;
      setProfile(profileData);

      if (!profileData) {
        setIsLoading(false);
        return;
      }

      const [investmentsRes, startupsRes] = await Promise.all([
        fetch(`/api/investments?investor=${walletAddress}`),
        fetch(`/api/campaigns?founder=${walletAddress}`),
      ]);
      if (cancelled) return;

      const investmentsData: InvestmentApiItem[] = investmentsRes.ok
        ? await investmentsRes.json()
        : [];
      const startupsData: CampaignApiItem[] = startupsRes.ok
        ? await startupsRes.json()
        : [];
      if (cancelled) return;

      setInvestments(
        investmentsData.map((investment) => ({
          id: investment.id,
          campaignId: investment.campaign.id,
          projectName: investment.campaign.title,
          tokenSymbol: investment.campaign.tokenSymbol,
          tokenAddress: investment.campaign.tokenAddress ?? null,
          amountHsk: investment.amount,
          refunded: Boolean(investment.refundedAt),
          status: investment.campaign.status,
          remainingMilestones: remainingOf(investment.campaign.milestones),
          totalMilestones: investment.campaign.milestones.length,
        })),
      );
      setStartups(
        startupsData.map((campaign) => ({
          id: campaign.id,
          name: campaign.title,
          tokenSymbol: campaign.tokenSymbol,
          status: campaign.status,
          goalAmount: campaign.goalAmount,
          raisedAmount: campaign.raisedAmount,
          backers: campaign.backers,
          progressPct:
            campaign.goalAmount > 0
              ? Math.round((campaign.raisedAmount / campaign.goalAmount) * 100)
              : 0,
          remainingMilestones: remainingOf(campaign.milestones),
          totalMilestones: campaign.milestones.length,
        })),
      );
      setIsLoading(false);
    }

    load(address);

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

      <DashboardStats
        role={profile.role}
        investments={investments}
        startups={startups}
      />

      <div className="border-muted-teal/40 mt-8 flex gap-6 border-b">
        <button
          type="button"
          onClick={() => setActiveTab("investments")}
          className={`flex items-center gap-2 border-b-2 px-1 pb-3 font-mono text-sm transition-colors ${
            activeTab === "investments"
              ? "border-neon-cyan text-neon-cyan"
              : "text-off-white/50 hover:text-off-white border-transparent"
          }`}
        >
          <Briefcase className="h-4 w-4" />
          MIS_INVERSIONES
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("startups")}
          className={`flex items-center gap-2 border-b-2 px-1 pb-3 font-mono text-sm transition-colors ${
            activeTab === "startups"
              ? "border-neon-cyan text-neon-cyan"
              : "text-off-white/50 hover:text-off-white border-transparent"
          }`}
        >
          <Rocket className="h-4 w-4" />
          MIS_STARTUPS
        </button>
      </div>

      <div className="mt-6">
        {activeTab === "investments" ? (
          <section aria-label="Mis Inversiones">
            {investments.length === 0 ? (
              <div className="bg-terminal-gray border-muted-teal border p-6 text-center">
                <p className="text-off-white/70 font-sans text-sm">
                  Todavía no has invertido en ningún proyecto.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {investments.map((investment) => (
                  <Link
                    key={investment.id}
                    href={`/campaigns/${investment.campaignId}`}
                    className="border-muted-teal/40 bg-terminal-gray/60 hover:border-neon-cyan flex flex-col gap-2 border p-4 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-sm font-bold">
                        {investment.projectName}
                      </span>
                      <span className="text-off-white/40 font-mono text-xs">
                        ${investment.tokenSymbol}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <MilestonesLeftBadge
                        remaining={investment.remainingMilestones}
                        total={investment.totalMilestones}
                      />
                      <span className="text-neon-cyan font-mono text-xs font-bold">
                        {investment.amountHsk} HSK invertidos
                      </span>
                    </div>
                    {(investment.tokenAddress || investment.refunded) && (
                      <div className="flex items-center justify-between gap-3">
                        {investment.tokenAddress ? (
                          <TokenBalance
                            tokenAddress={investment.tokenAddress}
                            tokenSymbol={investment.tokenSymbol}
                          />
                        ) : (
                          <span />
                        )}
                        {investment.refunded && (
                          <span className="text-warning-orange font-mono text-xs">
                            [↺] REEMBOLSADO
                          </span>
                        )}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section aria-label="Mis Startups">
            {profile.role === "investor" ? (
              <EmptyStartupsState
                onLaunchClick={() => setIsUpgradeModalOpen(true)}
              />
            ) : startups.length === 0 ? (
              <MinimalStartupEmptyState
                onCreateCampaignClick={() => router.push("/campaigns/create")}
              />
            ) : (
              <div className="flex flex-col gap-3">
                {startups.map((startup) => (
                  <Link
                    key={startup.id}
                    href={`/campaigns/${startup.id}`}
                    className="border-muted-teal/40 bg-terminal-gray/60 hover:border-neon-cyan flex flex-col gap-2 border p-4 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-sm font-bold">
                        {startup.name}
                      </span>
                      <span className="text-off-white/40 font-mono text-xs">
                        [{startup.status}]
                      </span>
                    </div>
                    <ProgressBar value={startup.progressPct} />
                    <div className="flex items-center justify-between gap-3 font-mono text-xs">
                      <span className="text-neon-cyan font-bold">
                        {startup.raisedAmount.toLocaleString("en-US")} /{" "}
                        {startup.goalAmount.toLocaleString("en-US")} HSK
                      </span>
                      <span className="text-off-white/50">
                        {startup.backers} inversores
                      </span>
                    </div>
                    <MilestonesLeftBadge
                      remaining={startup.remainingMilestones}
                      total={startup.totalMilestones}
                    />
                    {startup.status === "DRAFT" && (
                      <span className="text-warning-orange font-mono text-xs">
                        ESCROW PENDIENTE — entra a la campaña para desplegarlo
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}
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

// The identity header + a bare tab list read as a profile page, not a
// dashboard — this rolls up the numbers that already live in `investments`/
// `startups` (no extra fetch) into the "at a glance" tiles a dashboard is
// expected to lead with.
function DashboardStats({
  role,
  investments,
  startups,
}: {
  role: ProfileRole;
  investments: InvestmentSummary[];
  startups: StartupSummary[];
}) {
  const tiles: [string, string][] =
    role === "investor"
      ? [
          [
            `${investments.reduce((sum, i) => sum + i.amountHsk, 0).toLocaleString("en-US")} HSK`,
            "TOTAL INVERTIDO",
          ],
          [String(investments.length), "PROYECTOS FINANCIADOS"],
          [
            String(
              investments.reduce((sum, i) => sum + i.remainingMilestones, 0),
            ),
            "HITOS PENDIENTES",
          ],
        ]
      : [
          [
            `${startups.reduce((sum, s) => sum + s.raisedAmount, 0).toLocaleString("en-US")} HSK`,
            "TOTAL RECAUDADO",
          ],
          [
            String(startups.filter((s) => s.status === "ACTIVE").length),
            "CAMPAÑAS ACTIVAS",
          ],
          [
            String(startups.reduce((sum, s) => sum + s.backers, 0)),
            "INVERSORES TOTALES",
          ],
        ];

  return (
    <div className="border-neon-cyan/20 divide-neon-cyan/20 mt-6 grid grid-cols-1 divide-y border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {tiles.map(([value, label]) => (
        <div key={label} className="flex flex-col gap-1 p-5">
          <span className="text-neon-cyan font-mono text-xl font-bold">
            {value}
          </span>
          <span className="text-off-white/50 font-mono text-xs tracking-widest">
            {label}
          </span>
        </div>
      ))}
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
