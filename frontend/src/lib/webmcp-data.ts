import type { Category, ExportPayload, Resource, ResourceTypeDefinition } from '../types';

// pg returns BIGINT IDs as strings; SQLite returns booleans as integers and
// JSON metadata as text. Give the browser tools one consistent contract.
export function normalizeId(value: unknown): number {
  const number = typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number <= 0) throw new Error('The record ID is not a supported positive safe integer.');
  return number;
}

function normalizeBoolean(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  throw new Error('Unsupported boolean value in API response.');
}

export function normalizeResource<T extends Resource>(resource: T): T {
  return {
    ...resource,
    id: normalizeId(resource.id),
    category_id: resource.category_id === null ? null : normalizeId(resource.category_id),
    is_favorite: normalizeBoolean(resource.is_favorite),
    metadata: typeof resource.metadata === 'string' ? JSON.parse(resource.metadata) : resource.metadata,
  };
}

export function normalizeCategory<T extends Category>(category: T): T {
  return { ...category, id: normalizeId(category.id) };
}

export function normalizeResourceType<T extends ResourceTypeDefinition>(type: T): T {
  return { ...type, is_builtin: normalizeBoolean(type.is_builtin) };
}

export function normalizeExport(payload: ExportPayload): ExportPayload {
  return { ...payload, resourceTypes: payload.resourceTypes.map(normalizeResourceType), categories: payload.categories.map(normalizeCategory), resources: payload.resources.map(normalizeResource) };
}
