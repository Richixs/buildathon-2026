import AppShell from "@/components/layout/AppShell";
import ProgressBar from "@/components/startup/ProgressBar";
import MilestoneStepper from "@/components/startup/MilestoneStepper";

const steps = [
  {
    n: "01",
    title: "LA_OFERTA",
    body: "La startup tokeniza su ronda: emite Security Tokens respaldados por un acuerdo SAFE on-chain (ej. $100K por 10% de equity).",
  },
  {
    n: "02",
    title: "INVERSIÓN_+_ESCROW",
    body: "El inversor deposita USDC en el Smart Contract de Escrow y recibe sus tokens de equity al instante. El capital queda bloqueado.",
  },
  {
    n: "03",
    title: "LIBERACIÓN_POR_HITOS",
    body: "El contrato libera fondos solo cuando se cumplen hitos verificables. Si la startup falla, el capital restante vuelve al inversor.",
  },
];

const startups = [
  {
    sector: "FINTECH",
    name: "NEXUS_LABS",
    token: "$NXS",
    description:
      "Infraestructura de pagos cross-border para remesas en Latinoamérica.",
    equityOffered: 10,
    goal: 100_000,
    raised: 62_000,
    backers: 84,
    milestones: ["MVP", "1K usuarios", "Serie A"],
    currentMilestone: 1,
  },
  {
    sector: "SAAS",
    name: "GHOST_STACK",
    token: "$GHST",
    description: "Observabilidad self-hosted con cero telemetría a terceros.",
    equityOffered: 8,
    goal: 60_000,
    raised: 60_000,
    backers: 156,
    milestones: ["Beta cerrada", "Beta pública", "$10K MRR"],
    currentMilestone: 2,
  },
  {
    sector: "GAMEFI",
    name: "ARCADE.SOL",
    token: "$ARC",
    description:
      "Torneos NFT con puntuaciones verificables y premios en cadena.",
    equityOffered: 12,
    goal: 150_000,
    raised: 28_500,
    backers: 41,
    milestones: ["Demo jugable", "500 jugadores activos", "Publisher deal"],
    currentMilestone: 0,
  },
];

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

export default function Home() {
  return (
    <AppShell>
      <section className="flex flex-col items-start gap-6">
        <span className="text-retro-green border-retro-green/40 bg-retro-green/10 border px-2 py-1 font-mono text-xs tracking-widest">
          ● SECURITY TOKENS RESPALDADOS POR ESCROW
        </span>
        <h1 className="max-w-2xl font-mono text-4xl leading-tight font-bold tracking-tight sm:text-6xl">
          Compra equity real,{" "}
          <span className="text-neon-cyan">protegido por hitos.</span>
        </h1>
        <p className="text-off-white/70 max-w-xl font-sans text-lg leading-8">
          Invierte en startups vía SAFE tokenizado. Tu capital queda en escrow
          on-chain y se libera solo cuando la startup cumple sus hitos — si
          falla, recuperas lo que no se liberó.
        </p>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row">
          <button className="bg-neon-cyan shadow-brutal hover:shadow-brutal-lg border-crt-black text-crt-black border-2 px-6 py-3 font-mono font-bold transition-shadow active:translate-x-1 active:translate-y-1 active:shadow-none">
            TOKENIZAR_MI_STARTUP
          </button>
          <button className="border-off-white/30 hover:border-neon-cyan hover:text-neon-cyan border-2 px-6 py-3 font-mono font-bold transition-colors">
            EXPLORAR_STARTUPS
          </button>
        </div>
      </section>

      <section className="border-neon-cyan/20 divide-neon-cyan/20 grid grid-cols-2 divide-x divide-y border sm:grid-cols-4 sm:divide-y-0">
        {[
          ["Ξ 3,921", "CAPITAL EN ESCROW"],
          ["47", "STARTUPS TOKENIZADAS"],
          ["112", "HITOS CUMPLIDOS"],
          ["0", "RUG PULLS"],
        ].map(([value, label]) => (
          <div key={label} className="flex flex-col gap-1 p-6">
            <span className="text-neon-cyan font-mono text-2xl font-bold">
              {value}
            </span>
            <span className="text-off-white/50 font-mono text-xs tracking-widest">
              {label}
            </span>
          </div>
        ))}
      </section>

      <section id="como-funciona" className="flex flex-col gap-8">
        <h2 className="font-mono text-2xl font-bold tracking-tight">
          CÓMO_FUNCIONA
        </h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div
              key={s.n}
              className="bg-terminal-gray border-neon-cyan/30 shadow-brutal-sm flex flex-col gap-3 border p-6"
            >
              <span className="text-muted-teal font-mono text-3xl font-bold">
                {s.n}
              </span>
              <h3 className="text-neon-cyan font-mono text-lg font-bold">
                {s.title}
              </h3>
              <p className="text-off-white/70 font-sans text-sm leading-6">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section id="startups" className="flex flex-col gap-8">
        <div className="flex items-end justify-between">
          <h2 className="font-mono text-2xl font-bold tracking-tight">
            STARTUPS_ACTIVAS
          </h2>
          <a
            href="#"
            className="text-muted-teal hover:text-neon-cyan font-mono text-sm transition-colors"
          >
            VER_TODAS →
          </a>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {startups.map((s) => {
            const pct = Math.round((s.raised / s.goal) * 100);
            const funded = pct >= 100;
            const escrowLocked = s.goal - s.raised;
            return (
              <article
                key={s.name}
                className="bg-terminal-gray border-neon-cyan/30 shadow-brutal-sm hover:shadow-brutal flex flex-col gap-4 border p-6 transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <span className="text-muted-teal font-mono text-xs tracking-widest">
                    [{s.sector}]
                  </span>
                  {funded ? (
                    <span className="text-retro-green font-mono text-xs font-bold">
                      FUNDED ✓
                    </span>
                  ) : (
                    <span className="text-off-white/40 font-mono text-xs">
                      {s.token}
                    </span>
                  )}
                </div>

                <h3 className="font-mono text-xl font-bold">{s.name}</h3>
                <p className="text-off-white/70 font-sans text-sm leading-6">
                  {s.description}
                </p>

                <span className="text-neon-cyan/80 font-mono text-xs">
                  OFRECE {s.equityOffered}% EQUITY (SAFE TOKENIZADO)
                </span>

                <div className="flex flex-col gap-2">
                  <ProgressBar value={pct} />
                  <div className="flex items-center justify-between font-mono text-xs">
                    <span className="text-neon-cyan font-bold">
                      {usd(s.raised)} / {usd(s.goal)}
                    </span>
                    <span className="text-off-white/50">
                      {s.backers} inversores
                    </span>
                  </div>
                </div>

                <div className="border-off-white/10 flex flex-col gap-2 border-t pt-3">
                  <span className="text-off-white/40 font-mono text-[11px] tracking-widest">
                    HITOS DE LIBERACIÓN
                  </span>
                  <MilestoneStepper
                    milestones={s.milestones}
                    current={s.currentMilestone}
                  />
                  <span className="text-off-white/40 font-mono text-[11px]">
                    {usd(escrowLocked)} bloqueados en escrow
                  </span>
                </div>

                <button className="hover:bg-neon-cyan hover:text-crt-black border-off-white/30 mt-2 border-2 py-2 font-mono text-sm font-bold transition-colors">
                  INVERTIR_AHORA
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}
