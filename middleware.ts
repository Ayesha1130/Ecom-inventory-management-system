import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = { matcher: ["/o/:path*", "/invite/:path*", "/onboarding", "/login", "/signup"] };
