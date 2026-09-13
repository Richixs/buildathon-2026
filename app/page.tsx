import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import { getPlatformStats } from "@/lib/campaigns";
import { formatHsk } from "@/lib/format";

const steps = [
  {
    n: "01",
    title: "LA_OFERTA",
    body: "La startup tokeniza su ronda: emite Security Tokens respaldados por un acuerdo SAFE on-chain (ej. $100K por 10% de equity).",
  },
  {
    n: "02",
    title: "INVERSIÓN_+_ESCROW",
    body: "El inversor deposita HSK en el Smart Contract de Escrow y recibe sus tokens de equity al instante (1:1). El capital queda bloqueado.",
  },
  {
    n: "03",
    title: "LIBERACIÓN_POR_HITOS",
    body: "El contrato libera fondos solo cuando se cumplen hitos verificables. Si la startup falla, el capital restante vuelve al inversor.",
  },
];

// Otherwise Next statically prerenders this page at build time and the
// stats strip (queried directly from Postgres, not via fetch()) would go
// stale until the next deploy — same "live totals" principle as
// GET /api/campaigns.
export const dynamic = "force-dynamic";

export default async function Home() {
  const stats = await getPlatformStats();

  const statTiles: [string, string][] = [
    [formatHsk(stats.escrowBalanceHsk), "CAPITAL EN ESCROW"],
    [String(stats.campaignsCount), "STARTUPS TOKENIZADAS"],
    [String(stats.milestonesCompleted), "HITOS CUMPLIDOS"],
    // Not derived from any query — there's no mechanism in this system by
    // which a founder can withdraw escrowed funds outside milestone
    // releases, so this is always true by construction, not a placeholder.
    ["0", "RUG PULLS"],
  ];

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
          <Link
            href="/campaigns/create"
            className="bg-neon-cyan shadow-brutal hover:shadow-brutal-lg border-crt-black text-crt-black border-2 px-6 py-3 text-center font-mono font-bold transition-shadow active:translate-x-1 active:translate-y-1 active:shadow-none"
          >
            TOKENIZAR_MI_STARTUP
          </Link>
          <Link
            href="/startups"
            className="border-off-white/30 hover:border-neon-cyan hover:text-neon-cyan border-2 px-6 py-3 text-center font-mono font-bold transition-colors"
          >
            EXPLORAR_STARTUPS
          </Link>
        </div>
      </section>

      <section className="border-neon-cyan/20 divide-neon-cyan/20 grid grid-cols-2 divide-x divide-y border sm:grid-cols-4 sm:divide-y-0">
        {statTiles.map(([value, label]) => (
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

      <section id="para-quien-es-esto" className="flex flex-col gap-8">
        <h2 className="font-mono text-2xl font-bold tracking-tight">
          PARA_QUIÉN_ES_ESTO
        </h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="border-neon-cyan/30 shadow-brutal-sm flex flex-col gap-4 border p-6">
            <span className="text-neon-cyan font-mono text-sm font-bold tracking-widest">
              [ PARA_FUNDADORES ]
            </span>
            <ul className="text-off-white/70 flex flex-col gap-3 font-sans text-sm leading-6">
              <li>
                <span className="text-retro-green">→</span> Levanta capital sin
                ceder el 100% por adelantado: el escrow libera fondos a medida
                que cumples hitos, no antes.
              </li>
              <li>
                <span className="text-retro-green">→</span> Tu ronda queda
                tokenizada y visible en{" "}
                <Link href="/startups" className="text-neon-cyan underline">
                  /startups
                </Link>{" "}
                para cualquier inversor con wallet.
              </li>
              <li>
                <span className="text-retro-green">→</span> Cero papeleo legal
                tradicional para empezar a recibir compromisos de inversión.
              </li>
            </ul>
          </div>

          <div className="border-neon-cyan/30 shadow-brutal-sm flex flex-col gap-4 border p-6">
            <span className="text-neon-cyan font-mono text-sm font-bold tracking-widest">
              [ PARA_INVERSORES ]
            </span>
            <ul className="text-off-white/70 flex flex-col gap-3 font-sans text-sm leading-6">
              <li>
                <span className="text-retro-green">→</span> Tu capital no se
                entrega de golpe: si la startup no cumple, lo que no se liberó
                vuelve a ti.
              </li>
              <li>
                <span className="text-retro-green">→</span> Sigues el avance
                hito por hito desde tu propio panel, no por un reporte
                trimestral.
              </li>
              <li>
                <span className="text-retro-green">→</span> Cada inversión queda
                registrada con un hash de transacción verificable on-chain.
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section
        id="startups"
        className="border-neon-cyan/30 bg-terminal-gray shadow-brutal-sm flex flex-col items-center gap-4 border p-10 text-center"
      >
        <h2 className="font-mono text-2xl font-bold tracking-tight">
          ¿LISTO PARA INVERTIR?
        </h2>
        <p className="text-off-white/70 max-w-xl font-sans text-sm leading-6">
          Mira todas las startups que están levantando capital ahora mismo, con
          sus hitos y el escrow bloqueado de cada una.
        </p>
        <Link
          href="/startups"
          className="bg-neon-cyan text-crt-black border-crt-black hover:shadow-brutal border-2 px-6 py-3 font-mono font-bold transition-shadow"
        >
          VER_STARTUPS_ACTIVAS →
        </Link>
      </section>
    </AppShell>
  );
}
