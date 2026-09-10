import { Logo } from "@/components/Logo";
import { CodeForm } from "@/components/CodeForm";

/** A wrong URL and a wrong code get the same answer. */
export default function NotFound() {
  return (
    <main className="scr">
      <div className="grow" />
      <Logo />
      <CodeForm />
      <p className="fine">Sabha is invite-only. Your code arrived with your invitation.</p>
      <div className="grow" />
    </main>
  );
}
