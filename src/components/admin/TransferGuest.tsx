"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { transferGuest, type AdminState } from "@/app/admin/actions";
import { displayPhone } from "@/lib/format";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="rm" type="submit" disabled={pending}>
      {pending ? "Transferring" : "Save"}
    </button>
  );
}

/**
 * Edit the name and phone on a seat in place. The seat, the payment and the
 * details link all stay put — only who is sitting in it changes.
 */
export function TransferGuest({
  signupId,
  dinnerId,
  name,
  phone,
}: {
  signupId: string;
  dinnerId: string;
  name: string;
  phone: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<AdminState, FormData>(
    async (prev, form) => {
      const result = await transferGuest(prev, form);
      if (!result.error) setOpen(false);
      return result;
    },
    { error: null, ok: null }
  );

  if (!open) {
    return (
      <button
        className="rm"
        type="button"
        onClick={() => setOpen(true)}
        style={{ color: "var(--ink-muted)" }}
      >
        Transfer
      </button>
    );
  }

  return (
    <form action={action} style={{ display: "grid", gap: 6, minWidth: 220 }}>
      <input type="hidden" name="signup_id" value={signupId} />
      <input type="hidden" name="dinner_id" value={dinnerId} />
      <input
        name="name"
        defaultValue={name}
        aria-label="New guest name"
        required
        style={{ font: "inherit", padding: "5px 7px" }}
      />
      <input
        name="phone"
        type="tel"
        defaultValue={displayPhone(phone)}
        aria-label="New guest phone"
        required
        style={{ font: "inherit", padding: "5px 7px" }}
      />
      {state.error ? (
        <span className="err" style={{ margin: 0, fontSize: 11.5 }} role="status">
          {state.error}
        </span>
      ) : null}
      <div style={{ display: "flex", gap: 10 }}>
        <Submit />
        <button
          className="rm"
          type="button"
          onClick={() => setOpen(false)}
          style={{ color: "var(--ink-muted)" }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
