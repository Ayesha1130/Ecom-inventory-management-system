import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security-headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const remotePatterns = supabaseUrl
  ? [{
      protocol: new URL(supabaseUrl).protocol.replace(":", "") as "http" | "https",
      hostname: new URL(supabaseUrl).hostname,
      pathname: "/storage/v1/object/public/**",
    }]
  : [];

const config: NextConfig = {
  reactStrictMode: true,
  images: { remotePatterns },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders({ supabaseUrl, dev: process.env.NODE_ENV !== "production" }) }];
  },
  experimental: { serverActions: { bodySizeLimit: "6mb" } }, // image uploads (5 MB cap enforced in the action)
};
export default config;
