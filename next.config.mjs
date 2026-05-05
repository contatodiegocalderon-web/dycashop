/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    /** Evita empacotar googleapis/sharp no webpack do App Router (chunks quebrados / module not found no dev). */
    serverComponentsExternalPackages: [
      "googleapis",
      "google-auth-library",
      "heic-convert",
      "heic-decode",
      "libheif-js",
      "sharp",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "drive.google.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
    ],
    unoptimized: false,
  },
};

export default nextConfig;
