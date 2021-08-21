import { build } from "esbuild";

build({
  entryPoints: ["src/index.js"],
  bundle: true,
  format: "esm",
  outfile: "dist/mvc.js",
  write: true,
});
