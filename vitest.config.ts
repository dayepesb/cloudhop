import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Mirrors the tsup plugin: the web UI's assets are imported as strings.
  plugins: [
    {
      name: 'ui-assets-as-text',
      enforce: 'pre',
      load(id) {
        if (!/[\\/](ui|assistants)[\\/]src[\\/]assets[\\/]/.test(id)) return;
        return `export default ${JSON.stringify(readFileSync(id.split('?')[0] as string, 'utf8'))};`;
      },
    },
  ],
  test: {
    include: ['packages/*/src/**/*.test.ts'],
  },
});
