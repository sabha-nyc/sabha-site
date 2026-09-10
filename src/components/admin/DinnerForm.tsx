"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createDinner, updateDinner, type AdminState } from "@/app/admin/actions";
import type { Dinner } from "@/lib/types";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="abtn" type="submit" disabled={pending}>
      {pending ? "Saving" : label}
    </button>
  );
}

/** datetime-local wants "2026-10-12T19:30" in New York time. */
function toLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function DinnerForm({ dinner }: { dinner?: Dinner }) {
  const editing = Boolean(dinner);
  const [state, action] = useActionState<AdminState, FormData>(
    editing ? updateDinner : createDinner,
    { error: null, ok: null }
  );

  return (
    <form className="form" action={action}>
      {dinner ? <input type="hidden" name="id" value={dinner.id} /> : null}

      <div className="fieldset">
        <div>
          <label htmlFor="title">Title</label>
          <input id="title" name="title" defaultValue={dinner?.title ?? ""} required />
        </div>

        <div className="row2">
          <div>
            <label htmlFor="starts_at">Date &amp; time</label>
            <input
              id="starts_at"
              name="starts_at"
              type="datetime-local"
              defaultValue={toLocalInput(dinner?.starts_at)}
              required
            />
            <p className="help">New York time.</p>
          </div>
          <div>
            <label htmlFor="slug">Slug</label>
            <input
              id="slug"
              name="slug"
              defaultValue={dinner?.slug ?? ""}
              placeholder="october-12"
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="neighborhood">Neighbourhood</label>
          <input
            id="neighborhood"
            name="neighborhood"
            defaultValue={dinner?.neighborhood ?? ""}
            placeholder="Gramercy"
          />
          <p className="help">Shown before payment.</p>
        </div>

        <div>
          <label htmlFor="full_address">Full address</label>
          <textarea
            id="full_address"
            name="full_address"
            rows={2}
            defaultValue={dinner?.full_address ?? ""}
            placeholder={"211 East 21st Street\nApartment 4R"}
          />
          <p className="help">Shown only after payment. Line breaks are kept.</p>
        </div>

        <div className="row2">
          <div>
            <label htmlFor="price">Price</label>
            <input
              id="price"
              name="price"
              type="number"
              min="0"
              step="1"
              defaultValue={dinner ? dinner.price_cents / 100 : ""}
              required
            />
            <p className="help">Dollars. Changing this never touches people who already paid.</p>
          </div>
          <div>
            <label htmlFor="seats_total">Seats</label>
            <input
              id="seats_total"
              name="seats_total"
              type="number"
              min="1"
              step="1"
              defaultValue={dinner?.seats_total ?? 12}
              required
            />
          </div>
        </div>

        <div className="row2">
          <div>
            <label htmlFor="access_code">Access code</label>
            <input
              id="access_code"
              name="access_code"
              defaultValue={dinner?.access_code ?? ""}
              placeholder="SABHA-OCT12"
              required
            />
            <p className="help">Case-insensitive. Trailing spaces are forgiven.</p>
          </div>
          <div>
            <label>Status</label>
            {/* Read-only on purpose. Opening signups is the one action that
                lets strangers pay, so it lives behind the Stripe check on the
                guest list rather than in a dropdown among ordinary fields. */}
            <p className="statusline">{dinner?.status ?? "draft"}</p>
            <p className="help">
              {dinner
                ? "Open and close signups from the guest list."
                : "New dinners start as a draft."}
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="host_phone">Host phone</label>
          <input
            id="host_phone"
            name="host_phone"
            type="tel"
            defaultValue={dinner?.host_phone ?? ""}
            placeholder="+19175550100"
          />
          <p className="help">Behind the &ldquo;text the host&rdquo; button. Leave blank to hide it.</p>
        </div>

        <div>
          <label htmlFor="details_note">Details note</label>
          <textarea
            id="details_note"
            name="details_note"
            rows={2}
            defaultValue={dinner?.details_note ?? ""}
            placeholder="Fourth floor, no lift. Buzzer 4R."
          />
          <p className="help">Shown on the confirmation, with the address.</p>
        </div>
      </div>

      <p className="err" role="status" aria-live="polite">
        {state.error}
      </p>
      {state.ok ? <p className="help">{state.ok}</p> : null}

      <div className="actions">
        <Submit label={editing ? "Save" : "Create dinner"} />
      </div>
    </form>
  );
}
