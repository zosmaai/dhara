// source.config.ts
import { remarkHeading } from "fumadocs-core/mdx-plugins";
import { defineConfig, defineDocs } from "fumadocs-mdx/config";
var docs = defineDocs({
  dir: "../docs"
});
var source_config_default = defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkHeading]
  }
});
export {
  source_config_default as default,
  docs
};
