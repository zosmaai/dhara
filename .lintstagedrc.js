export default {
  "*.{ts,js,json,md}": ["biome check --write --no-errors-on-unmatched"],
  "*.ts": () => "tsc --noEmit --project tsconfig.json",
};
