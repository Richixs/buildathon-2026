import { z } from "zod";

const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const TOKEN_SYMBOL_REGEX = /^[A-Z]{3,5}$/;
const TOTAL_RELEASE_PERCENTAGE = 100;

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
      .positive("La meta de recaudación debe ser mayor a 0."),
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
    contractAddress: z
      .string()
      .trim()
      .regex(
        EVM_ADDRESS_REGEX,
        "contractAddress no es una dirección EVM válida.",
      )
      .optional(),
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

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type MilestoneInput = z.infer<typeof milestoneInputSchema>;
