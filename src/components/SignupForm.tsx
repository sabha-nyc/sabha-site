"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { startCheckout, type FormState } from "@/app/actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? "Taking you to checkout" : label}
    </button>
  );
}

export function SignupForm({ slug, priceLabel }: { slug: string; priceLabel: string }) {
  const [state, action] = useActionState<FormState, FormData>(startCheckout, { error: null });

  return (
    <form action={action}>
      <input type="hidden" name="slug" value={slug} />

      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" type="text" autoComplete="name" required />
      </div>

      <div className="field">
        <label htmlFor="phone">Phone</label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(917) 555-0148"
          required
        />
        <span className="hint">So the host can reach you on the night.</span>
      </div>

      <div className="field">
        <label htmlFor="dietary_restrictions">Dietary restrictions</label>
        <textarea
          id="dietary_restrictions"
          name="dietary_restrictions"
          rows={3}
          placeholder="Or leave blank"
        />
      </div>

      <p className="err" role="status" aria-live="polite">
        {state.error}
      </p>

      <Submit label={`Pay ${priceLabel}`} />
    </form>
  );
}
