"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="scr">
      <div className="grow" />
      <p className="status" style={{ color: "var(--accent-warn)" }}>
        Something broke
      </p>
      <p className="note">Not your fault. Try again, and text the host if it keeps happening.</p>
      <button className="ghost" onClick={reset}>
        Try again
      </button>
      <div className="grow" />
    </main>
  );
}
