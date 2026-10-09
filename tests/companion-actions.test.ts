import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  companionActions,
  companionReadActions,
  companionStateActions,
  companionWriteActions,
  getCompanionReadAction,
  getCompanionWriteAction,
  normalizeCompanionReadInput,
  normalizeCompanionWriteInput,
} from '../src/catalog/companion-actions.js';

describe('Joomla-native companion action catalogue', () => {
  it('contains only fixed, unique, native capability descriptors', () => {
    expect(companionReadActions).toHaveLength(25);
    expect(companionStateActions).toHaveLength(28);
    expect(companionWriteActions).toHaveLength(62);
    expect(companionActions).toHaveLength(87);
    expect(new Set(companionActions.map((action) => action.id)).size).toBe(companionActions.length);

    for (const action of companionActions) {
      expect(action.inputSchema.additionalProperties).toBe(false);
      expect(['joomla-runtime', 'administrator-model', 'console-command']).toContain(action.native.kind);
      expect(action.native.method).not.toHaveLength(0);
    }
  });

  it('maps operational reads to least-privilege toolsets', () => {
    expect(getCompanionReadAction('cache.groups.list')?.toolset).toBe('maintenance.read');
    expect(getCompanionReadAction('extensions.updates.list')?.toolset).toBe('extensions.read');
    expect(getCompanionReadAction('scheduler.tasks.list')?.toolset).toBe('maintenance.read');
    expect(getCompanionReadAction('core.update.status')?.toolset).toBe('maintenance.read');
    expect(getCompanionReadAction('extensions.update-sites.list')?.toolset).toBe('extensions.read');
    expect(getCompanionReadAction('site.state.get')?.toolset).toBe('maintenance.read');
    expect(getCompanionWriteAction('cache.clean')?.toolset).toBe('maintenance.admin');
    expect(getCompanionWriteAction('scheduler.tasks.run')).toMatchObject({ toolset: 'maintenance.admin', risk: 'high' });
    expect(getCompanionWriteAction('extensions.state.set')).toMatchObject({ toolset: 'extensions.admin', risk: 'high' });
    expect(getCompanionWriteAction('users.users.state')).toBeUndefined();
    expect(getCompanionReadAction('djclassifieds.regions.list')?.toolset).toBe('djclassifieds.read');
    expect(getCompanionReadAction('djclassifieds.profiles.get')?.toolset).toBe('djclassifieds.read');
    expect(getCompanionReadAction('djclassifieds.inspect')?.toolset).toBe('djclassifieds.read');
    expect(getCompanionWriteAction('djclassifieds.items.state')).toMatchObject({ toolset: 'djclassifieds.write', risk: 'write' });
    expect(getCompanionWriteAction('djclassifieds.profiles.state')).toBeUndefined();
    expect(getCompanionWriteAction('djclassifieds.categories.create')).toMatchObject({ toolset: 'djclassifieds.write', risk: 'write' });
    expect(getCompanionWriteAction('djclassifieds.items.update')).toMatchObject({ toolset: 'djclassifieds.write', risk: 'write' });
    expect(getCompanionWriteAction('djclassifieds.regions.delete')).toMatchObject({ toolset: 'djclassifieds.write', risk: 'high' });
    expect(getCompanionWriteAction('djclassifieds.profiles.create')).toMatchObject({ toolset: 'djclassifieds.write' });
    expect(getCompanionWriteAction('djclassifieds.plans.delete')).toBeDefined();
    expect(getCompanionWriteAction('djclassifieds.types.update')).toBeDefined();
  });

  it('normalizes bounded read inputs and rejects escape fields', () => {
    expect(normalizeCompanionReadInput('system.info', {})).toEqual({});
    expect(normalizeCompanionReadInput('cache.groups.list', {})).toEqual({ offset: 0, limit: 20 });
    expect(normalizeCompanionReadInput('scheduler.tasks.list', { offset: 20, limit: 5, search: 'daily' }))
      .toEqual({ offset: 20, limit: 5, search: 'daily' });
    expect(normalizeCompanionReadInput('content.articles.get', { id: 7 })).toEqual({ id: 7 });
    expect(normalizeCompanionReadInput('djclassifieds.items.list', { offset: 10, limit: 5, search: 'demo', state: 1 }))
      .toEqual({ offset: 10, limit: 5, search: 'demo', state: 1 });
    expect(normalizeCompanionReadInput('djclassifieds.items.list', {}))
      .toEqual({ offset: 0, limit: 20 });
    expect(normalizeCompanionReadInput('djclassifieds.profiles.get', { id: 42 })).toEqual({ id: 42 });
    expect(normalizeCompanionReadInput('djclassifieds.inspect', {})).toEqual({});
    expect(normalizeCompanionReadInput('djclassifieds.inspect', { sampleRows: true })).toEqual({ sampleRows: true });
    expect(normalizeCompanionReadInput('djclassifieds.inspect', { maxTables: 53, maxColumns: 120, maxSampleRows: 5 }))
      .toEqual({ maxTables: 53, maxColumns: 120, maxSampleRows: 5 });
    expect(() => normalizeCompanionReadInput('djclassifieds.inspect', { sampleRows: 'yes' })).toThrow('must be a boolean');
    expect(() => normalizeCompanionReadInput('djclassifieds.inspect', { maxTables: 0 })).toThrow('between 1 and 1000');
    expect(() => normalizeCompanionReadInput('djclassifieds.inspect', { maxSampleRows: 51 })).toThrow('between 1 and 50');
    expect(() => normalizeCompanionReadInput('djclassifieds.inspect', { extra: 1 })).toThrow('Unsupported');

    expect(() => normalizeCompanionReadInput('cache.groups.list', { component: 'com_users' })).toThrow('Unsupported');
    expect(() => normalizeCompanionReadInput('cache.groups.list', { limit: 101 })).toThrow('between 1 and 100');
    expect(() => normalizeCompanionReadInput('content.articles.get', { id: '../configuration.php' })).toThrow('integer');
    expect(() => normalizeCompanionReadInput('djclassifieds.items.list', { limit: 101 })).toThrow('between 1 and 100');
    expect(() => normalizeCompanionWriteInput('djclassifieds.categories.state', { id: 1, state: 3 })).toThrow('between -2 and 2');
    expect(() => normalizeCompanionReadInput('shell.run', {})).toThrow('Unknown');
  });

  it('bounds search strings by UTF-8 bytes before dispatching to PHP', () => {
    const asciiAtLimit = 'a'.repeat(200);
    const asciiOverLimit = 'a'.repeat(201);
    const utf8OverLimit = 'é'.repeat(101);
    expect(utf8OverLimit.length).toBe(101);
    expect(Buffer.byteLength(utf8OverLimit, 'utf8')).toBe(202);

    for (const actionId of ['content.articles.list', 'extensions.list', 'djclassifieds.items.list']) {
      expect(normalizeCompanionReadInput(actionId, { search: asciiAtLimit }))
        .toMatchObject({ search: asciiAtLimit });
      expect(normalizeCompanionReadInput(actionId, { search: 'é'.repeat(100) }))
        .toMatchObject({ search: 'é'.repeat(100) });
      expect(() => normalizeCompanionReadInput(actionId, { search: asciiOverLimit }))
        .toThrow('at most 200 UTF-8 bytes');
      expect(() => normalizeCompanionReadInput(actionId, { search: utf8OverLimit }))
        .toThrow('at most 200 UTF-8 bytes');
    }
  });

  it('matches DJ-Classifieds list state values to the native enum', async () => {
    const php = await readFile(new URL('../companion/plugin/src/Action/CoreEntityAction.php', import.meta.url), 'utf8');
    const nativeStatesMatch = php.match(/private const STATES = \[([^\]]+)\];/u);
    expect(nativeStatesMatch).not.toBeNull();
    const nativeStates = [...nativeStatesMatch![1]!.matchAll(/-?\d+/gu)].map((match) => Number(match[0]));
    const stateSchema = getCompanionReadAction('djclassifieds.items.list')!.inputSchema.properties['state'];

    expect(stateSchema).toMatchObject({ type: 'integer', enum: nativeStates });
    for (const state of nativeStates) {
      expect(normalizeCompanionReadInput('djclassifieds.items.list', { state })).toMatchObject({ state });
    }
    expect(() => normalizeCompanionReadInput('djclassifieds.items.list', { state: -1 }))
      .toThrow('state must be one of -2, 0, 1, or 2');
  });

  it('matches the native extension type schema without widening other read actions', async () => {
    const types = ['', 'component', 'module', 'plugin', 'template', 'library', 'file', 'package', 'language'];
    const schema = getCompanionReadAction('extensions.list')!.inputSchema;
    expect(schema.additionalProperties).toBe(false);
    expect(Object.keys(schema.properties).sort()).toEqual(['limit', 'offset', 'search', 'type']);
    expect(schema.properties['type']).toEqual({ type: 'string', enum: types });

    const php = await readFile(new URL('../companion/plugin/src/Action/ListExtensionsAction.php', import.meta.url), 'utf8');
    const nativeEnum = php.match(/'type' => \['type' => 'string', 'enum' => \[([^\]]+)\]\]/u);
    expect(nativeEnum).not.toBeNull();
    expect([...nativeEnum![1]!.matchAll(/'([^']*)'/gu)].map((match) => match[1])).toEqual(types);

    for (const type of types) {
      expect(normalizeCompanionReadInput('extensions.list', { type, offset: 100, limit: 100, search: 'optional' }))
        .toEqual({ type, offset: 100, limit: 100, search: 'optional' });
    }
    expect(normalizeCompanionReadInput('extensions.list', {})).toEqual({ offset: 0, limit: 20 });
    expect(() => normalizeCompanionReadInput('cache.groups.list', { type: 'plugin' })).toThrow('Unsupported');
    expect(() => normalizeCompanionReadInput('content.articles.list', { type: 'plugin' })).toThrow('Unsupported');
  });

  it.each(['plugins', 'PLUGIN', ' plugin ', '../plugin', null, 1, true, [], {}])(
    'rejects invalid extension type %j', (type) => {
      expect(() => normalizeCompanionReadInput('extensions.list', { type })).toThrow();
    },
  );

  it('keeps extension filter inputs bounded and fail-closed', () => {
    for (const input of [
      { type: 'plugin', folder: 'content' },
      { type: 'plugin', component: 'com_installer' },
      { type: 'plugin', offset: -1 },
      { type: 'plugin', offset: 1_000_001 },
      { type: 'plugin', limit: 0 },
      { type: 'plugin', limit: 101 },
      { type: 'plugin', search: 'x'.repeat(201) },
    ]) {
      expect(() => normalizeCompanionReadInput('extensions.list', input)).toThrow();
    }
  });

  it('normalizes only fixed cache and state mutations', () => {
    expect(normalizeCompanionWriteInput('cache.clean', { groups: ['com_content', 'mod_menu'] }))
      .toEqual({ groups: ['com_content', 'mod_menu'] });
    expect(normalizeCompanionWriteInput('content.articles.state', { id: 4, state: 0 }))
      .toEqual({ id: 4, state: 0 });
    expect(normalizeCompanionWriteInput('cache.expired.purge', {})).toEqual({});
    expect(normalizeCompanionWriteInput('extensions.state.set', { id: 12, enabled: false }))
      .toEqual({ id: 12, enabled: false });
    expect(normalizeCompanionWriteInput('scheduler.tasks.state.set', { id: 7, state: -2 }))
      .toEqual({ id: 7, state: -2 });
    expect(normalizeCompanionWriteInput('scheduler.tasks.run', { id: 7 })).toEqual({ id: 7 });
    expect(normalizeCompanionWriteInput('djclassifieds.items.state', { id: 3, state: 1 })).toEqual({ id: 3, state: 1 });
    expect(normalizeCompanionWriteInput('site.state.set', { offline: true })).toEqual({ offline: true });
    expect(normalizeCompanionWriteInput('sessions.data.gc', {})).toEqual({ application: 'site' });
    expect(normalizeCompanionWriteInput('djclassifieds.categories.create', { data: { name: 'فروشگاهی', parent_id: 1, published: 1 } }))
      .toEqual({ data: { name: 'فروشگاهی', parent_id: 1, published: 1 } });
    expect(normalizeCompanionWriteInput('djclassifieds.categories.create', { data: { alias: 'shops' } }))
      .toEqual({ data: { alias: 'shops' } });
    expect(normalizeCompanionWriteInput('djclassifieds.items.update', { id: 3, data: { price: 1_200_000, region_id: 21 } }))
      .toEqual({ id: 3, data: { price: 1_200_000, region_id: 21 } });
    expect(normalizeCompanionWriteInput('djclassifieds.regions.delete', { id: 22 })).toEqual({ id: 22 });

    expect(() => normalizeCompanionWriteInput('cache.clean', { groups: ['../system'] })).toThrow('safe name');
    expect(() => normalizeCompanionWriteInput('cache.clean', { groups: ['same', 'same'] })).toThrow('unique');
    expect(() => normalizeCompanionWriteInput('content.articles.state', { id: 4, state: 3 })).toThrow('between -2 and 2');
    expect(() => normalizeCompanionWriteInput('content.articles.state', { id: 4, state: 1, model: 'Users' }))
      .toThrow('Unsupported');
    expect(() => normalizeCompanionWriteInput('extensions.state.set', { id: 2, enabled: 1 })).toThrow('boolean');
    expect(() => normalizeCompanionWriteInput('scheduler.tasks.run', { id: 2, all: true })).toThrow('Unsupported');
    expect(() => normalizeCompanionWriteInput('sessions.data.gc', { application: 'api' })).toThrow('site or administrator');
    expect(() => normalizeCompanionWriteInput('database.import', {})).toThrow('Unknown');
    expect(() => normalizeCompanionWriteInput('djclassifieds.categories.create', { data: { bogus: 1 } })).toThrow('Unsupported');
    expect(() => normalizeCompanionWriteInput('djclassifieds.items.create', { data: {} })).toThrow('at least one');
    expect(() => normalizeCompanionWriteInput('djclassifieds.items.create', {})).toThrow('must be an object');
    expect(() => normalizeCompanionWriteInput('djclassifieds.items.update', { data: { name: 'test' } })).toThrow('integer');
    expect(() => normalizeCompanionWriteInput('djclassifieds.items.update', { id: 1, data: { user_id: 301 } })).toThrow('Unsupported');
    expect(() => normalizeCompanionWriteInput('djclassifieds.items.delete', { id: 1, data: { name: 'x' } })).toThrow('Unsupported');
    expect(() => normalizeCompanionWriteInput('djclassifieds.items.create', { data: { name: 'x' }, extra: 1 })).toThrow('Unsupported');
    expect(() => normalizeCompanionWriteInput('djclassifieds.items.create', { data: { name: 'x\0y' } })).toThrow('invalid string');
    expect(() => normalizeCompanionWriteInput('djclassifieds.types.delete', { id: 0 })).toThrow('between 1');
  });
});
