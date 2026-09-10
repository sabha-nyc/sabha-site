import Link from "next/link";
import { Logo } from "@/components/Logo";
import { requireAdmin } from "@/lib/auth";
import { signOut } from "@/app/admin/actions";
import { OverbookedBanner } from "@/components/admin/OverbookedBanner";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sabha — Admin" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const email = await requireAdmin();

  return (
    <div className="adm">
      <div className="topbar">
        <Logo width={46} />
        <Link className="crumb" href="/admin">
          Dinners
        </Link>
        <span className="spacer" />
        <span className="crumb" style={{ textTransform: "none", letterSpacing: 0 }}>
          {email}
        </span>
        <form action={signOut}>
          <button className="rm" type="submit">
            Sign out
          </button>
        </form>
      </div>
      <OverbookedBanner />
      {children}
    </div>
  );
}
