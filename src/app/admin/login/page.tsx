import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { MagicLinkForm } from "@/components/admin/MagicLinkForm";
import { currentAdminEmail } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sabha — Admin" };

export default async function AdminLogin() {
  if (await currentAdminEmail()) redirect("/admin");

  return (
    <div className="adm">
      <div className="topbar">
        <Logo width={46} />
        <span className="crumb">Admin</span>
      </div>
      <div className="body">
        <h1>Sign in</h1>
        <p className="subline">A link arrives by email. No password to lose.</p>
        <MagicLinkForm />
      </div>
    </div>
  );
}
