"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { enterCode, type FormState } from "@/app/actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? "Checking" : "Continue"}
    </button>
  );
}

export function CodeForm({ initialError }: { initialError?: string }) {
  const [state, action] = useActionState<FormState, FormData>(enterCode, {
    error: initialError ?? null,
  });

  return (
    <form action={action}>
      <div className="field mono">
        <label htmlFor="code">Invitation code</label>
        <input
          id="code"
          name="code"
          type="text"
          placeholder="SABHA-OCT12"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          required
        />
      </div>
      <p className="err" role="status" aria-live="polite">
        {state.error}
      </p>
      <Submit />
    </form>
  );
}
