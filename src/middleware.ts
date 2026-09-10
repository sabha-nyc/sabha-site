import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/**
 * Keeps the admin session fresh and turns anonymous /admin traffic away before
 * it reaches a page. The real gate is requireAdmin() in the admin layout —
 * this is the cheap first pass.
 */
export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return res;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(list: { name: string; value: string; options: CookieOptions }[]) {
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const allowlist = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const email = user?.email?.toLowerCase();
  if (!email || !allowlist.includes(email)) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  return res;
}

export const config = {
  // Everything under /admin except the login page and its callback.
  matcher: ["/admin/((?!login|auth).*)", "/admin"],
};
