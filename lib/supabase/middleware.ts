import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/env";

function redirectTo(request: NextRequest, from: NextResponse, path: string, search?: Record<string, string>) {
  const url = request.nextUrl.clone();
  url.pathname = path;
  url.search = search ? new URLSearchParams(search).toString() : "";
  const res = NextResponse.redirect(url);
  from.cookies.getAll().forEach((c) => res.cookies.set(c)); // keep refreshed session cookies
  return res;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  const protectedPath = path.startsWith("/o/") || path.startsWith("/invite/") || path === "/onboarding";

  const env = getSupabaseEnv();
  if (!env) return protectedPath ? redirectTo(request, response, "/demo") : response;

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser() revalidates the token with Supabase Auth; never trust getSession() on the server.
  const { data: { user } } = await supabase.auth.getUser();
  const signedIn = !!user && !user.is_anonymous;

  if (protectedPath && !user) return redirectTo(request, response, "/login", { next: path + request.nextUrl.search });
  if (path === "/onboarding" && user?.is_anonymous) return redirectTo(request, response, "/signup");
  if ((path === "/login" || path === "/signup") && signedIn) return redirectTo(request, response, "/onboarding");
  return response;
}
