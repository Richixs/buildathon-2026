"use client";

import { useEffect, useState } from "react";

/**
 * Wall-clock time that re-renders every `intervalMs`, for deadline checks
 * (e.g. EquityEscrow.fundingDeadline) without calling Date.now() during
 * render.
 */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
