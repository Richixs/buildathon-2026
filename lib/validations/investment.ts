import { z } from "zod";

const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;

// No `amount`: the server reads the escrowed wei from the tx's Invested
// event (lib/escrow/server.ts verifyInvestmentTx) instead of trusting the
// client.
export const createInvestmentSchema = z.object({
  walletAddress: z
    .string()
    .trim()
    .regex(EVM_ADDRESS_REGEX, "walletAddress no es una dirección EVM válida."),
  campaignId: z.string().trim().min(1, "campaignId es obligatorio."),
  txHash: z
    .string()
    .trim()
    .regex(TX_HASH_REGEX, "txHash no es un hash de transacción válido."),
});

export type CreateInvestmentInput = z.infer<typeof createInvestmentSchema>;
