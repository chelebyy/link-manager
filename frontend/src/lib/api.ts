import type { Category, ExportPayload, ResourceTypeDefinition, ResourceWithSync } from '../types';

type RequestOptions = RequestInit & {
  skipJson?: boolean;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(input: string, init?: RequestOptions): Promise<T> {
  const response = await fetch(input, init);

  if (!response.ok) {
    let message = 'İstek başarısız oldu.';
    try {
      const payload = await response.json() as { error?: string };
      message = payload.error || message;
    } catch {}
    throw new ApiError(message, response.status);
  }

  if (init?.skipJson || response.status === 204) {
    return undefined as T;
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength === '0') {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  getCategories: (type?: string) => request<Category[]>(`/api/categories${type ? `?type=${encodeURIComponent(type)}` : ''}`),
  createCategory: (payload: { name: string; type: string; color: string; icon: string }) =>
    request<Category>('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  updateCategory: (id: number, payload: { name: string; color: string; icon: string }) =>
    request<Category>(`/api/categories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  deleteCategory: (id: number) => request<void>(`/api/categories/${id}`, { method: 'DELETE', skipJson: true }),
  reorderCategories: (ids: number[]) => request<{ success: boolean }>('/api/categories/reorder', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  }),

  getResourceTypes: () => request<ResourceTypeDefinition[]>('/api/resource-types'),
  createResourceType: (payload: { name: string; icon: string; color: string; description: string }) =>
    request<ResourceTypeDefinition>('/api/resource-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  updateResourceType: (id: string, payload: { name: string; icon: string; color: string; description: string }) =>
    request<ResourceTypeDefinition>(`/api/resource-types/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  deleteResourceType: (id: string) => request<void>(`/api/resource-types/${id}`, { method: 'DELETE', skipJson: true }),
  reorderResourceTypes: (ids: string[]) => request<{ success: boolean }>('/api/resource-types/reorder', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  }),

  getResources: (params: { categoryId?: number | null; type?: string | null; search?: string }) => {
    const searchParams = new URLSearchParams();
    if (params.categoryId) searchParams.append('category', String(params.categoryId));
    if (params.type) searchParams.append('type', params.type);
    if (params.search) searchParams.append('search', params.search);
    return request<ResourceWithSync[]>(`/api/resources?${searchParams.toString()}`);
  },
  createResource: (payload: { type: string; title: string; url: string | null; description: string | null; category_id: number | null }) =>
    request<ResourceWithSync>('/api/resources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  deleteResource: (id: number) => request<void>(`/api/resources/${id}`, { method: 'DELETE', skipJson: true }),
  toggleFavorite: (id: number, isFavorite: boolean) =>
    request<ResourceWithSync>(`/api/resources/${id}/favorite`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_favorite: isFavorite }),
    }),
  reorderResources: (ids: number[]) => request<{ success: boolean }>('/api/resources/reorder', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  }),

  exportData: () => request<ExportPayload>('/api/data/export'),
  importData: (payload: ExportPayload) => request<{ success: boolean }>('/api/data/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
};
