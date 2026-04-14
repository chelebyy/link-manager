import { Search, Layers, Folder, Loader2 } from 'lucide-react';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import type { Category, ResourceTypeDefinition, ResourceWithSync } from '../types';

interface GlobalSearchPanelProps {
  query: string;
  onQueryChange: (value: string) => void;
  categories: Category[];
  resourceTypes: ResourceTypeDefinition[];
  resources: ResourceWithSync[];
  onOpenType: (typeId: string) => void;
  onOpenCategory: (typeId: string, categoryId: number) => void;
  globalResultsQuery?: { isLoading?: boolean };
}

export function GlobalSearchPanel({ query, onQueryChange, categories, resourceTypes, resources, onOpenType, onOpenCategory, globalResultsQuery }: GlobalSearchPanelProps) {
  const normalized = query.trim().toLowerCase();
  const isLoading = globalResultsQuery?.isLoading ?? false;

  const matchingTypes = normalized
    ? resourceTypes.filter((type) =>
        [type.name, type.description ?? '', type.id].some((value) => value.toLowerCase().includes(normalized))
      )
    : [];

  const matchingCategories = normalized
    ? categories.filter((category) =>
        [category.name, category.type].some((value) => value.toLowerCase().includes(normalized))
      )
    : [];

  if (!query.trim()) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6b7280]" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            aria-label="Search cards, categories, or resources"
            className="h-11 border-[#d1d5db] rounded-sm pl-11 pr-4 font-mono text-sm placeholder:text-[#9ca3af] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff]"
            placeholder="Search cards, categories, or resources..."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <div className="relative max-w-2xl">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6b7280]" aria-hidden="true" />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          aria-label="Search cards, categories, or resources"
          className="h-11 border-[#d1d5db] rounded-sm pl-11 pr-4 font-mono text-sm placeholder:text-[#9ca3af] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff]"
          placeholder="Search cards, categories, or resources..."
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-[#58a6ff]" aria-hidden="true" />
          <span className="ml-3 font-mono text-sm text-[#6b7280]">Searching...</span>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="border-[#d1d5db] rounded-sm">
            <CardHeader className="pb-3">
              <CardTitle className="font-mono text-sm uppercase tracking-wide text-[#6b7280]">Card Results</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {matchingTypes.length === 0 ? <div className="max-w-[65ch] font-mono text-sm text-[#9ca3af]">No matching cards.</div> : null}
              {matchingTypes.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  aria-label={`Open card type: ${type.name}`}
                  className="flex w-full min-h-[60px] items-center justify-between rounded-sm border border-[#d1d5db] p-4 text-left transition hover:bg-[#f3f4f6] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff]"
                  onClick={() => onOpenType(type.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="max-w-[65ch] truncate font-mono text-sm font-medium">{type.name}</div>
                    {type.description ? <div className="max-w-[65ch] font-mono text-xs text-[#9ca3af]">{type.description}</div> : null}
                  </div>
                  <Badge variant="secondary" className="gap-1 font-mono text-xs shrink-0">
                    <Layers className="h-3 w-3" aria-hidden="true" />
                    {type.resource_count ?? 0}
                  </Badge>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className="border-[#d1d5db] rounded-sm">
            <CardHeader className="pb-3">
              <CardTitle className="font-mono text-sm uppercase tracking-wide text-[#6b7280]">Category Results</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {matchingCategories.length === 0 ? <div className="max-w-[65ch] font-mono text-sm text-[#9ca3af]">No matching categories.</div> : null}
              {matchingCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  aria-label={`Open category: ${category.name}`}
                  className="flex w-full min-h-[60px] items-center justify-between rounded-sm border border-[#d1d5db] p-4 text-left transition hover:bg-[#f3f4f6] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff]"
                  onClick={() => onOpenCategory(category.type, category.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="max-w-[65ch] truncate font-mono text-sm font-medium">{category.name}</div>
                    <div className="max-w-[65ch] font-mono text-xs text-[#9ca3af]">{category.type}</div>
                  </div>
                  <Badge variant="secondary" className="gap-1 font-mono text-xs shrink-0">
                    <Folder className="h-3 w-3" aria-hidden="true" />
                    category
                  </Badge>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className="border-[#d1d5db] rounded-sm">
            <CardHeader className="pb-3">
              <CardTitle className="font-mono text-sm uppercase tracking-wide text-[#6b7280]">Resource Results</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {resources.length === 0 ? <div className="max-w-[65ch] font-mono text-sm text-[#9ca3af]">No matching resources.</div> : null}
              {resources.slice(0, 8).map((resource) => (
                <button
                  key={resource.id}
                  type="button"
                  aria-label={`Open resource: ${resource.title}`}
                  className="flex w-full min-h-[60px] items-start gap-3 rounded-sm border border-[#d1d5db] p-4 text-left transition hover:bg-[#f3f4f6] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff]"
                  onClick={() => onOpenType(resource.type)}
                >
                  <Folder className="mt-0.5 h-4 w-4 shrink-0 text-[#9ca3af]" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="max-w-[65ch] truncate font-mono text-sm font-medium">{resource.title}</div>
                    <div className="max-w-[65ch] font-mono text-xs text-[#9ca3af]">{resource.category?.name ?? resource.type}</div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
