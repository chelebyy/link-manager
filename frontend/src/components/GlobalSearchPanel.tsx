import { Search, Layers, Folder } from 'lucide-react';
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
}

export function GlobalSearchPanel({ query, onQueryChange, categories, resourceTypes, resources, onOpenType, onOpenCategory }: GlobalSearchPanelProps) {
  const normalized = query.trim().toLowerCase();

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
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => onQueryChange(event.target.value)} className="h-11 pl-10" placeholder="Kart, kategori veya kaynak ara..." />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <div className="relative max-w-2xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(event) => onQueryChange(event.target.value)} className="h-11 pl-10" placeholder="Kart, kategori veya kaynak ara..." />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kart Sonuçları</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {matchingTypes.length === 0 ? <div className="text-sm text-muted-foreground">Eşleşen kart yok.</div> : null}
            {matchingTypes.map((type) => (
              <button key={type.id} type="button" className="flex w-full items-center justify-between rounded-md border p-3 text-left transition hover:bg-muted" onClick={() => onOpenType(type.id)}>
                <div>
                  <div className="font-medium">{type.name}</div>
                  {type.description ? <div className="text-xs text-muted-foreground">{type.description}</div> : null}
                </div>
                <Badge variant="secondary" className="gap-1">
                  <Layers className="h-3 w-3" />
                  {type.resource_count ?? 0}
                </Badge>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kategori Sonuçları</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {matchingCategories.length === 0 ? <div className="text-sm text-muted-foreground">Eşleşen kategori yok.</div> : null}
            {matchingCategories.map((category) => (
              <button key={category.id} type="button" className="flex w-full items-center justify-between rounded-md border p-3 text-left transition hover:bg-muted" onClick={() => onOpenCategory(category.type, category.id)}>
                <div>
                  <div className="font-medium">{category.name}</div>
                  <div className="text-xs text-muted-foreground">{category.type}</div>
                </div>
                <Badge variant="secondary" className="gap-1">
                  <Folder className="h-3 w-3" />
                  kategori
                </Badge>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kaynak Sonuçları</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {resources.length === 0 ? <div className="text-sm text-muted-foreground">Eşleşen kaynak yok.</div> : null}
            {resources.slice(0, 8).map((resource) => (
              <button key={resource.id} type="button" className="flex w-full items-start gap-3 rounded-md border p-3 text-left transition hover:bg-muted" onClick={() => onOpenType(resource.type)}>
                <Folder className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{resource.title}</div>
                  <div className="text-xs text-muted-foreground">{resource.category?.name ?? resource.type}</div>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
