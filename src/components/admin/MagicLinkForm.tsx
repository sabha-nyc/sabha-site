"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { sendMagicLink, type AdminState } from "@/app/admin/actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="abtn" type="submit" disabled={pending}>
      {pending ? "Sending" : "Send the link"}
    </button>
  );
}

export function MagicLinkForm() {
  const [state, action] = useActionState<AdminState, FormData>(sendMagicLink, {
    error: null,
    ok: null,
  });

  return (
    <form className="form" action={action}>
      <div className="fieldset">
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="actions" style={{ margin: 0 }}>
          <Submit />
        </div>
      </div>
      <p className="err" role="status" aria-live="polite">
        {state.error}
      </p>
      {state.ok ? <p className="help">{state.ok}</p> : null}
    </form>
  );
}
