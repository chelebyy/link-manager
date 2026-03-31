export const queryKeys = {
  categories: (type?: string) => ['categories', type ?? 'all'] as const,
  resourceTypes: () => ['resource-types'] as const,
  resources: (params: { categoryId?: number | null; type?: string | null; search?: string }) =>
    ['resources', params.type ?? 'all', params.categoryId ?? 'all', params.search ?? ''] as const,
  globalResources: (search: string) => ['resources', 'global', search] as const,
};
