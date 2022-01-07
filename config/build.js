import { build } from "esbuild";

build({
  entryPoints: ["src/index.js"],
  bundle: true,
  format: "esm",
  outfile: "dist/index.esm.js",
  write: true,
  external: ["react", "react-dom"],
  target: "es2018", // TODO: remove this when aha-app supports esnext.
});

build({
  entryPoints: ["src/index.js"],
  bundle: true,
  format: "cjs",
  outfile: "dist/index.cjs.js",
  write: true,
  external: ["react", "react-dom"],
  target: "es2018", // TODO: remove this when aha-app supports esnext.
});
