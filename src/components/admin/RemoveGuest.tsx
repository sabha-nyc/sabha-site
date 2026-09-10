"use client";

import { useState } from "react";
import { removeGuest } from "@/app/admin/actions";

/** Remove, with "refund through Stripe?" in the same action. */
export function RemoveGuest({
  signupId,
  dinnerId,
  name,
  refundable,
}: {
  signupId: string;
  dinnerId: string;
  name: string;
  refundable: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className="rm" type="button" onClick={() => setOpen(true)}>
        Remove
      </button>
    );
  }

  return (
    <form action={removeGuest} style={{ display: "grid", gap: 6, minWidth: 190 }}>
      <input type="hidden" name="signup_id" value={signupId} />
      <input type="hidden" name="dinner_id" value={dinnerId} />
      {refundable ? (
        <label style={{ fontSize: 12.5, display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" name="refund" defaultChecked style={{ width: "auto" }} />
          Refund through Stripe
        </label>
      ) : null}
      <div style={{ display: "flex", gap: 10 }}>
        <button className="rm" type="submit">
          Remove {name.split(" ")[0]}
        </button>
        <button className="rm" type="button" onClick={() => setOpen(false)} style={{ color: "var(--ink-muted)" }}>
          Cancel
        </button>
      </div>
    </form>
  );
}
