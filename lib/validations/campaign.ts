import { z } from "zod";
import { isYoutubeUrl } from "@/lib/youtube";

const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const TOKEN_SYMBOL_REGEX = /^[A-Z]{3,5}$/;
const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;
const TOTAL_RELEASE_PERCENTAGE = 100;
export const MIN_FUNDING_DAYS = 1;
export const MAX_FUNDING_DAYS = 365;
// Keeps String(goalAmount) out of exponent notation (≥1e21), which
// parseEther can't read — see lib/escrow/config.ts hskToWei.
export const MAX_GOAL_HSK = 1_000_000_000_000;

export const milestoneInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "El título del hito es obligatorio.")
    .max(120, "El título del hito es demasiado largo."),
  targetDate: z.coerce.date({
    error: "targetDate debe ser una fecha válida.",
  }),
  releasePercentage: z
    .number()
    .int("El porcentaje a liberar debe ser un número entero.")
    .min(1, "El porcentaje a liberar debe ser mayor a 0.")
    .max(100, "El porcentaje a liberar no puede superar 100."),
});

export const createCampaignSchema = z
  .object({
    walletAddress: z
      .string()
      .trim()
      .regex(
        EVM_ADDRESS_REGEX,
        "walletAddress no es una dirección EVM válida.",
      ),
    title: z
      .string()
      .trim()
      .min(3, "El título debe tener al menos 3 caracteres.")
      .max(120, "El título es demasiado largo."),
    description: z
      .string()
      .trim()
      .min(10, "La descripción debe tener al menos 10 caracteres.")
      .max(5000, "La descripción es demasiado larga."),
    goalAmount: z
      .number()
      .finite()
      .positive("La meta de recaudación debe ser mayor a 0.")
      .max(MAX_GOAL_HSK, "La meta de recaudación es demasiado grande."),
    // % of the company offered for this raise (SAFE terms).
    equityOffered: z
      .number()
      .min(0.1, "El equity ofrecido debe ser al menos 0.1%.")
      .max(100, "El equity ofrecido no puede superar 100%."),
    // Security token ticker — normalized to uppercase before the format check
    // so "nxus" and "NXUS" are both accepted from the client.
    tokenSymbol: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .pipe(
        z
          .string()
          .regex(
            TOKEN_SYMBOL_REGEX,
            "El símbolo debe tener entre 3 y 5 letras (A-Z).",
          ),
      ),
    // Passed to EquityEscrowFactory.createCampaign as fundingDurationSeconds.
    fundingDurationDays: z
      .number()
      .int("La duración debe ser un número entero de días.")
      .min(
        MIN_FUNDING_DAYS,
        `La ronda debe durar al menos ${MIN_FUNDING_DAYS} día.`,
      )
      .max(
        MAX_FUNDING_DAYS,
        `La ronda no puede durar más de ${MAX_FUNDING_DAYS} días.`,
      ),
    // Founder's pitch/demo video, embedded on the campaign detail page.
    // Empty string (an untouched optional form field) means "not provided".
    pitchVideoUrl: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value ? value : undefined))
      .refine((value) => value === undefined || isYoutubeUrl(value), {
        message: "Debe ser un link válido de YouTube.",
      }),
    milestones: z
      .array(milestoneInputSchema)
      .min(1, "Debes definir al menos un hito."),
  })
  // CRÍTICO: el escrow libera capital hito por hito según
  // releasePercentage — si no suman exactamente 100, el contrato dejaría
  // capital sin liberar (o intentaría liberar de más).
  .refine(
    (data) =>
      data.milestones.reduce(
        (sum, milestone) => sum + milestone.releasePercentage,
        0,
      ) === TOTAL_RELEASE_PERCENTAGE,
    {
      message: "La suma de los hitos debe ser 100%.",
      path: ["milestones"],
    },
  );

// Body of POST /api/campaigns/[id]/activate: the factory createCampaign tx.
// Everything else (escrow address, token, deadline) is read from chain.
export const activateCampaignSchema = z.object({
  txHash: z
    .string()
    .trim()
    .regex(TX_HASH_REGEX, "txHash no es un hash de transacción válido."),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type MilestoneInput = z.infer<typeof milestoneInputSchema>;
