"use client";

import { useState } from "react";

/** The button that actually gets used, the night before. */
export function CopyButton({
  text,
  label,
  disabled,
}: {
  text: string;
  label: string;
  disabled?: boolean;
}) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard blocked (http, or an old browser). Fall back to a prompt so
      // the host can still get at the text.
      window.prompt("Copy this", text);
      return;
    }
    setDone(true);
    setTimeout(() => setDone(false), 1600);
  }

  return (
    <button className="abtn sec" type="button" onClick={copy} disabled={disabled}>
      {done ? "Copied" : label}
    </button>
  );
}
