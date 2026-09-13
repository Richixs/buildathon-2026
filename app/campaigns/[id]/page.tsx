import AppShell from "@/components/layout/AppShell";
import ProgressBar from "@/components/startup/ProgressBar";
import MilestoneStepper from "@/components/startup/MilestoneStepper";
import InvestForm from "@/components/campaigns/InvestForm";
import EscrowPanel from "@/components/campaigns/EscrowPanel";
import DeployEscrowButton from "@/components/campaigns/DeployEscrowButton";
import PitchVideo from "@/components/campaigns/PitchVideo";
import { getCampaignById } from "@/lib/campaigns";
import { shortenAddress } from "@/lib/address";
import { formatHsk } from "@/lib/format";
import { STATUS_LABELS, type CampaignStatusValue } from "@/lib/escrow/config";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await getCampaignById(id);

  if (!campaign) {
    return (
      <AppShell>
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 py-20 text-center">
          <p className="text-off-white/70 font-mono text-sm">
            No se encontró esta campaña.
          </p>
        </div>
      </AppShell>
    );
  }

  const status = campaign.status as CampaignStatusValue;
  const pct =
    campaign.goalAmount > 0
      ? Math.round((campaign.raisedAmount / campaign.goalAmount) * 100)
      : 0;
  const completedMilestones = campaign.milestones.filter(
    (m) => m.isCompleted,
  ).length;

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-teal font-mono text-xs tracking-widest">
              [@{campaign.founder.alias}] ·{" "}
              {shortenAddress(campaign.founder.address)}
            </span>
            <span
              className={`font-mono text-xs font-bold ${
                status === "FUNDED" || status === "COMPLETED"
                  ? "text-retro-green"
                  : status === "FAILED"
                    ? "text-red-400"
                    : "text-off-white/60"
              }`}
            >
              ${campaign.tokenSymbol} · {STATUS_LABELS[status]}
            </span>
          </div>

          <h1 className="font-mono text-3xl font-bold tracking-tight sm:text-4xl">
            {campaign.title}
          </h1>
          <p className="text-off-white/70 max-w-2xl font-sans text-base leading-7">
            {campaign.description}
          </p>
          <span className="text-neon-cyan/80 font-mono text-xs">
            OFRECE {campaign.equityOffered}% EQUITY (SAFE TOKENIZADO)
          </span>
        </div>

        {campaign.pitchVideoUrl && <PitchVideo url={campaign.pitchVideoUrl} />}

        <div className="bg-terminal-gray border-neon-cyan/30 shadow-brutal-sm flex flex-col gap-3 border p-6">
          <ProgressBar value={pct} />
          <div className="flex items-center justify-between font-mono text-sm">
            <span className="text-neon-cyan font-bold">
              {formatHsk(campaign.raisedAmount)} /{" "}
              {formatHsk(campaign.goalAmount)}
            </span>
            <span className="text-off-white/50">
              {campaign.backers} inversores
            </span>
          </div>
          <span className="text-off-white/40 font-mono text-xs">
            {campaign.contractAddress
              ? `${formatHsk(campaign.escrowBalance)} custodiados en escrow`
              : "Escrow on-chain sin desplegar"}
          </span>
        </div>

        {campaign.milestones.length > 0 && (
          <div className="bg-terminal-gray border-neon-cyan/30 shadow-brutal-sm flex flex-col gap-3 border p-6">
            <span className="text-off-white/40 font-mono text-xs tracking-widest">
              HITOS DE LIBERACIÓN
            </span>
            <MilestoneStepper
              milestones={campaign.milestones.map(
                (m) => `${m.title} · ${m.releasePercentage}%`,
              )}
              current={completedMilestones}
            />
          </div>
        )}

        {campaign.contractAddress && (
          <EscrowPanel
            campaignId={campaign.id}
            contractAddress={campaign.contractAddress}
            tokenAddress={campaign.tokenAddress}
            tokenSymbol={campaign.tokenSymbol}
            milestones={campaign.milestones.map((m) => ({
              title: m.title,
              releasePercentage: m.releasePercentage,
            }))}
            dbStatus={campaign.status}
            dbRaisedAmount={campaign.raisedAmount}
            dbEscrowBalance={campaign.escrowBalance}
            dbCompletedMilestones={completedMilestones}
          />
        )}

        {status === "DRAFT" ? (
          <div className="border-warning-orange/40 bg-terminal-gray flex flex-col items-center gap-4 border p-6 text-center">
            <p className="text-warning-orange font-mono text-xs tracking-widest">
              [ BORRADOR — ESCROW PENDIENTE ]
            </p>
            <DeployEscrowButton
              founderAddress={campaign.founderAddress}
              campaign={{
                id: campaign.id,
                title: campaign.title,
                goalAmount: campaign.goalAmount,
                equityOffered: campaign.equityOffered,
                tokenSymbol: campaign.tokenSymbol,
                fundingDurationSeconds: campaign.fundingDurationSeconds,
                milestones: campaign.milestones.map((m) => ({
                  releasePercentage: m.releasePercentage,
                  position: m.position,
                })),
              }}
            />
          </div>
        ) : status === "ACTIVE" && campaign.contractAddress ? (
          <InvestForm
            campaignId={campaign.id}
            contractAddress={campaign.contractAddress}
            founderAddress={campaign.founderAddress}
          />
        ) : (
          <div className="border-off-white/20 bg-terminal-gray border p-6 text-center">
            <p className="text-off-white/70 font-mono text-sm">
              {campaign.contractAddress
                ? `Esta campaña ya no acepta inversiones (${STATUS_LABELS[status]}).`
                : "Esta campaña no tiene escrow on-chain y no acepta inversiones."}
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
