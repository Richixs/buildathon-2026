import AppShell from "@/components/layout/AppShell";
import ProgressBar from "@/components/startup/ProgressBar";
import MilestoneStepper from "@/components/startup/MilestoneStepper";
import InvestForm from "@/components/campaigns/InvestForm";
import PitchVideo from "@/components/campaigns/PitchVideo";
import { getCampaignById } from "@/lib/campaigns";
import { shortenAddress } from "@/lib/address";

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

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

  const pct = Math.round((campaign.raisedAmount / campaign.goalAmount) * 100);
  const funded = pct >= 100;
  const escrowLocked = Math.max(0, campaign.goalAmount - campaign.raisedAmount);
  const currentMilestone = campaign.milestones.filter(
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
            {funded ? (
              <span className="text-retro-green font-mono text-xs font-bold">
                FUNDED ✓
              </span>
            ) : (
              <span className="text-off-white/40 font-mono text-xs">
                ${campaign.tokenSymbol}
              </span>
            )}
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
              {usd(campaign.raisedAmount)} / {usd(campaign.goalAmount)}
            </span>
            <span className="text-off-white/50">
              {campaign.backers} inversores
            </span>
          </div>
          <span className="text-off-white/40 font-mono text-xs">
            {usd(escrowLocked)} bloqueados en escrow
          </span>
        </div>

        {campaign.milestones.length > 0 && (
          <div className="bg-terminal-gray border-neon-cyan/30 shadow-brutal-sm flex flex-col gap-3 border p-6">
            <span className="text-off-white/40 font-mono text-xs tracking-widest">
              HITOS DE LIBERACIÓN
            </span>
            <MilestoneStepper
              milestones={campaign.milestones.map((m) => m.title)}
              current={currentMilestone}
            />
          </div>
        )}

        {campaign.status === "ACTIVE" ? (
          <InvestForm campaignId={campaign.id} />
        ) : (
          <div className="border-off-white/20 bg-terminal-gray border p-6 text-center">
            <p className="text-off-white/70 font-mono text-sm">
              Esta campaña ya no acepta inversiones ({campaign.status}).
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
