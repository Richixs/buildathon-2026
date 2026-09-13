"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useForm,
  useFieldArray,
  useWatch,
  type SubmitHandler,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAccount } from "wagmi";
import ConnectButton from "@/components/web3/ConnectButton";
import { isYoutubeUrl } from "@/lib/youtube";
import { readableTxError } from "@/lib/escrow/config";
import { MAX_FUNDING_DAYS, MIN_FUNDING_DAYS } from "@/lib/validations/campaign";
import type { CampaignDTO } from "@/lib/campaigns";
import {
  DEPLOY_STEP_LABELS,
  useDeployEscrow,
  type DeployStep,
} from "@/hooks/use-deploy-escrow";

// Gives the user time to read the success message before we navigate them
// to the campaign page.
const REDIRECT_DELAY_MS = 1500;
const TOTAL_RELEASE_PERCENTAGE = 100;
const TOKEN_SYMBOL_REGEX = /^[A-Z]{3,5}$/;
const DEFAULT_FUNDING_DAYS = 30;

// Local, frontend-facing schema. `targetDate` stays a validated string here
// (bound to <input type="date">) instead of reusing the backend's
// `z.coerce.date()` from lib/validations/campaign.ts — RHF's zodResolver
// would otherwise need separate input/output generics for no real benefit,
// since the value is sent to the API as JSON either way and the server's
// schema already coerces it to a Date. The business rules that matter
// (min lengths, positive amount, ≥1 milestone, hitos suman 100%) are the
// same on both sides.
const milestoneFormSchema = z.object({
  title: z.string().trim().min(1, "El título del hito es obligatorio."),
  targetDate: z.string().min(1, "La fecha objetivo es obligatoria."),
  releasePercentage: z
    .number({ error: "Ingresa un número válido." })
    .int("Debe ser un número entero.")
    .min(1, "Debe ser mayor a 0.")
    .max(100, "No puede superar 100."),
});

const campaignFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "El título debe tener al menos 3 caracteres."),
    description: z
      .string()
      .trim()
      .min(10, "La descripción debe tener al menos 10 caracteres."),
    goalAmount: z
      .number({ error: "Ingresa un número válido." })
      .positive("La meta de recaudación debe ser mayor a 0."),
    equityOffered: z
      .number({ error: "Ingresa un número válido." })
      .min(0.1, "Debe ser al menos 0.1%.")
      .max(100, "No puede superar 100%."),
    tokenSymbol: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .pipe(
        z.string().regex(TOKEN_SYMBOL_REGEX, "3 a 5 letras (A-Z), ej. AAPL."),
      ),
    fundingDurationDays: z
      .number({ error: "Ingresa un número válido." })
      .int("Debe ser un número entero de días.")
      .min(MIN_FUNDING_DAYS, `Mínimo ${MIN_FUNDING_DAYS} día.`)
      .max(MAX_FUNDING_DAYS, `Máximo ${MAX_FUNDING_DAYS} días.`),
    // Optional pitch/demo video — kept as a plain string here (empty means
    // "not provided") instead of transforming to `string | undefined` like
    // the backend schema, so the field's input/output types stay identical
    // and `useForm<CampaignFormValues>()` doesn't need separate generics.
    // The empty→undefined conversion happens once, in onSubmit below.
    pitchVideoUrl: z
      .string()
      .trim()
      .refine((value) => value === "" || isYoutubeUrl(value), {
        message: "Debe ser un link válido de YouTube.",
      }),
    milestones: z.array(milestoneFormSchema).min(1, "Agrega al menos un hito."),
  })
  .refine(
    (data) =>
      data.milestones.reduce((sum, m) => sum + m.releasePercentage, 0) ===
      TOTAL_RELEASE_PERCENTAGE,
    {
      message: "La suma de los hitos debe ser 100%.",
      path: ["milestones"],
    },
  );

type CampaignFormValues = z.infer<typeof campaignFormSchema>;

const INPUT_CLASSES =
  "border-muted-teal bg-crt-black text-off-white w-full border-2 px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-neon-cyan focus:shadow-[4px_4px_0px_0px_#66FCF1]";

const FIELD_ERROR_CLASSES = "text-red-400 font-mono text-xs";

// "draft": saved in Postgres but the escrow deploy didn't finish — the
// founder can retry from the campaign page (DeployEscrowButton).
type SubmitState = "idle" | "success" | "draft" | "error";

export default function CreateCampaignForm() {
  const router = useRouter();
  const { address } = useAccount();
  const deployEscrow = useDeployEscrow();
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deployStep, setDeployStep] = useState<DeployStep | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues: {
      title: "",
      description: "",
      goalAmount: 0,
      equityOffered: 0,
      tokenSymbol: "",
      fundingDurationDays: DEFAULT_FUNDING_DAYS,
      pitchVideoUrl: "",
      milestones: [{ title: "", targetDate: "", releasePercentage: 100 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "milestones",
  });

  // `useWatch` (a proper hook subscription) instead of `watch()` (an
  // escape-hatch method off `useForm()`'s return value) — the React
  // Compiler can't safely memoize a component around the latter, since it
  // can't see that the function identity is stable across renders.
  const watchedMilestones = useWatch({ control, name: "milestones" });
  const totalPercentage = watchedMilestones.reduce(
    (sum, milestone) => sum + (Number(milestone.releasePercentage) || 0),
    0,
  );
  const isTotalValid = totalPercentage === TOTAL_RELEASE_PERCENTAGE;

  const onSubmit: SubmitHandler<CampaignFormValues> = async (values) => {
    if (!address) return;

    setSubmitState("idle");
    setSubmitError(null);
    setDraftId(null);

    let campaign: CampaignDTO;
    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          pitchVideoUrl: values.pitchVideoUrl || undefined,
          walletAddress: address,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "No se pudo crear la campaña.");
      }

      campaign = await response.json();
    } catch (error) {
      setSubmitState("error");
      setSubmitError(
        error instanceof Error ? error.message : "Error desconocido.",
      );
      return;
    }

    // The DRAFT exists from here on — a failed deploy must not lose it.
    reset();
    setDraftId(campaign.id);

    try {
      await deployEscrow(campaign, setDeployStep);
      setSubmitState("success");
      setTimeout(() => {
        router.push(`/campaigns/${campaign.id}`);
      }, REDIRECT_DELAY_MS);
    } catch (error) {
      setSubmitState("draft");
      setSubmitError(readableTxError(error));
    } finally {
      setDeployStep(null);
    }
  };

  if (!address) {
    return (
      <div className="border-neon-cyan bg-terminal-gray mx-auto flex w-full max-w-2xl flex-col items-center gap-4 border-2 p-8 text-center">
        <p className="text-off-white/70 font-mono text-sm">
          &gt; CONECTA TU WALLET PARA DESPLEGAR UNA CAMPAÑA_
        </p>
        <ConnectButton />
      </div>
    );
  }

  return (
    <div className="border-neon-cyan bg-terminal-gray mx-auto flex w-full max-w-2xl flex-col gap-6 border-2 p-8">
      <h1 className="text-neon-cyan font-mono text-2xl font-bold tracking-widest">
        DESPLEGAR_CAMPAÑA
      </h1>
      <p className="text-off-white/50 font-mono text-xs leading-5">
        Se guarda la campaña y luego firmas con tu wallet el despliegue de su
        escrow en HashKey Chain (tú pagas el gas). Los hitos se liberan en el
        orden en que los cargues.
      </p>

      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="flex flex-col gap-6"
      >
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="title"
            className="text-off-white/70 font-mono text-xs tracking-widest"
          >
            TÍTULO
          </label>
          <input
            id="title"
            type="text"
            className={INPUT_CLASSES}
            {...register("title")}
          />
          {errors.title && (
            <p className={FIELD_ERROR_CLASSES}>{errors.title.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="description"
            className="text-off-white/70 font-mono text-xs tracking-widest"
          >
            DESCRIPCIÓN
          </label>
          <textarea
            id="description"
            rows={4}
            className={`${INPUT_CLASSES} resize-none`}
            {...register("description")}
          />
          {errors.description && (
            <p className={FIELD_ERROR_CLASSES}>{errors.description.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="pitchVideoUrl"
            className="text-off-white/70 font-mono text-xs tracking-widest"
          >
            VIDEO DEL PITCH (YOUTUBE) — OPCIONAL
          </label>
          <input
            id="pitchVideoUrl"
            type="text"
            placeholder="https://youtube.com/watch?v=..."
            className={INPUT_CLASSES}
            {...register("pitchVideoUrl")}
          />
          {errors.pitchVideoUrl && (
            <p className={FIELD_ERROR_CLASSES}>
              {errors.pitchVideoUrl.message}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="goalAmount"
              className="text-off-white/70 font-mono text-xs tracking-widest"
            >
              META DE RECAUDACIÓN (HSK)
            </label>
            <input
              id="goalAmount"
              type="number"
              step="any"
              className={INPUT_CLASSES}
              {...register("goalAmount", { valueAsNumber: true })}
            />
            {errors.goalAmount && (
              <p className={FIELD_ERROR_CLASSES}>{errors.goalAmount.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="equityOffered"
              className="text-off-white/70 font-mono text-xs tracking-widest"
            >
              % DE EQUITY OFRECIDO
            </label>
            <input
              id="equityOffered"
              type="number"
              step="any"
              className={INPUT_CLASSES}
              {...register("equityOffered", { valueAsNumber: true })}
            />
            {errors.equityOffered && (
              <p className={FIELD_ERROR_CLASSES}>
                {errors.equityOffered.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="tokenSymbol"
              className="text-off-white/70 font-mono text-xs tracking-widest"
            >
              SÍMBOLO DEL TOKEN (EJ. AAPL)
            </label>
            <input
              id="tokenSymbol"
              type="text"
              className={`${INPUT_CLASSES} uppercase`}
              {...register("tokenSymbol")}
            />
            {errors.tokenSymbol && (
              <p className={FIELD_ERROR_CLASSES}>
                {errors.tokenSymbol.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="fundingDurationDays"
              className="text-off-white/70 font-mono text-xs tracking-widest"
            >
              DURACIÓN DE LA RONDA (DÍAS)
            </label>
            <input
              id="fundingDurationDays"
              type="number"
              step="1"
              className={INPUT_CLASSES}
              {...register("fundingDurationDays", { valueAsNumber: true })}
            />
            {errors.fundingDurationDays && (
              <p className={FIELD_ERROR_CLASSES}>
                {errors.fundingDurationDays.message}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <span className="text-off-white/70 font-mono text-xs tracking-widest">
            HITOS (EN ORDEN DE LIBERACIÓN)
          </span>

          {fields.map((field, index) => (
            <div
              key={field.id}
              className="border-muted-teal/50 bg-crt-black/40 flex flex-col gap-3 border border-dashed p-4"
            >
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`milestones.${index}.title`}
                  className="text-off-white/50 font-mono text-[11px] tracking-widest"
                >
                  TÍTULO DEL HITO {index + 1}
                </label>
                <input
                  id={`milestones.${index}.title`}
                  type="text"
                  className={INPUT_CLASSES}
                  {...register(`milestones.${index}.title` as const)}
                />
                {errors.milestones?.[index]?.title && (
                  <p className={FIELD_ERROR_CLASSES}>
                    {errors.milestones[index]?.title?.message}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`milestones.${index}.targetDate`}
                    className="text-off-white/50 font-mono text-[11px] tracking-widest"
                  >
                    FECHA OBJETIVO
                  </label>
                  <input
                    id={`milestones.${index}.targetDate`}
                    type="date"
                    className={INPUT_CLASSES}
                    {...register(`milestones.${index}.targetDate` as const)}
                  />
                  {errors.milestones?.[index]?.targetDate && (
                    <p className={FIELD_ERROR_CLASSES}>
                      {errors.milestones[index]?.targetDate?.message}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`milestones.${index}.releasePercentage`}
                    className="text-off-white/50 font-mono text-[11px] tracking-widest"
                  >
                    % DE FONDOS A LIBERAR
                  </label>
                  <input
                    id={`milestones.${index}.releasePercentage`}
                    type="number"
                    step="1"
                    className={INPUT_CLASSES}
                    {...register(
                      `milestones.${index}.releasePercentage` as const,
                      {
                        valueAsNumber: true,
                      },
                    )}
                  />
                  {errors.milestones?.[index]?.releasePercentage && (
                    <p className={FIELD_ERROR_CLASSES}>
                      {errors.milestones[index]?.releasePercentage?.message}
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => remove(index)}
                disabled={fields.length === 1}
                className="self-start font-mono text-xs text-red-400 transition-colors hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                X ELIMINAR_HITO
              </button>
            </div>
          ))}

          {errors.milestones?.message && (
            <p className={FIELD_ERROR_CLASSES}>{errors.milestones.message}</p>
          )}

          <p
            className={`font-mono text-sm ${isTotalValid ? "text-neon-cyan" : "text-red-400"}`}
          >
            Total asignado: {totalPercentage}% / 100%
          </p>

          <button
            type="button"
            onClick={() =>
              append({ title: "", targetDate: "", releasePercentage: 0 })
            }
            className="border-off-white/30 hover:border-neon-cyan hover:text-neon-cyan self-start border-2 px-4 py-2 font-mono text-sm font-bold transition-colors"
          >
            + AGREGAR_HITO
          </button>
        </div>

        {submitState === "success" && (
          <p className="text-retro-green font-mono text-sm">
            ¡Escrow desplegado y campaña activa! Redirigiendo...
          </p>
        )}
        {submitState === "draft" && draftId && (
          <div className="border-warning-orange/40 flex flex-col gap-2 border p-3">
            <p className="text-warning-orange font-mono text-xs">
              La campaña quedó guardada como borrador, pero el escrow no se
              desplegó: {submitError}
            </p>
            <Link
              href={`/campaigns/${draftId}`}
              className="text-neon-cyan font-mono text-xs underline"
            >
              REINTENTAR_DESPLIEGUE →
            </Link>
          </div>
        )}
        {submitState === "error" && submitError && (
          <p className={FIELD_ERROR_CLASSES}>{submitError}</p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-neon-cyan text-crt-black border-crt-black border-2 px-6 py-3 font-mono font-bold shadow-[4px_4px_0px_0px_#45A29E] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          {deployStep
            ? DEPLOY_STEP_LABELS[deployStep]
            : isSubmitting
              ? "[ INICIALIZANDO_DATOS... ]"
              : "[ DESPLEGAR_CAMPAÑA ]"}
        </button>
      </form>
    </div>
  );
}
