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
      getResources: vi.fn(),
      getResourceTypes: vi.fn().mockResolvedValue([]),
      getCategories: vi.fn().mockResolvedValue([]),
      createResource: vi.fn().mockResolvedValue({ id: 99 }),
      updateResource: vi.fn().mockResolvedValue({ id: 99 }),
    },
    ApiError,
  };
});

import { AddResourceDialog } from '../components/AddResourceDialog/AddResourceDialog';
import { api } from '../lib/api';
import type { Category, ResourceTypeDefinition } from '../types';

const mockedApi = vi.mocked(api);

const resourceTypes: ResourceTypeDefinition[] = [
  { id: 'website', name: 'Website', icon: 'globe', color: '#000', description: '', is_builtin: true, sort_order: 0, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
  { id: 'github', name: 'GitHub', icon: 'github', color: '#000', description: '', is_builtin: true, sort_order: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
];

const categories: Category[] = [];

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        structuralSharing: false,
      },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { Wrapper, queryClient };
}

function renderDialog(props: Partial<React.ComponentProps<typeof AddResourceDialog>> = {}) {
  const onClose = vi.fn();
  const utils = render(
    <AddResourceDialog
      open
      onClose={onClose}
      categories={categories}
      selectedType="website"
      resourceTypes={resourceTypes}
      {...props}
    />,
    { wrapper: makeWrapper().Wrapper },
  );
  return { onClose, ...utils };
}

describe('AddResourceDialog F9 — submit disabled while duplicate check is fetching', () => {
  let deferred: { resolve: (value: unknown) => void; promise: Promise<unknown> };

  beforeEach(() => {
    vi.clearAllMocks();
    deferred = createDeferred();
    mockedApi.getResources.mockImplementation(() => deferred.promise as ReturnType<typeof api.getResources>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('disables the submit button while typeResourcesQuery is fetching', async () => {
    renderDialog();

    const submit = await screen.findByRole('button', { name: /Ekle/ });

    // While the deferred promise is pending, isFetching is true, so the submit
    // button must be disabled.
    await waitFor(() => {
      expect(submit).toBeDisabled();
    });

    // The URL field should also reflect the loading state and a hint should be
    // visible so the user understands why the button is disabled.
    const urlInput = screen.getByLabelText(/^URL$/i) as HTMLInputElement;
    expect(urlInput).toBeDisabled();
    expect(screen.getByText(/Mevcut URL'ler kontrol ediliyor/i)).toBeInTheDocument();
  });

  it('enables the submit button when fetch completes with no conflict', async () => {
    renderDialog();

    const titleInput = (await screen.findByLabelText(/Başlık/i)) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(titleInput, { target: { value: 'A new resource' } });
    });

    const urlInput = screen.getByLabelText(/^URL$/i) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(urlInput, { target: { value: 'https://example.com/unique' } });
    });

    const submit = screen.getByRole('button', { name: /Ekle/ });
    expect(submit).toBeDisabled();

    // Resolve the duplicate check with no conflict.
    await act(async () => {
      deferred.resolve([]);
    });

    await waitFor(() => {
      expect(submit).not.toBeDisabled();
    });
  });

  it('keeps the submit button disabled when fetch completes with a conflict', async () => {
    renderDialog();

    const titleInput = (await screen.findByLabelText(/Başlık/i)) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(titleInput, { target: { value: 'Duplicate' } });
    });

    const urlInput = screen.getByLabelText(/^URL$/i) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(urlInput, { target: { value: 'https://example.com/dup' } });
    });

    const submit = screen.getByRole('button', { name: /Ekle/ });
    expect(submit).toBeDisabled();

    // Resolve the duplicate check with an existing URL matching the candidate.
    await act(async () => {
      deferred.resolve([
        {
          id: 1,
          category_id: null,
          type: 'website',
          title: 'Existing',
          url: 'https://example.com/dup',
          description: null,
          metadata: {},
          is_favorite: false,
          sort_order: 1,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ]);
    });

    // Button stays disabled (URL field too) because the candidate URL collides
    // with an existing one. The user is forced to change the URL before the
    // submit can be attempted again.
    await waitFor(() => {
      expect(submit).toBeDisabled();
      expect(urlInput).toBeDisabled();
    });
  });
});

describe('AddResourceDialog editing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.getResources.mockResolvedValue([]);
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('hides type selection while editing and keeps categories scoped to the current type', async () => {
    renderDialog({
      categories: [
        { id: 101, name: 'Current Category', type: 'skill', color: '#111', icon: 'Folder', sort_order: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
        { id: 102, name: 'Other Category', type: 'website', color: '#222', icon: 'Folder', sort_order: 2, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
      ],
      selectedType: 'website',
      initialResource: {
        id: 55,
        category_id: 101,
        type: 'skill',
        title: 'Editable Resource',
        url: 'https://example.com/editable',
        description: 'Existing description',
      },
    });

    expect(screen.queryByLabelText('Tip')).not.toBeInTheDocument();
    expect(screen.getAllByText('Current Category').length).toBeGreaterThan(0);
    expect(screen.queryByText('Other Category')).not.toBeInTheDocument();
  });
});

function createDeferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((r) => {
    resolve = r as (value: unknown) => void;
  });
  return { resolve, promise };
}
