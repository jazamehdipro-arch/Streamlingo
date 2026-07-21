import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@streamlingo/shared"],
  async redirects() {
    return [
      // The podcast mode was retired from the nav; send any stale link or
      // home-screen shortcut pointing at it to the main YouTube watch page.
      { source: "/learn", destination: "/watch", permanent: false },
    ];
  },
};

export default nextConfig;
