import { build } from "esbuild";

build({
  entryPoints: ["src/index.js"],
  bundle: true,
  format: "esm",
  outfile: "dist/index.esm.js",
  write: true,
  external: ["react", "react-dom"],
});

build({
  entryPoints: ["src/index.js"],
  bundle: true,
  format: "cjs",
  outfile: "dist/index.cjs.js",
  write: true,
  external: ["react", "react-dom"],
});
