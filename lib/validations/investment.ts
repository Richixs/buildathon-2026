import { z } from "zod";

const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
// Native HSK transfer tx hash (recorded by InvestForm after
// useSendTransaction confirms) — no on-chain verification yet, see
// EQUITY_CHAIN_HANDOFF.md gap #1.
const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;

export const createInvestmentSchema = z.object({
  walletAddress: z
    .string()
    .trim()
    .regex(EVM_ADDRESS_REGEX, "walletAddress no es una dirección EVM válida."),
  campaignId: z.string().trim().min(1, "campaignId es obligatorio."),
  amount: z
    .number()
    .finite()
    .positive("El monto invertido debe ser mayor a 0."),
  txHash: z
    .string()
    .trim()
    .regex(TX_HASH_REGEX, "txHash no es un hash de transacción válido."),
});

export type CreateInvestmentInput = z.infer<typeof createInvestmentSchema>;
