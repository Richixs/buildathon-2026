"use client";

import { useState, type FormEvent } from "react";

export type ProfileRole = "investor" | "startup";

export interface RegistrationFormValues {
  role: ProfileRole;
  alias: string;
  bio: string;
  legalName?: string;
}

export interface RegistrationFormProps {
  onSubmit: (values: RegistrationFormValues) => void | Promise<void>;
}

interface FormErrors {
  alias?: string;
  legalName?: string;
}

const LABEL_CLASSES = "text-off-white/70 font-mono text-xs tracking-widest";

const INPUT_CLASSES =
  "border-muted-teal bg-crt-black text-off-white w-full border-2 px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-neon-cyan focus:shadow-[4px_4px_0px_0px_#66FCF1]";

const FIELD_ERROR_CLASSES = "text-red-400 font-mono text-xs";

function roleOptionClasses(active: boolean) {
  return `flex flex-1 cursor-pointer items-center justify-center gap-2 border-2 px-4 py-3 font-mono text-sm font-bold transition-colors ${
    active
      ? "border-neon-cyan text-neon-cyan bg-neon-cyan/10"
      : "border-off-white/30 text-off-white/70 hover:border-neon-cyan/60"
  }`;
}

export default function RegistrationForm({ onSubmit }: RegistrationFormProps) {
  const [role, setRole] = useState<ProfileRole>("investor");
  const [alias, setAlias] = useState("");
  const [legalName, setLegalName] = useState("");
  const [bio, setBio] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isLegalNameRequired = role === "startup";

  function validate(): FormErrors {
    const nextErrors: FormErrors = {};

    if (!alias.trim()) {
      nextErrors.alias = "El alias es obligatorio.";
    }

    if (isLegalNameRequired && !legalName.trim()) {
      nextErrors.legalName = "El nombre legal es obligatorio para startups.";
    }

    return nextErrors;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        role,
        alias: alias.trim(),
        bio: bio.trim(),
        legalName: isLegalNameRequired ? legalName.trim() : undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="border-neon-cyan bg-terminal-gray mx-auto flex w-full max-w-2xl flex-col gap-6 border-2 p-8">
      <h1 className="text-neon-cyan font-mono text-2xl font-bold tracking-widest">
        CREAR_PERFIL
      </h1>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-3">
          <legend className={LABEL_CLASSES}>TIPO DE PERFIL</legend>

          <div className="flex gap-4">
            <label
              htmlFor="role-investor"
              className={roleOptionClasses(role === "investor")}
            >
              <input
                type="radio"
                id="role-investor"
                name="role"
                value="investor"
                checked={role === "investor"}
                onChange={() => setRole("investor")}
                className="sr-only"
              />
              Soy Inversor
            </label>

            <label
              htmlFor="role-startup"
              className={roleOptionClasses(role === "startup")}
            >
              <input
                type="radio"
                id="role-startup"
                name="role"
                value="startup"
                checked={role === "startup"}
                onChange={() => setRole("startup")}
                className="sr-only"
              />
              Soy Startup
            </label>
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="alias" className={LABEL_CLASSES}>
            Alias
          </label>
          <input
            id="alias"
            name="alias"
            type="text"
            required
            value={alias}
            onChange={(event) => setAlias(event.target.value)}
            className={INPUT_CLASSES}
          />
          {errors.alias && (
            <p role="alert" className={FIELD_ERROR_CLASSES}>
              {errors.alias}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="legalName" className={LABEL_CLASSES}>
            Nombre Legal
          </label>
          <input
            id="legalName"
            name="legalName"
            type="text"
            required={isLegalNameRequired}
            aria-required={isLegalNameRequired}
            value={legalName}
            onChange={(event) => setLegalName(event.target.value)}
            className={INPUT_CLASSES}
          />
          {errors.legalName && (
            <p role="alert" className={FIELD_ERROR_CLASSES}>
              {errors.legalName}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="bio" className={LABEL_CLASSES}>
            Biografía
          </label>
          <textarea
            id="bio"
            name="bio"
            rows={4}
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            className={`${INPUT_CLASSES} resize-none`}
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-neon-cyan text-crt-black border-crt-black border-2 px-6 py-3 font-mono font-bold shadow-[4px_4px_0px_0px_#45A29E] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Guardando..." : "Crear Perfil"}
        </button>
      </form>
    </div>
  );
}
