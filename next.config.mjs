/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proxy API calls to the backend so the browser never has to think about CORS
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
