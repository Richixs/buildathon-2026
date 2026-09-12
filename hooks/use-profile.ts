"use client";

import { useCallback, useEffect, useState } from "react";

export type Profile = {
  address: string;
  username: string;
  bio: string;
  link: string | null;
  role: "investor" | "startup";
  legalName: string | null;
};

async function fetchProfile(address: string): Promise<Profile | null> {
  const res = await fetch(`/api/profile/${address}`);

  if (res.status === 404) return null;
  if (!res.ok) throw new Error("No se pudo cargar el perfil.");

  return res.json();
}

export function useCheckProfile(address: `0x${string}` | undefined) {
  const [data, setData] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(address));
  const [trackedAddress, setTrackedAddress] = useState(address);

  // Reset synchronously during render when the address changes (e.g. wallet
  // disconnected or switched) instead of in an effect — avoids an extra
  // cascading render. See: https://react.dev/learn/you-might-not-need-an-effect
  if (address !== trackedAddress) {
    setTrackedAddress(address);
    setData(null);
    setIsLoading(Boolean(address));
  }

  useEffect(() => {
    if (!address) return;

    let cancelled = false;

    fetchProfile(address)
      .then((profile) => {
        if (!cancelled) setData(profile);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address]);

  const createProfile = useCallback(
    async (profile: {
      username: string;
      bio: string;
      link?: string;
      role?: "investor" | "startup";
      legalName?: string;
    }) => {
      if (!address) return;

      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, ...profile }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "No se pudo crear el perfil.");
      }

      setData(await res.json());
    },
    [address],
  );

  return { data, isLoading, createProfile };
}
