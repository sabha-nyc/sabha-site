"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { addGuest, type AdminState } from "@/app/admin/actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="abtn" type="submit" disabled={pending}>
      {pending ? "Adding" : "Add"}
    </button>
  );
}

/** Creates a comped row with its own details token. No charge. */
export function AddGuestForm({ dinnerId }: { dinnerId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState<AdminState, FormData>(
    async (prev, form) => {
      const result = await addGuest(prev, form);
      if (!result.error) formRef.current?.reset();
      return result;
    },
    { error: null, ok: null }
  );

  return (
    <details style={{ marginTop: 22 }}>
      <summary className="crumb" style={{ cursor: "pointer" }}>
        Add a guest
      </summary>
      <form className="form" action={action} ref={formRef}>
        <div className="fieldset">
          <div className="row2">
            <div>
              <label htmlFor="g-name">Name</label>
              <input id="g-name" name="name" required />
            </div>
            <div>
              <label htmlFor="g-phone">Phone</label>
              <input id="g-phone" name="phone" type="tel" required />
            </div>
          </div>
          <div>
            <label htmlFor="g-diet">Dietary restrictions</label>
            <input id="g-diet" name="dietary_restrictions" />
          </div>
        </div>
        <input type="hidden" name="dinner_id" value={dinnerId} />
        <p className="err" role="status" aria-live="polite">
          {state.error}
        </p>
        {state.ok ? <p className="help">{state.ok}</p> : null}
        <div className="actions">
          <Submit />
          <span className="help">Comped &mdash; no charge, and they get their own details link.</span>
        </div>
      </form>
    </details>
  );
}
