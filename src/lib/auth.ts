import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { env } from "./env";

/** Auth-only Supabase client. Data still goes through the service-role client. */
export async function authClient() {
  const jar = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return jar.getAll();
      },
      setAll(list: { name: string; value: string; options: CookieOptions }[]) {
        try {
          list.forEach(({ name, value, options }) => jar.set(name, value, options));
        } catch {
          // Called from a Server Component; middleware refreshes the session.
        }
      },
    },
  });
}

export async function currentAdminEmail(): Promise<string | null> {
  const supabase = await authClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email?.toLowerCase() ?? null;
  if (!email) return null;

  // A hardcoded allowlist of two or three emails. Being able to receive a
  // magic link is not the same as being allowed in.
  return env.adminEmails.includes(email) ? email : null;
}

export async function requireAdmin(): Promise<string> {
  const email = await currentAdminEmail();
  if (!email) redirect("/admin/login");
  return email;
}
