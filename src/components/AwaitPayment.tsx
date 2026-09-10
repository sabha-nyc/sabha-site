"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Poll quietly while the webhook lands. No spinner, no drama. */
export function AwaitPayment({ everyMs = 2500 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(id);
  }, [router, everyMs]);
  return null;
}
