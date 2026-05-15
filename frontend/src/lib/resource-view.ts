import type { Category, Resource, ResourceTypeDefinition, ResourceWithSync } from '../types';

export type ResourceFilterMode = 'all' | 'important';

const collator = new Intl.Collator('tr', { sensitivity: 'base' });

export const sortCategoriesAlphabetically = <T extends Pick<Category, 'name'>>(categories: T[]) =>
  [...categories].sort((left, right) => collator.compare(left.name, right.name));

export const sortResourcesForView = <T extends Pick<Resource, 'is_favorite' | 'sort_order' | 'title'>>(resources: T[]) =>
  [...resources].sort((left, right) => {
    if (left.is_favorite !== right.is_favorite) {
      return Number(right.is_favorite) - Number(left.is_favorite);
    }

    if (left.sort_order !== right.sort_order) {
      return left.sort_order - right.sort_order;
    }

    return collator.compare(left.title, right.title);
  });

export const filterResourcesByMode = <T extends Pick<Resource, 'is_favorite'>>(resources: T[], filterMode: ResourceFilterMode) => {
  if (filterMode === 'important') {
    return resources.filter((resource) => resource.is_favorite);
  }

  return resources;
};

const formatResourceLine = (resource: {
  title: string;
  url: string | null;
  description: string | null;
  is_favorite: boolean;
  categoryName?: string | null;
}) => {
  const lines = [`- ${resource.is_favorite ? '★ ' : ''}${resource.title}`];

  if (resource.url) {
    lines.push(`  - URL: ${resource.url}`);
  }

  if (resource.categoryName) {
    lines.push(`  - Kategori: ${resource.categoryName}`);
  }

  if (resource.description) {
    lines.push(`  - Açıklama: ${resource.description}`);
  }

  return lines.join('\n');
};

export const buildSelectedViewMarkdown = ({
  typeLabel,
  selectedCategoryName,
  searchQuery,
  filterMode,
  resources,
}: {
  typeLabel: string;
  selectedCategoryName: string | null;
  searchQuery: string;
  filterMode: ResourceFilterMode;
  resources: ResourceWithSync[];
}) => {
  const lines = [
    '# Link Manager Export',
    '',
    `## ${typeLabel}`,
    '',
    `- Görünüm: ${selectedCategoryName ?? 'Tüm kaynaklar'}`,
    `- Filtre: ${filterMode === 'important' ? 'Sadece önemli' : 'Tümü'}`,
    `- Arama: ${searchQuery.trim() || 'Yok'}`,
    '',
  ];

  if (resources.length === 0) {
    lines.push('_Bu görünümde indirilecek kayıt yok._');
    return lines.join('\n');
  }

  for (const resource of resources) {
    lines.push(formatResourceLine({
      title: resource.title,
      url: resource.url,
      description: resource.description,
      is_favorite: resource.is_favorite,
      categoryName: resource.category?.name ?? null,
    }));
    lines.push('');
  }

  return lines.join('\n').trim();
};

export const buildFullExportMarkdown = ({
  exportedAt,
  resourceTypes,
  categories,
  resources,
}: {
  exportedAt: string;
  resourceTypes: ResourceTypeDefinition[];
  categories: Category[];
  resources: Resource[];
}) => {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const lines = ['# Link Manager Export', '', `- Oluşturulma: ${exportedAt}`, ''];

  for (const resourceType of resourceTypes) {
    const typeResources = sortResourcesForView(resources.filter((resource) => resource.type === resourceType.id));
    if (typeResources.length === 0) {
      continue;
    }

    lines.push(`## ${resourceType.name}`);
    lines.push('');

    const groupedResources = new Map<string, { heading: string; items: typeof typeResources }>();

    for (const resource of typeResources) {
      const category = resource.category_id ? categoryMap.get(resource.category_id) ?? null : null;
      const groupKey = category?.id ? String(category.id) : 'uncategorized';
      const group = groupedResources.get(groupKey);

      if (group) {
        group.items.push(resource);
        continue;
      }

      groupedResources.set(groupKey, {
        heading: category?.name ?? 'Kategorisiz',
        items: [resource],
      });
    }

    const orderedGroups = [...groupedResources.values()].sort((left, right) => collator.compare(left.heading, right.heading));

    for (const group of orderedGroups) {
      lines.push(`### ${group.heading}`);
      lines.push('');

      for (const resource of group.items) {
        lines.push(formatResourceLine({
          title: resource.title,
          url: resource.url,
          description: resource.description,
          is_favorite: resource.is_favorite,
        }));
        lines.push('');
      }
    }
  }

  return lines.join('\n').trim();
};

export const downloadMarkdown = (filename: string, content: string) => {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export const buildExportFilename = (prefix: string) => `${prefix}-${new Date().toISOString().slice(0, 10)}.md`;
