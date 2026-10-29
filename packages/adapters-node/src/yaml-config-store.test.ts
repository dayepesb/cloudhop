import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { YamlConfigStore } from './yaml-config-store';

describe('YamlConfigStore', () => {
  it('round-trips the config as readable YAML keyed by name', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cloudhop-config-'));
    const store = new YamlConfigStore(dir);
    expect(await store.load()).toEqual({ providers: [], sources: [], aliases: [] });

    const config = {
      providers: ['aws' as const],
      sources: [
        { id: 'acme', provider: 'aws' as const, kind: 'sso', settings: { region: 'us-east-1' } },
      ],
      aliases: [{ name: 'acme-prod', source: 'acme', target: '111/Admin', region: 'us-east-2' }],
    };
    await store.save(config);

    expect(await store.load()).toEqual(config);
    const yaml = await readFile(join(dir, 'config.yaml'), 'utf8');
    expect(yaml).toContain('acme-prod:\n    source: acme');
  });

  it('keeps discovered targets per source', async () => {
    const store = new YamlConfigStore(await mkdtemp(join(tmpdir(), 'cloudhop-config-')));
    await store.saveTargets('a', [{ id: '1', label: 'one', attributes: {} }]);
    await store.saveTargets('b', []);
    expect(await store.loadTargets('a')).toHaveLength(1);
    await store.removeTargets('a');
    expect(await store.loadTargets('a')).toEqual([]);
  });
});
