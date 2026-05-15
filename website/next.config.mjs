import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
};

export default withMDX(config);
