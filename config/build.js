import { build } from 'esbuild';
import { dtsPlugin } from 'esbuild-plugin-d.ts';

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
    '@aha-app/react-easy-state',
    '@nx-js/observer-util',
    'debug',
    'lodash',
  ],
  target: 'es2018', // TODO: remove this when aha-app supports esnext.
  platform: 'browser',
  plugins: [dtsPlugin()],
});
