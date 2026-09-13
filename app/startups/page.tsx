import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import ProgressBar from "@/components/startup/ProgressBar";
import MilestoneStepper from "@/components/startup/MilestoneStepper";
import { getActiveCampaigns } from "@/lib/campaigns";
import { formatHsk } from "@/lib/format";

// Same reasoning as app/page.tsx: this queries Postgres directly, so it
// needs to stay dynamic or the feed goes stale until the next deploy.
export const dynamic = "force-dynamic";

export default async function StartupsPage() {
  const campaigns = await getActiveCampaigns();

  return (
    <AppShell>
      <section className="flex flex-col gap-8">
        <div className="flex items-end justify-between">
          <h1 className="font-mono text-2xl font-bold tracking-tight">
            STARTUPS_ACTIVAS
          </h1>
          <span className="text-off-white/50 font-mono text-xs tracking-widest">
            {campaigns.length} EN RONDA
          </span>
        </div>

        {campaigns.length === 0 ? (
          <div className="border-neon-cyan/20 bg-terminal-gray flex flex-col items-center gap-3 border border-dashed p-10 text-center">
            <p className="text-off-white/70 font-sans text-sm">
              Todavía no hay campañas activas. Sé la primera startup en
              tokenizar su ronda.
            </p>
            <Link
              href="/campaigns/create"
              className="bg-neon-cyan text-crt-black border-crt-black hover:shadow-brutal-sm border-2 px-6 py-2 font-mono text-sm font-bold transition-shadow"
            >
              TOKENIZAR_MI_STARTUP
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {campaigns.map((c) => {
              const pct =
                c.goalAmount > 0
                  ? Math.round((c.raisedAmount / c.goalAmount) * 100)
                  : 0;
              const funded = pct >= 100;
              const milestoneTitles = c.milestones.map((m) => m.title);
              const currentMilestone = c.milestones.filter(
                (m) => m.isCompleted,
              ).length;

              return (
                <article
                  key={c.id}
                  className="bg-terminal-gray border-neon-cyan/30 shadow-brutal-sm hover:shadow-brutal flex flex-col gap-4 border p-6 transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-muted-teal font-mono text-xs tracking-widest">
                      [@{c.founder.alias}]
                    </span>
                    {funded ? (
                      <span className="text-retro-green font-mono text-xs font-bold">
                        FUNDED ✓
                      </span>
                    ) : (
                      <span className="text-off-white/40 font-mono text-xs">
                        ${c.tokenSymbol}
                      </span>
                    )}
                  </div>

                  <h3 className="font-mono text-xl font-bold">{c.title}</h3>
                  <p className="text-off-white/70 font-sans text-sm leading-6">
                    {c.description}
                  </p>

                  <span className="text-neon-cyan/80 font-mono text-xs">
                    OFRECE {c.equityOffered}% EQUITY (SAFE TOKENIZADO)
                  </span>

                  <div className="flex flex-col gap-2">
                    <ProgressBar value={pct} />
                    <div className="flex items-center justify-between font-mono text-xs">
                      <span className="text-neon-cyan font-bold">
                        {formatHsk(c.raisedAmount)} / {formatHsk(c.goalAmount)}
                      </span>
                      <span className="text-off-white/50">
                        {c.backers} inversores
                      </span>
                    </div>
                  </div>

                  {milestoneTitles.length > 0 && (
                    <div className="border-off-white/10 flex flex-col gap-2 border-t pt-3">
                      <span className="text-off-white/40 font-mono text-[11px] tracking-widest">
                        HITOS DE LIBERACIÓN
                      </span>
                      <MilestoneStepper
                        milestones={milestoneTitles}
                        current={currentMilestone}
                      />
                      <span className="text-off-white/40 font-mono text-[11px]">
                        {formatHsk(c.escrowBalance)} custodiados en escrow
                      </span>
                    </div>
                  )}

                  <Link
                    href={`/campaigns/${c.id}`}
                    className="hover:bg-neon-cyan hover:text-crt-black border-off-white/30 mt-2 border-2 py-2 text-center font-mono text-sm font-bold transition-colors"
                  >
                    INVERTIR_AHORA
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </AppShell>
  );
}
