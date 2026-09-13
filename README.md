# EQUITY_CHAIN

Crowdfunding de equity tokenizado (SAFE) sobre **HashKey Chain** (HSK). El
capital del inversor queda en un escrow on-chain y se libera a la startup
solo cuando se cumplen hitos. Si la ronda no se llena o la campaña se
cancela, el inversor reclama un reembolso pro-rata de lo que quede en el
contrato.

> El stack Next.js de este proyecto **no** es el de tu training data si sos
> un agente — ver `AGENTS.md` y `node_modules/next/dist/docs/` antes de
> tocar código.

---

## Características

- **Alta de campañas por startups**, con hitos de liberación de fondos
  configurables (`%` por hito, suman 100).
- **Escrow on-chain por campaña**: cada campaña tiene su propio contrato
  `EquityEscrow`, desplegado por el founder desde su wallet.
- **Inversión en HSK nativo**: el inversor manda `invest()` con `value` y
  recibe tokens SAFE (`EquityToken`) 1:1 con lo invertido.
- **Liberación de fondos por hitos**: la startup (o el admin) libera cada
  hito una vez alcanzado; el resto queda custodiado.
- **Cancelación y reembolso**: el admin puede cancelar una ronda activa, y
  cualquiera puede marcar como fallida una ronda vencida sin llenar; en
  ambos casos el inversor reclama su reembolso pro-rata.
- **Verificación estricta on-chain**: la API nunca confía en montos,
  addresses o status enviados por el cliente — siempre lee la transacción
  y el estado del contrato antes de escribir en la base de datos.
- **Sincronización automática**: si el estado en Postgres difiere del
  estado real del contrato (status, recaudado, custodiado, hitos), la app
  dispara una reconciliación antes de mostrar datos desactualizados.
- **Perfil de usuario** con dos roles (`investor` / `startup`), historial
  de inversiones con balance de tokens por campaña, y panel de campañas
  propias para founders.
- **UI en español, tono terminal/CRT** (`DESPLEGAR_CAMPAÑA`,
  `INVERTIR_AHORA`, `LIBERAR_HITO`).

---

## Stack tecnológico

| Capa                 | Tech                                                      |
| -------------------- | ---------------------------------------------------------- |
| App                  | Next.js 16.3 (App Router), React 19, Tailwind 4, TypeScript |
| Web3 cliente         | wagmi 3 + viem 2 + Reown AppKit (`@reown/appkit`)           |
| Web3 servidor        | viem `createPublicClient` (`lib/escrow/server.ts`)          |
| Redes                | HashKey Testnet `133`, Mainnet `177` (`config/wagmi.ts`)    |
| Base de datos        | PostgreSQL 18 + Prisma 7 (`@prisma/adapter-pg`)             |
| Contratos            | Solidity 0.8.24, OpenZeppelin 5, Hardhat 2 (subproyecto)    |
| Tests app            | Jest + Testing Library — 155 tests + 4 e2e opt-in           |
| Tests contratos      | Mocha/chai in-memory (12 tests)                             |
| CI                   | lint + Jest; Hardhat + verificación de ABIs + e2e en nodo local |
| Package manager raíz | `pnpm@12.4.1`                                               |

Nombre npm de la app: `equity-chain`. Marca: **EQUITY_CHAIN** by TripleR.

---

## Arquitectura e integración técnica

El repo tiene **dos toolchains separados** que no se mezclan:

- **Raíz** — pnpm + Next.js + Jest + Prettier + ESLint. Es la app web.
- **`contracts/`** — npm + Hardhat + Mocha/chai. Está excluido de
  `tsconfig`, `eslint`, `prettier` y `jest` de la raíz.
- El único puente entre ambos es `contracts/scripts/export-abis.js`, que
  genera los ABIs consumidos por la app en `lib/abi/`. Si cambia un
  contrato Solidity hay que compilar, correr ese script y commitear
  `lib/abi/`; CI falla si no coinciden.

### Cómo se integran app y contratos

1. **Deploy del escrow por campaña.** El founder llama a
   `EquityEscrowFactory.createCampaign(...)` desde su propia wallet — no
   hay wallet de backend. La factory despliega un `EquityEscrow` nuevo
   (`msg.sender` de la tx = startup) y un `EquityToken` asociado. El
   admin/oracle de cada escrow es el `owner()` de la factory, un rol
   distinto del founder.
2. **Verificación server-side de cada transacción.** La API nunca recibe
   ni confía en `contractAddress`, montos o status desde el cliente:
   recibe un `txHash` (o un id) y `lib/escrow/server.ts` lee el receipt y
   el estado real de la chain antes de tocar Postgres.
   - `POST /api/campaigns/[id]/activate` verifica que el receipt sea
     válido, que el evento `CampaignCreated` venga de la factory
     configurada, que el `startup` coincida con el founder, y que
     goal/símbolo/bps/porcentajes/duración coincidan con lo guardado en
     Postgres. Solo entonces la campaña pasa de `DRAFT` a `ACTIVE`.
   - `POST /api/investments` verifica que el receipt apunte al escrow de
     la campaña y que exista el evento `Invested(investor)` antes de
     crear la fila y disparar un sync.
3. **Sincronización con la chain (`lib/escrow/sync.ts`).** Es la única
   fuente que puede escribir `Campaign.status`, `raisedAmount`,
   `escrowBalance`, `Milestone.isCompleted` e `Investment.refundedAt` (la
   otra excepción es `activate`, que fija el estado inicial). Se dispara
   después de cada transacción relevante y también al cargar una página
   si la chain difiere de lo guardado.
4. **Lecturas siempre al último bloque.** Las lecturas de estado usan
   `getBlockNumber({ cacheTime: 0 })` con viem — sin eso viem reutiliza el
   bloque cacheado unos segundos y un sync justo después de una tx puede
   persistir estado viejo.
5. **HSK nativo, no un token ERC20/USDC.** El escrow es `payable` y opera
   con `msg.value`; no tiene `receive()`/`fallback()`, así que un transfer
   sin `invest()` revierte.
6. **Alta en dos pasos** (`DRAFT` → `activate` con `txHash`) para no
   perder la campaña si la wallet rechaza la transacción o esta falla.

### Modelo de datos (Prisma)

Montos en `Decimal(36, 18)` — misma precisión que el wei on-chain.

| Modelo       | Campos clave                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------- |
| `Profile`    | `address` (PK, lowercase), `role` (`"investor"` \| `"startup"`, string plano)                     |
| `Campaign`   | `status` (`DRAFT`\|`ACTIVE`\|`FUNDED`\|`COMPLETED`\|`FAILED`), `goalAmount`, `raisedAmount`, `escrowBalance`, `equityOffered` (%, on-chain en bps), `tokenSymbol`, `contractAddress` (único), `tokenAddress`, `deployTxHash` (único) |
| `Milestone`  | `position` (orden de liberación, no `targetDate`), `releasePercentage` (enteros que suman 100), `isCompleted` |
| `Investment` | `amount` (del evento `Invested`, nunca del cliente), `txHash` (único), `refundedAt`                |

Mapeo de estados `Campaign.status` ↔ `EquityEscrow.Status`:

| Prisma      | Contrato        | Quién lo setea                |
| ----------- | --------------- | ------------------------------ |
| `DRAFT`     | — (sin escrow)  | default al crear                |
| `ACTIVE`    | `Funding` (0)   | `POST .../activate`             |
| `FUNDED`    | `Active` (1)    | sync (la inversión que llena)   |
| `COMPLETED` | `Completed` (2) | sync (último hito liberado)     |
| `FAILED`    | `Failed` (3)    | sync (expiración o cancelación) |

### Contratos (`contracts/`)

- **`EquityToken`** — ERC20, mint/burn solo por su escrow, 1 token = 1 wei
  invertido.
- **`EquityEscrow`** (una instancia por campaña) — `invest()`,
  `markFailedIfExpired()`, `releaseNextMilestone()` (startup o admin),
  `cancelCampaign(reason)` (solo admin), `claimRefund()`.
- **`EquityEscrowFactory`** — `createCampaign(...)` despliega escrow +
  token y emite `CampaignCreated`.

Más detalle en `contracts/README.md`.

### Auth

No hay auth de sesión: `POST /api/campaigns` y `/api/investments` confían
en el `walletAddress` del body solo para _identificar_ el perfil. Ninguna
ruta que cambia estado on-chain depende de eso — la transacción firmada es
la prueba de quién actuó.

---

## Estructura del repo

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

## Flujos de usuario

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

### Rutas API

| Método | Path                            | Qué hace                                          |
| ------ | -------------------------------- | -------------------------------------------------- |
| GET    | `/api/profile?address=`          | perfil o 404                                        |
| GET    | `/api/profile/[address]`         | igual (la usa `useCheckProfile`)                    |
| POST   | `/api/profile`                   | alta                                                 |
| PATCH  | `/api/profile`                   | upgrade investor→startup                             |
| GET    | `/api/campaigns`                 | ACTIVE; `?founder=` → todas las del founder          |
| POST   | `/api/campaigns`                 | alta DRAFT; exige perfil `role=startup`              |
| GET    | `/api/campaigns/[id]`            | detalle                                              |
| POST   | `/api/campaigns/[id]/activate`   | `{txHash}` → verifica deploy → ACTIVE                |
| POST   | `/api/campaigns/[id]/sync`       | reconcilia con la chain (sin auth, solo lee)         |
| GET    | `/api/investments?investor=`     | historial (+ `tokenAddress`, `refundedAt`)           |
| POST   | `/api/investments`                | `{walletAddress, campaignId, txHash}` verificado    |

Códigos de verificación: `409` tx aún no minada / ya registrada / campaña
sin escrow, `422` la tx no corresponde, `502` RPC caído, `503` factory sin
configurar.

---

## Instalación

Requisitos: Node.js compatible con Next 16, `pnpm@12.4.1`, Docker (o un
Postgres 18 propio), y para tocar contratos, `npm`.

```bash
git clone <este repo>
cd buildathon-2026
cp .env.example .env
```

Completar en `.env`:

| Variable                              | Para qué                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------- |
| `DATABASE_URL`                        | conexión a Postgres                                                      |
| `NEXT_PUBLIC_PROJECT_ID`              | project id de Reown AppKit (https://cloud.reown.com)                     |
| `NEXT_PUBLIC_APP_URL`                 | URL pública de la app (metadata de wallet-connect)                       |
| `NEXT_PUBLIC_ESCROW_CHAIN_ID`         | `133` (HashKey Testnet) o `177` (Mainnet)                                 |
| `NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS`  | address de `EquityEscrowFactory`, la imprime `npm run deploy:testnet`     |
| `ESCROW_RPC_URL`                      | opcional, RPC propio para el servidor (si no, usa el público de la red)  |

```bash
docker compose -f compose.dev.yml up -d   # Postgres 18 en :5432
# o: docker compose up -d                 # db + app (lee ./.env)

pnpm install          # postinstall = prisma generate (necesita DATABASE_URL)
pnpm prisma:migrate   # o pnpm prisma:deploy en un ambiente ya provisionado
```

`prisma generate` falla si `DATABASE_URL` no está exportada (no hace falta
que Postgres responda para generar el client).

---

## Cómo correr el proyecto

### App en desarrollo

```bash
pnpm dev              # http://localhost:3000
```

### Tests de la app

```bash
pnpm test             # Jest — 155 tests (los e2e se saltan sin env)
pnpm test:watch
pnpm lint
pnpm format:check
```

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

En WSL2, si `npm` resuelve a `CMD.EXE` (error HH1 / UNC), usar el
invocador `node ./node_modules/hardhat/internal/cli/cli.js` también para
`run`.

### e2e app ↔ contratos

```bash
cd contracts && node ./node_modules/hardhat/internal/cli/cli.js node   # terminal 1
ESCROW_E2E_RPC_URL=http://127.0.0.1:8545 pnpm exec jest lib/escrow/escrow.e2e
```

### Scripts raíz

| Script                                                    | Qué                          |
| ----------------------------------------------------------- | ------------------------------ |
| `pnpm dev` / `build` / `start`                             | Next                          |
| `pnpm test` / `test:watch`                                 | Jest (e2e se salta sin env)    |
| `pnpm lint` / `format` / `format:check`                    | ESLint + Prettier              |
| `pnpm prisma:generate` / `migrate` / `deploy` / `studio`   | Prisma                          |

CI PR (`ci.yml`): job `test` (lint + Jest con cobertura) y job `contracts`
(Hardhat compile+test, `git diff` de `lib/abi`, nodo local + e2e). CI en
`main`: Docker `target: runner` → GHCR con build-args
`NEXT_PUBLIC_PROJECT_ID`, `NEXT_PUBLIC_APP_URL`,
`NEXT_PUBLIC_ESCROW_CHAIN_ID`, `NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS` (GitHub
`vars`).

---

## Estado actual (2026-09-13)

App y contratos están **cableados de punta a punta**: el founder despliega
su `EquityEscrow` vía la factory, el inversor invierte on-chain, y la API
verifica cada transacción antes de tocar Postgres. Hitos, cancelación
admin, expiración y reembolsos tienen UI completa.

| Qué                                       | Resultado                                  |
| ------------------------------------------- | --------------------------------------------- |
| Hardhat in-memory                          | 12/12                                        |
| Jest (APIs, lib/escrow, forms, perfil)     | 155/155, umbrales de cobertura OK             |
| e2e app ↔ contratos (nodo Hardhat real)    | 4/4                                          |
| `tsc --noEmit` / ESLint                    | limpios                                      |
| `next build`                               | OK (13 rutas, incl. `activate` y `sync`)      |
| RPC HashKey Testnet                        | `eth_chainId` = `0x85` (133)                  |

El e2e (`lib/escrow/escrow.e2e.test.ts`) despliega la factory y recorre,
con las mismas funciones que usan las rutas: deploy verificado + rechazo
de términos alterados → `invest` verificado + rechazo de tx ajena → meta
alcanzada → hito liberado → cancel admin → refund pro-rata (2.4 HSK
quedan) → ronda vencida marcada fallida por un tercero.

`EquityEscrowFactory` ya está **desplegada en HashKey Testnet** y su
address está configurada en `NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS`. La
migración `20260913120000_wire_escrow_onchain` está aplicada. El demo
funciona end to end en testnet: alta de campaña, deploy del escrow,
inversión, liberación de hitos, cancelación y reembolso.

### Roadmap fuera de este alcance

- **Auth** (SIWE / body firmado) para perfil, alta de campaña y registro
  de inversión.
- **Indexer de eventos.** El sync corrige totales, status, hitos y
  reembolsos, pero si un `invest()` nunca llegó a `POST /api/investments`
  (y nadie reintentó), esa fila de `Investment` no existe: el total del
  feed es correcto, el historial del inversor no.
- **Soporte multi-red simultáneo** (hoy una sola factory por
  `NEXT_PUBLIC_ESCROW_CHAIN_ID`).
- El feed `/startups` solo lista `ACTIVE`; las `FUNDED`/`COMPLETED` solo
  se ven por link o perfil.
- El founder puede invertir en su propia campaña llamando al contrato
  directo (UI y API lo bloquean; el contrato no).
- Oracle real de hitos (hoy admin EOA), stablecoin en lugar de HSK
  nativo, KYC / acreditación / documento SAFE, restricciones de
  transferencia del token y mercado secundario.

---

## Convenciones

- Addresses se guardan y buscan en lowercase (`normalizeAddress`).
- HSK ↔ wei con `hskToWei` / `weiToHsk` (`lib/escrow/config.ts`); display
  con `formatHsk` / `formatTokens`. Nunca `$`/USD.
- `tokenSymbol` uppercase en Zod (client y server).
- Hitos: ≥1, enteros, suman exactamente 100 — Zod, form y constructor.
- Server Components leen Postgres vía `lib/campaigns.ts`, sin `fetch`
  interno. `/` y `/startups` son `force-dynamic`.
- Comentarios de código en inglés. Copy de UI en español, tono terminal.
- Paleta CRT / neon (`globals.css`).
- Umbrales de cobertura ≥ 85 en `jest.config.ts` (incluye `lib/escrow/`,
  `InvestForm`, `activate` y `sync`).
- No commitear `.env`, `PRIVATE_KEY`, ni secrets.
