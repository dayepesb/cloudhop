import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  entry: { cli: 'src/cli.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node20',
  clean: true,
  // One self-contained file: internal packages and dependencies are bundled.
  noExternal: [/.*/],
  // Bundled CommonJS dependencies (e.g. yaml) call require() for Node built-ins.
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire as __cloudhopRequire } from 'node:module';\nconst require = __cloudhopRequire(import.meta.url);",
  },
  define: { __CLOUDHOP_VERSION__: JSON.stringify(version) },
});
