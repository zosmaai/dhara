import { defineConfig } from "fumadocs-mdx/config";

export default defineConfig({
  mdxOptions: {
    // Use existing docs directory
    cwd: "../",
  },
  // Where to find MDX files
  contentDir: "../docs",
  // Output source types
  outDir: "./.fumadocs",
});
