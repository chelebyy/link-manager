import { useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, Search, ChevronDown } from 'lucide-react';
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
  const [isOpen, setIsOpen] = useState(false);
  const selectedCategoryName = selectedCategory
    ? categories.find((category) => category.id === selectedCategory)?.name
    : null;

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={onBack} aria-label="Go back">
          <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
          Geri
        </Button>
        <div>
          <h2 className="text-xl lg:text-2xl font-bold" style={{ color: typeColor }}>
            {typeLabel}
          </h2>
          <p className="text-muted-foreground text-xs lg:text-sm hidden sm:block">
            Kategoriler solda, kaynaklar sagda listelenir
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
        <details open={isOpen} className="lg:hidden rounded-lg border bg-card">
          <summary
            className="flex items-center justify-between px-3 py-2 cursor-pointer list-none select-none"
            onClick={(e) => {
              e.preventDefault();
              setIsOpen(!isOpen);
            }}
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kategoriler</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 open:rotate-180" />
          </summary>
          <div className="border-t py-1">
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
        </details>

        <aside className="hidden lg:block shrink-0 w-64 max-h-[calc(100vh-160px)] overflow-y-auto rounded-lg border bg-card sticky top-20">
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

        <section className="flex-1 min-w-0 space-y-4">
          <div className="flex flex-col gap-4 rounded-lg border bg-card lg:bg-transparent lg:border-0 lg:p-0 px-4 py-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold font-mono">
                  {selectedCategoryName ?? typeLabel}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {selectedCategoryName ? 'Seçili kategori kaynakları' : 'Tüm kaynaklar'}
                </p>
              </div>

              <div className="relative w-full lg:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder="Ara..."
                  className="pl-9 h-9 border-border/50 bg-background/50 rounded-sm font-mono text-xs"
                />
              </div>
            </div>
          </div>

          {children}
        </section>
      </div>
    </div>
  );
}
