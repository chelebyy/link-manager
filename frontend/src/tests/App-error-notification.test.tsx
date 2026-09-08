import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import App from '../App';
import { api, ApiError } from '../lib/api';

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

it('shows a resource load error once instead of recursively adding toasts', async () => {
  localStorage.setItem('link-manager:view-state', JSON.stringify({ selectedType: 'website', selectedCategory: null, searchQuery: '', resourceFilterMode: 'all' }));
  vi.spyOn(api, 'getCategories').mockResolvedValue([]);
  vi.spyOn(api, 'getResourceTypes').mockResolvedValue([{ id: 'website', name: 'Websites', icon: 'Globe', color: '#123456', description: '', is_builtin: true, sort_order: 0, created_at: '', updated_at: '' }]);
  vi.spyOn(api, 'getResources').mockRejectedValue(new ApiError('Too Many Requests', 429));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const rendered = render(<QueryClientProvider client={client}><App /></QueryClientProvider>);
  try {
    await screen.findByText(/Kaynaklar yüklenemedi/);
    await waitFor(() => expect(screen.getAllByText(/Kaynaklar yüklenemedi/)).toHaveLength(1));
    expect(api.getResources).toHaveBeenCalledOnce();
  } finally { rendered.unmount(); client.clear(); }
});
