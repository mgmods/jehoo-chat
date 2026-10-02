import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@jehoo/shared"],
  outputFileTracingRoot: path.join(process.cwd(), ".."),
};
export default nextConfig;
