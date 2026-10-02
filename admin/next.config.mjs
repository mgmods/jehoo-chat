const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@jehoo/shared"],
  outputFileTracingRoot: path.join(process.cwd(), ".."),
};
module.exports = nextConfig;
