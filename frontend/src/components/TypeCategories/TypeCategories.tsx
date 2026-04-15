import type { ReactNode } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import type { Category } from '../../types';

interface TypeCategoriesProps {
  typeLabel: string;
  typeColor: string;
  categories: Category[];
  selectedCategory: number | null;
  searchQuery: string;
  onSelectCategory: (categoryId: number | null) => void;
  onSearchChange: (query: string) => void;
  onBack: () => void;
  children: ReactNode;
}

export function TypeCategories({
  typeLabel,
  typeColor,
  categories,
  selectedCategory,
  searchQuery,
  onSelectCategory,
  onSearchChange,
  onBack,
  children,
}: TypeCategoriesProps) {
  const selectedCategoryName = selectedCategory
    ? categories.find((category) => category.id === selectedCategory)?.name
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={onBack} aria-label="Go back">
          <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
          Geri
        </Button>
        <div>
          <h2 className="text-2xl font-bold" style={{ color: typeColor }}>
            {typeLabel}
          </h2>
          <p className="text-muted-foreground text-sm">
            Kategoriler solda, kaynaklar sagda listelenir
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="max-h-[calc(100vh-160px)] overflow-y-auto rounded-lg border bg-card lg:sticky lg:top-20">
          <div className="border-b px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kategoriler</p>
          </div>

          <div className="py-1">
            <button
              type="button"
              onClick={() => onSelectCategory(null)}
              aria-label="Select category: Tümü"
              aria-pressed={selectedCategory === null}
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors rounded-sm ${
                  selectedCategory === null
                    ? 'font-medium'
                    : 'hover:bg-background'
                }`}
            >
              <span className="truncate font-mono text-xs">Tümü</span>
            </button>

            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => onSelectCategory(category.id)}
                aria-label={`Select category: ${category.name}`}
                aria-pressed={selectedCategory === category.id}
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors rounded-sm ${
                  selectedCategory === category.id
                    ? 'font-medium'
                    : 'hover:bg-background'
                }`}
              >
                <span 
                  className="truncate font-mono text-xs" 
                  style={{ color: selectedCategory === category.id ? undefined : category.color }}
                >
                  {category.name}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="space-y-4 min-w-0">
          <div className="flex flex-col gap-4 rounded-lg border bg-card md:flex-row md:items-center md:justify-between shrink-0 px-4 py-3">
            <div>
              <h3 className="text-lg font-semibold font-mono">
                {selectedCategoryName ?? typeLabel}
              </h3>
              <p className="text-sm text-muted-foreground">
                {selectedCategoryName ? 'Seçili kategori kaynakları' : 'Tüm kaynaklar'}
              </p>
            </div>

            <div className="relative w-full md:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Ara..."
                className="pl-9 h-9 border-border/50 bg-background/50 rounded-sm font-mono text-xs"
              />
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto max-h-[120px] overflow-y-auto pb-2 scrollbar-thin">
            <button
              type="button"
              onClick={() => onSelectCategory(null)}
              aria-label="Select category: Tümü"
              aria-pressed={selectedCategory === null}
              className={`shrink-0 px-3 py-2 text-xs font-mono rounded-sm transition-colors ${
                selectedCategory === null
                  ? 'bg-muted text-foreground border border-border'
                  : 'bg-card border border-border hover:border-muted-foreground/30 text-muted-foreground'
              }`}
            >
              Tümü
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => onSelectCategory(category.id)}
                aria-label={`Select category: ${category.name}`}
                aria-pressed={selectedCategory === category.id}
                className={`shrink-0 px-3 py-2 text-xs font-mono rounded-sm transition-colors ${
                  selectedCategory === category.id
                    ? 'bg-muted text-foreground border border-border'
                    : 'bg-card border border-border hover:border-muted-foreground/30 text-muted-foreground'
                }`}
                style={{ color: selectedCategory === category.id ? undefined : category.color }}
              >
                {category.name}
              </button>
            ))}
          </div>

          {children}
        </section>
      </div>
    </div>
  );
}
