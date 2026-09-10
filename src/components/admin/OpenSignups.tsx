"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { setDinnerStatus, type AdminState } from "@/app/admin/actions";
import type { StripeMode } from "@/lib/stripe";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="abtn sec" type="submit" disabled={pending}>
      {pending ? "Working" : label}
    </button>
  );
}

export function OpenSignups({
  dinnerId,
  status,
  mode,
}: {
  dinnerId: string;
  status: string;
  mode: StripeMode;
}) {
  const [armed, setArmed] = useState(false);
  const [state, action] = useActionState<AdminState, FormData>(setDinnerStatus, {
    error: null,
    ok: null,
  });

  // Closing is always one click. Stopping sales should never be hard.
  if (status === "open") {
    return (
      <form action={action}>
        <input type="hidden" name="id" value={dinnerId} />
        <input type="hidden" name="status" value="closed" />
        <Submit label="Close signups" />
        {state.error ? <p className="err">{state.error}</p> : null}
      </form>
    );
  }

  if (mode !== "live") {
    return (
      <div style={{ display: "grid", gap: 4, justifyItems: "start" }}>
        <button className="abtn sec" type="button" disabled>
          Open signups
        </button>
        <span className="help" style={{ maxWidth: 460 }}>
          {mode === "test"
            ? "Blocked: Stripe is in test mode, so bookings would charge nobody."
            : "Blocked: STRIPE_SECRET_KEY is missing or unrecognised."}
        </span>
      </div>
    );
  }

  if (!armed) {
    return (
      <button className="abtn sec" type="button" onClick={() => setArmed(true)}>
        Open signups
      </button>
    );
  }

  return (
    <form action={action} style={{ display: "grid", gap: 6, maxWidth: 320 }}>
      <input type="hidden" name="id" value={dinnerId} />
      <input type="hidden" name="status" value="open" />
      <label className="help" htmlFor="confirm-code">
        Type the access code to confirm. Seats become payable immediately.
      </label>
      <input
        id="confirm-code"
        name="confirm"
        autoComplete="off"
        required
        style={{ font: "inherit", padding: "7px 9px" }}
      />
      {state.error ? (
        <span className="err" style={{ margin: 0, fontSize: 12 }} role="status">
          {state.error}
        </span>
      ) : null}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Submit label="Open signups" />
        <button className="rm" type="button" onClick={() => setArmed(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
