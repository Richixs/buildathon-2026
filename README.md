# EQUITY_CHAIN

Crowdfunding de equity tokenizado (SAFE) sobre **HashKey Chain** (HSK). El
capital del inversor queda en un escrow on-chain y se libera a la startup
solo cuando se cumplen hitos. Si la ronda no se llena o la campaña se aborta,
el inversor reclama un reembolso pro-rata de lo que quede en el contrato.

Este README es la fuente de verdad del repo para humanos y para Claude.
Léelo antes de tocar código. El stack Next.js de este proyecto **no** es el
de tu training data — ver `AGENTS.md` y `node_modules/next/dist/docs/`.

**Estado real (2026-09-13):** app y contratos están **cableados de punta a
punta**. El founder despliega su `EquityEscrow` desde su wallet vía la
factory, el inversor llama a `escrow.invest()`, y la API verifica cada tx
on-chain antes de escribir Postgres. Hitos, cancelación admin, expiración y
reembolsos tienen UI.

**Lo único que falta para el demo en testnet es operativo:** desplegar
`EquityEscrowFactory` en HashKey Testnet (hace falta una `PRIVATE_KEY` con
HSK, que este repo no tiene ni debe tener) y poner su address en
`NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS`. Sin eso, las campañas se guardan como
`DRAFT` y no se pueden activar. La migración
`20260913120000_wire_escrow_onchain` tampoco se aplicó a ninguna base
desde esta sesión.

---

## Para Claude — restricciones duras

- Responde en **español**. UI y copy de producto también en español.
- **No** mezcles el toolchain de `contracts/` con el de la raíz. La raíz es
  pnpm + Next + Jest + Prettier + ESLint. `contracts/` es npm + Hardhat +
  Mocha/chai y está excluido de `tsconfig`, `eslint`, `prettier` y `jest`.
  El único puente es `contracts/scripts/export-abis.js` → `lib/abi/`.
- **No** escribas exploits, PoCs ofensivos ni procedimientos de ataque.
- Antes de escribir código Next.js, lee la guía relevante en
  `node_modules/next/dist/docs/` (Next 16, App Router, React 19).
- No inventes columnas, env vars, ABIs ni addresses. Si falta, dilo.
- El escrow usa **HSK nativo** (`payable` / `msg.value`), no USDC.
- **Nunca confíes en montos, addresses ni status que mande el cliente.**
  Las rutas reciben un `txHash` (o un id) y leen la verdad de la chain con
  `lib/escrow/server.ts`. `Campaign.status`, `raisedAmount`,
  `escrowBalance`, `Milestone.isCompleted` e `Investment.refundedAt` solo
  los escriben `POST /api/campaigns/[id]/activate` y `lib/escrow/sync.ts`.
- Si cambias Solidity: compila, corre `export-abis.js` y commitea
  `lib/abi/`. CI falla si no coinciden.
- Lecturas "al último bloque" con viem: `getBlockNumber({ cacheTime: 0 })`.
  Sin eso viem reusa el bloque ~4 s y un sync post-tx persiste estado viejo
  (lo detectó el e2e).
- No hay auth de sesión: `POST /api/campaigns` y `/api/investments` confían
  en `walletAddress` del body para _identificar_ el perfil. Las rutas que
  cambian estado on-chain no dependen de eso (la tx prueba quién firmó).
  No "arregles" la auth de paso a menos que sea el ticket.

---

## Stack

| Capa                 | Tech                                                     |
| -------------------- | -------------------------------------------------------- |
| App                  | Next.js 16.3 (App Router), React 19, Tailwind 4, TS      |
| Web3 cliente         | wagmi 3 + viem 2 + Reown AppKit (`@reown/appkit`)        |
| Web3 servidor        | viem `createPublicClient` (`lib/escrow/server.ts`)       |
| Redes                | HashKey Testnet `133`, Mainnet `177` (`config/wagmi.ts`) |
| DB                   | PostgreSQL 18 + Prisma 7 (`@prisma/adapter-pg`)          |
| Contratos            | Solidity 0.8.24, OpenZeppelin 5, Hardhat 2 (subproyecto) |
| Tests app            | Jest + Testing Library — 155 tests + 4 e2e opt-in        |
| Tests contratos      | Mocha/chai in-memory (12 tests)                          |
| CI                   | lint + Jest; Hardhat + check de ABIs + e2e en nodo local |
| Package manager raíz | `pnpm@12.4.1`                                            |

Nombre npm de la app: `buildathon-pollar-track`. Marca: `EQUITY_CHAIN`.

---

## Estructura

```
app/
  page.tsx                          landing (stats: escrow custodiado, campañas, hitos)
  startups/                         feed de campañas ACTIVE
  campaigns/create/                 CreateCampaignForm
  campaigns/[id]/                   detalle + EscrowPanel + InvestForm / DeployEscrowButton
  profile/                          dashboard (ProfileGuard + tabs)
  api/profile/                      GET/POST/PATCH perfil
  api/campaigns/                    GET feed / GET by founder / POST alta DRAFT
  api/campaigns/[id]/               GET detalle
  api/campaigns/[id]/activate/      POST: verifica deploy de la factory → ACTIVE
  api/campaigns/[id]/sync/          POST: reconcilia Postgres con el escrow
  api/investments/                  GET by investor / POST verifica invest()
components/
  campaigns/  CreateCampaignForm, InvestForm, EscrowPanel,
              DeployEscrowButton, TokenBalance, PitchVideo
  profile/    RegistrationForm, ProfileDashboard, ProfileGuard
  web3/       Web3Provider, ConnectButton, WalletQrModal
  layout/     AppShell, HeaderNav
  startup/    ProgressBar, MilestoneStepper
config/wagmi.ts        HashKey + Reown adapter (exige NEXT_PUBLIC_PROJECT_ID)
hooks/
  use-profile.ts       GET /api/profile/:address + createProfile
  use-escrow-write.ts  switch de red + writeContract + espera receipt
  use-deploy-escrow.ts factory.createCampaign + POST activate
  use-now.ts           reloj para deadlines sin Date.now() en render
lib/
  abi/                 ABIs generados (no editar a mano)
  escrow/config.ts     env, mapeo de status, bps, hskToWei (cliente y servidor)
  escrow/server.ts     verifyCampaignDeployment, verifyInvestmentTx, readEscrowState
  escrow/sync.ts       syncCampaignFromChain
  escrow/http.ts       errores de verificación → respuestas HTTP
  campaigns.ts         queries + DTO
  format.ts            formatHsk / formatTokens
  validations/         Zod createCampaign / activateCampaign / createInvestment
prisma/schema.prisma   Profile, Campaign, Milestone, Investment
contracts/             Hardhat aislado — ver contracts/README.md
```

---

## Modelo de datos (Prisma)

Montos en `Decimal(36, 18)`: misma precisión que el wei on-chain.

`Profile` — `address` PK lowercased. `role` string `"investor" | "startup"`.

`Campaign`

| Campo                    | Notas                                                            |
| ------------------------ | ---------------------------------------------------------------- |
| `status`                 | `DRAFT` \| `ACTIVE` \| `FUNDED` \| `COMPLETED` \| `FAILED`       |
| `goalAmount`             | HSK                                                              |
| `raisedAmount`           | `EquityEscrow.totalRaised` (sync)                                |
| `escrowBalance`          | `EquityEscrow.escrowBalance()` (sync) — lo realmente custodiado  |
| `equityOffered`          | % SAFE, `Decimal(5, 2)`. On-chain va en **bps** (`12.50` → 1250) |
| `tokenSymbol`            | 3–5 letras A-Z, uppercase                                        |
| `fundingDurationSeconds` | lo pide el form en días; se pasa a `createCampaign`              |
| `fundingDeadline`        | leído de la chain al activar                                     |
| `contractAddress`        | escrow, `@unique`, lo escribe solo `activate`                    |
| `tokenAddress`           | `EquityToken` del escrow                                         |
| `deployTxHash`           | tx de `createCampaign`, `@unique`                                |

El DTO usa `raisedAmount` de la columna si hay `contractAddress`; para filas
viejas sin escrow cae al `SUM(Investment.amount)`.

`Milestone` — `position` = índice en `milestonePercentages` (orden de
liberación = orden del form, **no** `targetDate`). `@@unique([campaignId,
position])`. `releasePercentage` enteros que suman 100 (Zod + constructor).
`isCompleted` lo escribe el sync desde `currentMilestoneIndex`.

`Investment` — `amount` sale del evento `Invested`, no del cliente.
`txHash` unique. `refundedAt` lo pone el sync cuando
`investments(investor) == 0` en un escrow `Failed`.

Mapeo de estados:

| Prisma      | EquityEscrow.Status | Quién lo setea                |
| ----------- | ------------------- | ----------------------------- |
| `DRAFT`     | — (no hay escrow)   | default al crear              |
| `ACTIVE`    | `Funding` (0)       | `POST .../activate`           |
| `FUNDED`    | `Active` (1)        | sync (la inversión que llena) |
| `COMPLETED` | `Completed` (2)     | sync (último hito liberado)   |
| `FAILED`    | `Failed` (3)        | sync (expiración o cancel)    |

---

## Flujos

```
Founder (role=startup)
  /campaigns/create → CreateCampaignForm
    1. POST /api/campaigns                    → Campaign DRAFT + milestones(position)
    2. wallet: factory.createCampaign(goal wei, bps, duración, título, ticker, %s)
    3. POST /api/campaigns/[id]/activate {txHash}
         server: receipt ok + CampaignCreated de NUESTRA factory + startup == founder
                 + goal/símbolo/bps/%s/duración == Postgres → ACTIVE
    4. redirect /campaigns/[id]
  Si 2 o 3 fallan: queda DRAFT; la página de la campaña muestra
  DeployEscrowButton al founder para reintentar.

Inversor
  /campaigns/[id] (ACTIVE) → InvestForm
    - exige wallet, perfil, no ser el founder
    - lee status/goal/totalRaised/deadline on-chain, capa a lo que falta
    1. wallet: escrow.invest{value}
    2. POST /api/investments {walletAddress, campaignId, txHash}
         server: receipt ok + to == escrow + Invested(investor) → row + sync
    Si 2 falla con la tx ya minada: botón REINTENTAR_REGISTRO (no reenvía HSK).

EscrowPanel (detalle de cualquier campaña con escrow)
  - estado on-chain, custodiado, liberado, deadline, links al explorer
  - tu posición: balance de $TICKER + aporte
  - LIBERAR_HITO            startup o admin, status Active
  - ADMIN: CANCELAR_CAMPAÑA owner() de la factory, status Active
  - MARCAR_RONDA_FALLIDA    cualquiera, Funding + deadline vencido
  - RECLAMAR_REEMBOLSO      inversor con aporte, status Failed
  Tras cada tx → POST /sync. Además, si al cargar la chain difiere de
  Postgres (status, raised, balance, hitos) dispara un sync.

Perfil
  MIS_INVERSIONES → balance de tokens por campaña + [↺] REEMBOLSADO
  MIS_STARTUPS    → borradores marcados "ESCROW PENDIENTE"
```

Rutas API:

| Método | Path                           | Qué hace                                         |
| ------ | ------------------------------ | ------------------------------------------------ |
| GET    | `/api/profile?address=`        | perfil o 404                                     |
| GET    | `/api/profile/[address]`       | igual (la usa `useCheckProfile`)                 |
| POST   | `/api/profile`                 | alta                                             |
| PATCH  | `/api/profile`                 | upgrade investor→startup                         |
| GET    | `/api/campaigns`               | ACTIVE; `?founder=` → todas las del founder      |
| POST   | `/api/campaigns`               | alta DRAFT; exige perfil `role=startup`          |
| GET    | `/api/campaigns/[id]`          | detalle                                          |
| POST   | `/api/campaigns/[id]/activate` | `{txHash}` → verifica deploy → ACTIVE            |
| POST   | `/api/campaigns/[id]/sync`     | reconcilia con la chain (sin auth, solo lee)     |
| GET    | `/api/investments?investor=`   | historial (+ `tokenAddress`, `refundedAt`)       |
| POST   | `/api/investments`             | `{walletAddress, campaignId, txHash}` verificado |

Códigos de verificación: `409` tx aún no minada / ya registrada / campaña
sin escrow, `422` la tx no corresponde, `502` RPC caído, `503` factory sin
configurar.

---

## Contratos

Fuente: `contracts/`. Docs: `contracts/README.md`.

- **EquityToken** — ERC20, mint/burn solo por su escrow, 1 token = 1 wei
  invertido.
- **EquityEscrow** (una instancia por campaña) — `invest()`,
  `markFailedIfExpired()`, `releaseNextMilestone()` (startup o admin),
  `cancelCampaign(reason)` (solo admin), `claimRefund()`. Sin
  `receive()`/`fallback()`: un transfer pelado revierte.
- **EquityEscrowFactory** — `createCampaign(...)`: `msg.sender` = startup,
  admin de cada escrow = `owner()` de la factory. Emite `CampaignCreated`.

---

## Verificación (2026-09-13)

| Qué                                     | Resultado                                |
| --------------------------------------- | ---------------------------------------- |
| Hardhat in-memory                       | 12/12                                    |
| Jest (APIs, lib/escrow, forms, perfil)  | 155/155, umbrales de cobertura OK        |
| e2e app ↔ contratos (nodo Hardhat real) | 4/4                                      |
| `tsc --noEmit` / ESLint                 | limpios                                  |
| `next build`                            | OK (13 rutas, incl. `activate` y `sync`) |
| RPC HashKey Testnet                     | `eth_chainId` = `0x85` (133)             |

El e2e (`lib/escrow/escrow.e2e.test.ts`) despliega la factory y recorre, con
las mismas funciones que usan las rutas: deploy verificado + rechazo de
términos alterados → `invest` verificado + rechazo de tx ajena → meta
alcanzada → hito liberado → cancel admin → refund pro-rata (2.4 HSK quedan)
→ ronda vencida marcada fallida por un tercero.

**No verificado:** la UI con una wallet real en un browser (los componentes
están testeados con wagmi mockeado, `EscrowPanel`, `CreateCampaignForm` y
`DeployEscrowButton` sin tests de UI), la migración contra Postgres real, y
nada en testnet (sin factory desplegada).

---

## Qué queda

### Para el demo

1. **Desplegar la factory en HashKey Testnet** y configurar
   `NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS` (app, CI `vars`, compose).
2. `pnpm prisma:deploy` de la migración `wire_escrow_onchain`.
   Campañas `ACTIVE` viejas sin escrow ya no aceptan inversiones: pasarlas a
   `DRAFT` a mano si se quieren desplegar.
3. Probar el flujo en browser con una wallet en testnet.

### Producto / seguridad (fuera del alcance de este cableado)

- **Auth** (SIWE / body firmado) para perfil, alta de campaña y registro
  de inversión.
- **Indexer de eventos.** El sync corrige totales, status, hitos y
  reembolsos, pero si un `invest()` nunca llegó a `POST /api/investments`
  (y nadie reintentó), esa fila de `Investment` no existe: el total del
  feed es correcto, el historial del inversor no.
- **Una sola red de escrow** (`NEXT_PUBLIC_ESCROW_CHAIN_ID`). Soportar
  factories en 133 y 177 a la vez requiere address por red.
- El feed `/startups` solo lista `ACTIVE`; las `FUNDED`/`COMPLETED` solo se
  ven por link o perfil.
- Founder puede invertir en su propia campaña **llamando al contrato
  directo** (UI y API lo bloquean; el contrato no).
- Oracle real de hitos (hoy admin EOA), stablecoin en lugar de HSK nativo,
  KYC / acreditación / documento SAFE, restricciones de transferencia del
  token y mercado secundario.

---

## Setup local

### App

```bash
cp .env.example .env
# DATABASE_URL, NEXT_PUBLIC_PROJECT_ID (https://cloud.reown.com)
# NEXT_PUBLIC_ESCROW_CHAIN_ID (133) y NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS
# ESCROW_RPC_URL opcional (servidor)

docker compose -f compose.dev.yml up -d          # Postgres 18 en :5432
# o: docker compose up -d                         # db + app (lee ./.env)

pnpm install          # postinstall = prisma generate (necesita DATABASE_URL)
pnpm prisma:migrate   # o pnpm prisma:deploy
pnpm dev              # http://localhost:3000
```

`prisma generate` falla si `DATABASE_URL` no está exportada (no hace falta
que Postgres responda).

### Contratos

```bash
cd contracts
npm install
node ./node_modules/hardhat/internal/cli/cli.js compile
node ./node_modules/hardhat/internal/cli/cli.js test
node ./scripts/export-abis.js       # tras cambiar Solidity → ../lib/abi

cp .env.example .env                # PRIVATE_KEY con HSK; ADMIN_ADDRESS opcional
npm run deploy:testnet              # imprime la address de la factory
```

En WSL2, si `npm` resuelve a `CMD.EXE` (error HH1 / UNC), usa el invocador
`node ./node_modules/hardhat/internal/cli/cli.js` también para `run`.

### e2e app ↔ contratos

```bash
cd contracts && node ./node_modules/hardhat/internal/cli/cli.js node   # terminal 1
ESCROW_E2E_RPC_URL=http://127.0.0.1:8545 pnpm exec jest lib/escrow/escrow.e2e
```

### Scripts raíz

| Script                                                   | Qué                         |
| -------------------------------------------------------- | --------------------------- |
| `pnpm dev` / `build` / `start`                           | Next                        |
| `pnpm test` / `test:watch`                               | Jest (e2e se salta sin env) |
| `pnpm lint` / `format` / `format:check`                  | ESLint + Prettier           |
| `pnpm prisma:generate` / `migrate` / `deploy` / `studio` | Prisma                      |

CI PR (`ci.yml`): job `test` (lint + Jest con cobertura) y job `contracts`
(Hardhat compile+test, `git diff` de `lib/abi`, nodo local + e2e). CI
`main`: Docker `target: runner` → GHCR con build-args
`NEXT_PUBLIC_PROJECT_ID`, `NEXT_PUBLIC_APP_URL`,
`NEXT_PUBLIC_ESCROW_CHAIN_ID`, `NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS` (GitHub
`vars`).

---

## Convenciones

- Addresses se **guardan y buscan** en lowercase (`normalizeAddress`).
- HSK ↔ wei con `hskToWei` / `weiToHsk` (`lib/escrow/config.ts`); display
  con `formatHsk` / `formatTokens`. Nunca `$`/USD.
- `tokenSymbol` uppercase en Zod (client y server).
- Hitos: ≥1, enteros, suman **exactamente** 100 — Zod, form y constructor.
- Server Components leen Postgres via `lib/campaigns.ts`, sin `fetch`
  interno. `/` y `/startups` son `force-dynamic`.
- `process.env` de escrow se lee en tiempo de llamada (testeable).
- Comentarios de código en inglés. Copy de UI en español, tono terminal
  (`DESPLEGAR_CAMPAÑA`, `INVERTIR_AHORA`, `LIBERAR_HITO`).
- Paleta CRT / neon (`globals.css`) — no rediseñar de paso.
- Umbrales de cobertura ≥ 85 en `jest.config.ts` (incluye `lib/escrow/`,
  `InvestForm`, `activate` y `sync`).
- No commitear `.env`, `PRIVATE_KEY`, ni secrets.

---

## Decisiones de diseño que no hay que "corregir" sin ticket

- Una factory por red; el founder paga el deploy de _su_ escrow. No hay
  wallet backend.
- Admin/oracle = `owner()` de la factory, distinto del founder.
- Mint 1:1 con HSK, no ponderado por `equityOffered`.
- HSK nativo, no IERC20.
- Alta en dos pasos (DRAFT → activate con `txHash`) para no perder la
  campaña si la wallet rechaza o la tx se cae.
- Activación y sync verifican contra la chain en lugar de aceptar
  `contractAddress`/`status` del cliente. `sync` es público porque solo
  puede acercar Postgres a la verdad.
- Se eliminó el camino de tesorería (`NEXT_PUBLIC_TREASURY_ADDRESS`): sin
  escrow no se invierte.
- `role` como string, no enum Prisma.
