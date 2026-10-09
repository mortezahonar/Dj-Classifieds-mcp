import type { JsonSchema } from '../../contracts/action-catalog.js';
import type { Toolset } from '../../config/schema.js';
import type {
  CompanionActionDescriptor,
  JoomlaNativeCapability,
} from '../companion-actions.js';

const djClassifiedsStates: readonly number[] = Object.freeze([-2, 0, 1, 2]);

const djclassifiedsListInputSchema: JsonSchema = Object.freeze({
  type: 'object',
  properties: Object.freeze({
    offset: Object.freeze({ type: 'integer', minimum: 0, maximum: 1_000_000, default: 0 }),
    limit: Object.freeze({ type: 'integer', minimum: 1, maximum: 100, default: 20 }),
    search: Object.freeze({ type: 'string', maxLength: 200 }),
    state: Object.freeze({ type: 'integer', enum: djClassifiedsStates }),
  }),
  additionalProperties: false,
});

const djclassifiedsGetInputSchema: JsonSchema = Object.freeze({
  type: 'object',
  properties: Object.freeze({
    id: Object.freeze({ type: 'integer', minimum: 1 }),
  }),
  required: Object.freeze(['id']),
  additionalProperties: false,
});

const djclassifiedsStateInputSchema: JsonSchema = Object.freeze({
  type: 'object',
  properties: Object.freeze({
    id: Object.freeze({ type: 'integer', minimum: 1 }),
    state: Object.freeze({ type: 'integer', enum: djClassifiedsStates }),
  }),
  required: Object.freeze(['id', 'state']),
  additionalProperties: false,
});

const djclassifiedsInspectInputSchema: JsonSchema = Object.freeze({
  type: 'object',
  properties: Object.freeze({
    sampleRows: Object.freeze({ type: 'boolean', default: false }),
    maxTables: Object.freeze({ type: 'integer', minimum: 1, maximum: 1_000, default: 200 }),
    maxColumns: Object.freeze({ type: 'integer', minimum: 1, maximum: 1_000, default: 200 }),
    maxSampleRows: Object.freeze({ type: 'integer', minimum: 1, maximum: 50, default: 5 }),
  }),
  additionalProperties: false,
});

// Mirrors the *_WRITE allowlists in DjClassifiedsCatalogue.php. The companion
// plugin is the authoritative writer; this edge catalogue is the MCP-side
// allowlist that rejects every other field before a write is even planned.
const djclassifiedsWriteFields: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'djclassifieds.items': Object.freeze([
    'cat_id', 'type_id', 'name', 'alias', 'description', 'intro_desc',
    'date_start', 'date_exp', 'date_mod', 'display', 'special', 'notify',
    'published', 'ordering', 'price', 'price_negotiable', 'contact', 'pay_type',
    'address', 'region_id', 'exp_days', 'promotions', 'post_code', 'video', 'website',
    'currency', 'metakey', 'metadesc', 'latitude', 'longitude', 'email',
    'access_view', 'quantity', 'unit_id', 'offer', 'blocked', 'metarobots',
  ]),
  'djclassifieds.categories': Object.freeze([
    'name', 'alias', 'parent_id', 'price', 'description', 'ordering',
    'published', 'autopublish', 'metakey', 'metadesc', 'access', 'points',
    'ads_disabled', 'theme', 'access_view', 'access_item_view', 'restriction_18',
    'rev_group_id', 'schema_type', 'metarobots', 'metatitle', 'ads_limit',
    'header_text', 'map_marker_icon', 'auction_disabled', 'buynow_disabled',
    'offer_disabled',
  ]),
  'djclassifieds.profiles': Object.freeze([
    'group_id', 'region_id', 'address', 'post_code',
    'latitude', 'longitude', 'verified', 'disabled_emails', 'description',
  ]),
  'djclassifieds.regions': Object.freeze([
    'name', 'parent_id', 'country', 'city', 'published',
    'latitude', 'longitude', 'country_iso', 'header_text', 'alias',
    'ordering', 'metatitle', 'metakey', 'metadesc', 'metarobots',
    'ads_disabled',
  ]),
  'djclassifieds.plans': Object.freeze([
    'name', 'description', 'price', 'points', 'published', 'ordering',
    'groups_assignment', 'groups_restriction', 'params', 'recurring',
    'hidden_labels', 'groups_assignment_exp', 'one_time', 'exp_type',
    'groups_deassignment', 'verify', 'unverify_exp',
  ]),
  'djclassifieds.types': Object.freeze([
    'name', 'price', 'points', 'ordering', 'published',
    'params', 'ug_access_disallow', 'cat_access_disallow',
  ]),
});

interface DjClassifiedsEntity {
  readonly id: string;
  readonly label: string;
  readonly listModel: string;
  readonly itemModel: string;
  readonly supportsState: boolean;
}

const djClassifiedsEntities: readonly DjClassifiedsEntity[] = Object.freeze([
  { id: 'djclassifieds.items', label: 'DJ-Classifieds items', listModel: 'Items', itemModel: 'Item', supportsState: true },
  { id: 'djclassifieds.categories', label: 'DJ-Classifieds categories', listModel: 'Categories', itemModel: 'Category', supportsState: true },
  { id: 'djclassifieds.profiles', label: 'DJ-Classifieds user profiles', listModel: 'Profiles', itemModel: 'Profile', supportsState: false },
  { id: 'djclassifieds.regions', label: 'DJ-Classifieds regions', listModel: 'Regions', itemModel: 'Region', supportsState: true },
  { id: 'djclassifieds.plans', label: 'DJ-Classifieds plans', listModel: 'Plans', itemModel: 'Plan', supportsState: true },
  { id: 'djclassifieds.types', label: 'DJ-Classifieds item types', listModel: 'Types', itemModel: 'Type', supportsState: true },
]);

const djClassifiedsEntityReadActions: readonly CompanionActionDescriptor[] = Object.freeze(
  djClassifiedsEntities.flatMap((entity) => [
    read(`${entity.id}.list`, `List ${entity.label}`, `List ${entity.label} through DJ-Classifieds administrator models.`, 'djclassifieds', 'djclassifieds.read', djclassifiedsListInputSchema, {
      kind: 'administrator-model', component: 'com_djclassifieds', model: entity.listModel, method: 'getItems',
    }),
    read(`${entity.id}.get`, `Get ${entity.label}`, `Get one ${entity.label.toLocaleLowerCase('en')} through DJ-Classifieds administrator models.`, 'djclassifieds', 'djclassifieds.read', djclassifiedsGetInputSchema, {
      kind: 'administrator-model', component: 'com_djclassifieds', model: entity.itemModel, method: 'getItem',
    }),
  ]),
);

const djClassifiedsInspectAction: CompanionActionDescriptor = read(
  'djclassifieds.inspect',
  'Inspect DJ-Classifieds reference',
  'Inspect the live DJ-Classifieds installation and return its complete machine-readable database, files, and plugin reference.',
  'djclassifieds',
  'djclassifieds.read',
  djclassifiedsInspectInputSchema,
  { kind: 'joomla-runtime', component: 'com_djclassifieds', method: 'live schema, files, and plugins inspection' },
);

export const djClassifiedsReadActions: readonly CompanionActionDescriptor[] = Object.freeze([
  ...djClassifiedsEntityReadActions,
  djClassifiedsInspectAction,
]);

const djClassifiedsStateActions: readonly CompanionActionDescriptor[] = Object.freeze(
  djClassifiedsEntities
    .filter((entity) => entity.supportsState)
    .map((entity) => Object.freeze({
      id: `${entity.id}.state`,
      title: `Change ${entity.label} state`,
      description: `Change one ${entity.label.toLocaleLowerCase('en')} state through DJ-Classifieds administrator models.`,
      domain: 'djclassifieds',
      risk: 'write' as const,
      toolset: 'djclassifieds.write' as const,
      inputSchema: djclassifiedsStateInputSchema,
      native: Object.freeze({
        kind: 'administrator-model' as const,
        component: 'com_djclassifieds' as const,
        model: entity.itemModel,
        method: 'publish',
      }),
    })),
);

function djClassifiedsDataInputSchema(entity: DjClassifiedsEntity, operation: 'create' | 'update'): JsonSchema {
  const fieldSchemas: Record<string, Readonly<Record<string, unknown>>> = {};

  for (const field of djclassifiedsWriteFields[entity.id]!) {
    fieldSchemas[field] = Object.freeze({
      type: ['string', 'integer', 'number', 'boolean', 'array', 'object', 'null'],
    });
  }

  return Object.freeze({
    type: 'object',
    properties: Object.freeze({
      ...(operation === 'update'
        ? { id: Object.freeze({ type: 'integer', minimum: 1 }) }
        : {}),
      data: Object.freeze({
        type: 'object',
        minProperties: 1,
        properties: Object.freeze(fieldSchemas),
        additionalProperties: false,
      }),
    }),
    required: Object.freeze(operation === 'update' ? ['id', 'data'] : ['data']),
    additionalProperties: false,
  });
}

const djclassifiedsDeleteInputSchema: JsonSchema = Object.freeze({
  type: 'object',
  properties: Object.freeze({
    id: Object.freeze({ type: 'integer', minimum: 1 }),
  }),
  required: Object.freeze(['id']),
  additionalProperties: false,
});

const djClassifiedsEntityWriteActions: readonly CompanionActionDescriptor[] = Object.freeze(
  djClassifiedsEntities.flatMap((entity) => [
    operation(`${entity.id}.create`, `Create ${entity.label}`, `Create one ${entity.label.toLocaleLowerCase('en')} through DJ-Classifieds administrator models.`, 'djclassifieds', 'djclassifieds.write', 'write', djClassifiedsDataInputSchema(entity, 'create'), {
      kind: 'administrator-model', component: 'com_djclassifieds', model: entity.itemModel, method: 'save',
    }),
    operation(`${entity.id}.update`, `Update ${entity.label}`, `Update one ${entity.label.toLocaleLowerCase('en')} through DJ-Classifieds administrator models.`, 'djclassifieds', 'djclassifieds.write', 'write', djClassifiedsDataInputSchema(entity, 'update'), {
      kind: 'administrator-model', component: 'com_djclassifieds', model: entity.itemModel, method: 'getItem + save',
    }),
    operation(`${entity.id}.delete`, `Delete ${entity.label}`, `Delete one ${entity.label.toLocaleLowerCase('en')} through DJ-Classifieds administrator models.`, 'djclassifieds', 'djclassifieds.write', 'high', djclassifiedsDeleteInputSchema, {
      kind: 'administrator-model', component: 'com_djclassifieds', model: entity.itemModel, method: 'delete',
    }),
  ]),
);

export const djClassifiedsWriteActions: readonly CompanionActionDescriptor[] = Object.freeze([
  ...djClassifiedsStateActions,
  ...djClassifiedsEntityWriteActions,
]);

export function normalizeDjClassifiedsReadInput(
  actionId: string,
  value: unknown,
): Readonly<Record<string, unknown>> {
  const input = plainObject(value);

  if (actionId === 'djclassifieds.inspect') {
    rejectUnknown(input, ['sampleRows', 'maxTables', 'maxColumns', 'maxSampleRows']);
    const normalized: Record<string, unknown> = {};
    if (input['sampleRows'] !== undefined) {
      if (typeof input['sampleRows'] !== 'boolean') throw new Error('sampleRows must be a boolean.');
      normalized['sampleRows'] = input['sampleRows'];
    }
    if (input['maxTables'] !== undefined) normalized['maxTables'] = boundedInteger(input['maxTables'], 'maxTables', 1, 1_000);
    if (input['maxColumns'] !== undefined) normalized['maxColumns'] = boundedInteger(input['maxColumns'], 'maxColumns', 1, 1_000);
    if (input['maxSampleRows'] !== undefined) normalized['maxSampleRows'] = boundedInteger(input['maxSampleRows'], 'maxSampleRows', 1, 50);
    return Object.freeze(normalized);
  }

  if (actionId.endsWith('.get')) {
    rejectUnknown(input, ['id']);
    return Object.freeze({ id: boundedInteger(input['id'], 'id', 1, 2_147_483_647) });
  }

  if (actionId.endsWith('.list')) {
    rejectUnknown(input, ['offset', 'limit', 'search', 'state']);
    const normalized: Record<string, unknown> = {
      offset: optionalInteger(input['offset'], 'offset', 0, 1_000_000, 0),
      limit: optionalInteger(input['limit'], 'limit', 1, 100, 20),
    };
    if (input['search'] !== undefined) normalized['search'] = boundedSearchText(input['search'], 'search', 200);
    if (input['state'] !== undefined) {
      const state = boundedInteger(input['state'], 'state', -2, 2);
      if (!djClassifiedsStates.includes(state)) throw new Error('state must be one of -2, 0, 1, or 2.');
      normalized['state'] = state;
    }
    return Object.freeze(normalized);
  }

  throw new Error(`Unknown Joomla companion read action: ${actionId}.`);
}

export function normalizeDjClassifiedsWriteInput(
  actionId: string,
  value: unknown,
): Readonly<Record<string, unknown>> {
  const input = plainObject(value);

  if (actionId.endsWith('.state')) {
    rejectUnknown(input, ['id', 'state']);
    const state = boundedInteger(input['state'], 'state', -2, 2);
    if (!djClassifiedsStates.includes(state)) throw new Error('state must be one of -2, 0, 1, or 2.');
    return Object.freeze({
      id: boundedInteger(input['id'], 'id', 1, 2_147_483_647),
      state,
    });
  }

  const dot = actionId.lastIndexOf('.');
  const entityId = actionId.slice(0, dot);
  const operation = actionId.slice(dot + 1);
  const allowedFields = djclassifiedsWriteFields[entityId];

  if (allowedFields === undefined) {
    throw new Error(`Unknown Joomla companion write action: ${actionId}.`);
  }

  if (operation === 'delete') {
    rejectUnknown(input, ['id']);
    return Object.freeze({ id: boundedInteger(input['id'], 'id', 1, 2_147_483_647) });
  }

  rejectUnknown(input, operation === 'create' ? ['data'] : ['id', 'data']);
  const data = plainObject(input['data']);
  const dataKeys = Object.keys(data);

  if (dataKeys.length === 0) {
    throw new Error(`${actionId} data must contain at least one allowed field.`);
  }

  const unknown = dataKeys.filter((key) => !allowedFields.includes(key)).sort();

  if (unknown.length > 0) {
    throw new Error(`Unsupported ${entityId} writable field: ${unknown.join(', ')}.`);
  }

  const normalizedData: Record<string, unknown> = {};

  for (const key of dataKeys) {
    normalizedData[key] = boundedWriteValue(data[key], `data.${key}`);
  }

  const normalized: Record<string, unknown> = { data: Object.freeze(normalizedData) };

  if (operation === 'update') {
    normalized['id'] = boundedInteger(input['id'], 'id', 1, 2_147_483_647);
  }

  return Object.freeze(normalized);
}

const MAX_WRITE_STRING_BYTES = 524_288;
const MAX_WRITE_COLLECTION_ITEMS = 1_000;
const MAX_WRITE_NESTING_DEPTH = 6;

// Mirrors Input::boundedValue() in the companion plugin so the edge performs
// the same string/collection/nesting bounds before any write reaches Joomla.
function boundedWriteValue(value: unknown, name: string, depth = 0): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error(`${name} contains an invalid numeric value.`);
    }

    if (typeof value === 'string' && (utf8ByteLength(value) > MAX_WRITE_STRING_BYTES || value.includes('\0'))) {
      throw new Error(`${name} contains an invalid string value.`);
    }

    return value;
  }

  if (!Array.isArray(value) && !isPlainObject(value)) {
    throw new Error(`${name} contains an unsupported value.`);
  }

  if (depth >= MAX_WRITE_NESTING_DEPTH || Object.keys(value).length > MAX_WRITE_COLLECTION_ITEMS) {
    throw new Error(`${name} contains an unsupported or oversized value.`);
  }

  const result: Record<string, unknown> = {};

  for (const [member, nested] of Object.entries(value)) {
    if (member.length > 128 || member.includes('\0')) {
      throw new Error(`${name} contains an invalid nested member.`);
    }

    result[member] = boundedWriteValue(nested, name, depth + 1);
  }

  return result;
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function read(
  id: string,
  title: string,
  description: string,
  domain: string,
  toolset: Toolset,
  inputSchema: JsonSchema,
  native: JoomlaNativeCapability,
): CompanionActionDescriptor {
  return Object.freeze({ id, title, description, domain, risk: 'read', toolset, inputSchema, native: Object.freeze(native) });
}

function operation(
  id: string,
  title: string,
  description: string,
  domain: string,
  toolset: Toolset,
  risk: 'write' | 'high',
  inputSchema: JsonSchema,
  native: JoomlaNativeCapability,
): CompanionActionDescriptor {
  return Object.freeze({ id, title, description, domain, risk, toolset, inputSchema, native: Object.freeze(native) });
}

function plainObject(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('Companion action input must be an object.');
  }
  return value as Readonly<Record<string, unknown>>;
}

function rejectUnknown(input: Readonly<Record<string, unknown>>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(input).filter((key) => !allowedSet.has(key)).sort();
  if (unknown.length > 0) throw new Error(`Unsupported companion action input properties: ${unknown.join(', ')}.`);
}

function boundedInteger(value: unknown, name: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value as number;
}

function optionalInteger(value: unknown, name: string, minimum: number, maximum: number, fallback: number): number {
  return value === undefined ? fallback : boundedInteger(value, name, minimum, maximum);
}

function boundedSearchText(value: unknown, name: string, maximumBytes: number): string {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > maximumBytes || value.includes('\0')) {
    throw new Error(`${name} must be a string of at most ${maximumBytes} UTF-8 bytes.`);
  }
  return value;
}
