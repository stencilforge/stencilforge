import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 100% client-side app: export as static files.
  output: "export",
  // Set by the Pages workflow when serving from https://<user>.github.io/<repo>/.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH,
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
