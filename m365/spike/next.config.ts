import type { NextConfig } from "next";

const config: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Only SharePoint may be framed by the app (document previews).
          { key: "Content-Security-Policy", value: "frame-src 'self' https://*.sharepoint.com https://*.officeapps.live.com; frame-ancestors 'self'" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default config;
