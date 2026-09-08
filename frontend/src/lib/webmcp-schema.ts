// The small JSON Schema subset used by our tools. Validation also runs inside
// execute: browser-side schema validation alone is not a trust boundary.
export interface Schema {
  type: string | string[];
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: Schema;
  enum?: (string | number)[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  pattern?: string;
  description?: string;
}

export const objectSchema = (properties: Record<string, Schema>, required: string[] = []): Schema =>
  ({ type: 'object', properties, required, additionalProperties: false });
export const textSchema: Schema = { type: 'string', minLength: 1, maxLength: 500 };
export const idSchema: Schema = { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
export const categorySchema: Schema = { ...idSchema, type: ['integer', 'null'] };
export const descriptionSchema: Schema = { type: ['string', 'null'], maxLength: 20000 };
export const urlSchema: Schema = { type: ['string', 'null'], maxLength: 8192, pattern: '^https?://' };
export const colorSchema: Schema = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' };
export const idsSchema = (items: Schema): Schema =>
  ({ type: 'array', items, minItems: 1, maxItems: 500, uniqueItems: true });

export function validateSchema(value: unknown, schema: Schema, path = 'input'): void {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  const validType = types.includes(type) || (types.includes('integer') && typeof value === 'number' && Number.isSafeInteger(value));
  if (!validType) throw new Error(`${path}: expected ${types.join(' or ')}`);
  if (value === null) return;
  if (schema.enum && !schema.enum.includes(value as string | number)) throw new Error(`${path}: unsupported value`);
  if (typeof value === 'string') {
    if ((schema.minLength && value.trim().length < schema.minLength) || (schema.maxLength && value.length > schema.maxLength)) throw new Error(`${path}: invalid length`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) throw new Error(`${path}: invalid format`);
  }
  if (typeof value === 'number' && (!Number.isFinite(value) || (schema.minimum !== undefined && value < schema.minimum) || (schema.maximum !== undefined && value > schema.maximum))) throw new Error(`${path}: out of range`);
  if (Array.isArray(value)) {
    if ((schema.minItems && value.length < schema.minItems) || (schema.maxItems && value.length > schema.maxItems)) throw new Error(`${path}: invalid item count`);
    if (schema.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length) throw new Error(`${path}: duplicate items`);
    if (schema.items) value.forEach((item, index) => validateSchema(item, schema.items!, `${path}[${index}]`));
  } else if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!Object.hasOwn(record, key)) throw new Error(`${path}.${key}: required`);
    for (const [key, item] of Object.entries(record)) {
      if (schema.properties && Object.hasOwn(schema.properties, key)) validateSchema(item, schema.properties[key], `${path}.${key}`);
      else if (schema.additionalProperties === false) throw new Error(`${path}.${key}: unknown field`);
    }
  }
}
