import { NextResponse } from "next/server";
import { authClient } from "@/lib/auth";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Where the magic link lands. Exchanges the code for a session, then in. */
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code");
  if (!code) return NextResponse.redirect(`${env.siteUrl}/admin/login`);

  const supabase = await authClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("[admin] code exchange failed", error);
    return NextResponse.redirect(`${env.siteUrl}/admin/login`);
  }

  return NextResponse.redirect(`${env.siteUrl}/admin`);
}
