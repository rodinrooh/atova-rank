"use client";

import { useEffect, useMemo, useState } from "react";

type Return = {
  timeLeft: number | null;   // ms remaining; null when unknown
  formatted: string;         // "HH:MM:SS" or ""
  expired: boolean;          // true when <= 0
};

/**
 * Watch an ISO expiry time and compute ms remaining.
 * ALWAYS returns a stable object shape (never undefined).
 */
export function useMatchExpiryWatcher(expiryISO?: string | null): Return {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!expiryISO) {
      setTimeLeft(null);
      return;
    }

    const expiry = new Date(expiryISO).getTime();
    const tick = () => {
      const ms = expiry - Date.now();
      setTimeLeft(ms > 0 ? ms : 0);
    };

    tick(); // seed immediately
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiryISO]);

  const formatted = useMemo(() => {
    if (timeLeft == null) return "00:00:00";
    const total = Math.max(0, timeLeft);
    const s = Math.floor(total / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  }, [timeLeft]);

  const expired = timeLeft !== null && timeLeft <= 0;

  return { timeLeft, formatted, expired };
}
