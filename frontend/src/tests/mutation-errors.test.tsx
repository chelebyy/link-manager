import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../lib/api', () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  }

  return {
    api: {
      getResources: vi.fn().mockResolvedValue([]),
      getResourceTypes: vi.fn().mockResolvedValue([]),
      getCategories: vi.fn().mockResolvedValue([]),
      createResource: vi.fn(),
      updateResource: vi.fn(),
      deleteResource: vi.fn(),
      toggleFavorite: vi.fn(),
      reorderResources: vi.fn(),
      bulkMoveResources: vi.fn(),
    },
    ApiError,
  };
});

import { AddResourceDialog } from '../components/AddResourceDialog/AddResourceDialog';
import { ResourceList } from '../components/ResourceList/ResourceList';
import { api, ApiError } from '../lib/api';
import type { Category, ResourceTypeDefinition, ResourceWithSync } from '../types';

const mockedApi = vi.mocked(api);

const resourceTypes: ResourceTypeDefinition[] = [
  { id: 'website', name: 'Website', icon: 'globe', color: '#000', description: '', is_builtin: true, sort_order: 0, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
];

const categories: Category[] = [];

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, structuralSharing: false },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { Wrapper, queryClient };
}

function renderDialog(onNotify: (kind: 'success' | 'error', title: string, description?: string) => void) {
  const onClose = vi.fn();
  const utils = render(
    <AddResourceDialog
      open
      onClose={onClose}
      onNotify={onNotify}
      categories={categories}
      selectedType="website"
      resourceTypes={resourceTypes}
    />,
    { wrapper: makeWrapper().Wrapper },
  );
  return { onClose, ...utils };
}

function renderList(onNotify: (kind: 'success' | 'error', title: string, description?: string) => void, resources: ResourceWithSync[]) {
  mockedApi.getResources.mockResolvedValue(resources);
  mockedApi.getResourceTypes.mockResolvedValue(resourceTypes);
  mockedApi.getCategories.mockResolvedValue([]);
  const utils = render(
    <ResourceList
      categoryId={null}
      type="website"
      searchQuery=""
      resourceFilterMode="all"
      onNotify={onNotify}
    />,
    { wrapper: makeWrapper().Wrapper },
  );
  return utils;
}

const sampleResource: ResourceWithSync = {
  id: 1,
  category_id: null,
  type: 'website',
  title: 'Sample',
  url: 'https://example.com',
  description: null,
  metadata: {},
  is_favorite: false,
  sort_order: 1,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('LM-002: mutation errors are surfaced via onNotify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.getResources.mockResolvedValue([]);
    mockedApi.getResourceTypes.mockResolvedValue(resourceTypes);
    mockedApi.getCategories.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls onNotify when createResource mutation fails', async () => {
    const onNotify = vi.fn<(kind: 'success' | 'error', title: string, description?: string) => void>();
    mockedApi.createResource.mockRejectedValueOnce(new ApiError('Sunucu hatası', 500));

    renderDialog(onNotify);

    const titleInput = (await screen.findByLabelText(/Başlık/i)) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(titleInput, { target: { value: 'New resource' } });
    });

    const submit = screen.getByRole('button', { name: /Ekle/ });
    await waitFor(() => expect(submit).not.toBeDisabled());

    await act(async () => {
      fireEvent.click(submit);
    });

    await waitFor(() => {
      expect(onNotify).toHaveBeenCalled();
    });

    const errorCalls = onNotify.mock.calls.filter(([kind]) => kind === 'error');
    expect(errorCalls.length).toBeGreaterThan(0);
    expect(errorCalls[0]?.[1]).toMatch(/Kaynak/);
  });

  it('calls onNotify when deleteResource mutation fails', async () => {
    const onNotify = vi.fn<(kind: 'success' | 'error', title: string, description?: string) => void>();
    mockedApi.deleteResource.mockRejectedValueOnce(new ApiError('Silinemedi', 500));

    renderList(onNotify, [sampleResource]);

    const deleteButton = await screen.findByLabelText(/Kaynağı sil/i);
    await act(async () => {
      fireEvent.click(deleteButton);
    });

    const confirmButton = await screen.findByRole('button', { name: /^Sil$/ });
    await act(async () => {
      fireEvent.click(confirmButton);
    });

    await waitFor(() => {
      expect(onNotify).toHaveBeenCalled();
    });

    const errorCalls = onNotify.mock.calls.filter(([kind]) => kind === 'error');
    expect(errorCalls.length).toBeGreaterThan(0);
    expect(errorCalls.some((call) => /silinemedi/i.test(String(call[1])))).toBe(true);
  });
});
