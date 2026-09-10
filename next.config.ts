import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  // There is a stray lockfile in the home directory; without this, tracing
  // picks that as the workspace root and ships the wrong file set.
  outputFileTracingRoot: path.join(__dirname),
  async headers() {
    return [
      {
        // The address and the guest list must never sit in a shared cache.
        source: "/:path*",
        headers: [{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }],
      },
    ];
  },
};

export default config;
