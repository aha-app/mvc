import { build } from "esbuild";

build({
  entryPoints: ["src/index.js"],
  bundle: true,
  format: "esm",
  outfile: "dist/index.js",
  write: true,
  external: ["react", "react-dom"],
});
