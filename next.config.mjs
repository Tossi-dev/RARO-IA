/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // fontes entram por <link> em runtime; sem fetch de fontes no build
  optimizeFonts: false,
};

export default nextConfig;
