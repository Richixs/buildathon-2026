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
    <form onSubmit={handleSubmit} noValidate>
      <fieldset>
        <legend>Tipo de perfil</legend>

        <label htmlFor="role-investor">
          <input
            type="radio"
            id="role-investor"
            name="role"
            value="investor"
            checked={role === "investor"}
            onChange={() => setRole("investor")}
          />
          Soy Inversor
        </label>

        <label htmlFor="role-startup">
          <input
            type="radio"
            id="role-startup"
            name="role"
            value="startup"
            checked={role === "startup"}
            onChange={() => setRole("startup")}
          />
          Soy Startup
        </label>
      </fieldset>

      <div>
        <label htmlFor="alias">Alias</label>
        <input
          id="alias"
          name="alias"
          type="text"
          required
          value={alias}
          onChange={(event) => setAlias(event.target.value)}
        />
        {errors.alias && <p role="alert">{errors.alias}</p>}
      </div>

      <div>
        <label htmlFor="legalName">Nombre Legal</label>
        <input
          id="legalName"
          name="legalName"
          type="text"
          required={isLegalNameRequired}
          aria-required={isLegalNameRequired}
          value={legalName}
          onChange={(event) => setLegalName(event.target.value)}
        />
        {errors.legalName && <p role="alert">{errors.legalName}</p>}
      </div>

      <div>
        <label htmlFor="bio">Biografía</label>
        <textarea
          id="bio"
          name="bio"
          value={bio}
          onChange={(event) => setBio(event.target.value)}
        />
      </div>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Guardando..." : "Crear Perfil"}
      </button>
    </form>
  );
}
