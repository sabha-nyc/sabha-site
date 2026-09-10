import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
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
