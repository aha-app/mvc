import { build } from "esbuild";

build({
  entryPoints: ["src/index.js"],
  bundle: true,
  sourcemap: true,
  format: "esm",
  outfile: "dist/index.js",
  write: true,
  external: ["react", "react-dom"],
  target: "es2018", // TODO: remove this when aha-app supports esnext.
});
