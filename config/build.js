import { build } from 'esbuild';
import { dtsPlugin } from 'esbuild-plugin-d.ts';

// TODO: It might be easier to replace this with `tsdx`, which makes it easy to build both ESM and
// CJS output with correct .d.ts files without worrying about externals. Using "exports" in
// package.json helps tools find the right files they need.

build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  sourcemap: true,
  format: 'esm',
  outfile: 'dist/index.js',
  write: true,
  external: [
    'react',
    'react-dom',
    '@nx-js/observer-util',
    'debug',
  ],
  target: 'es2018', // TODO: remove this when aha-app supports esnext.
  platform: 'browser',
  plugins: [dtsPlugin()],
});
