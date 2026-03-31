import type { ReactNode } from 'react';
import { Folder, ArrowLeft, Layers, Search } from 'lucide-react';
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
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Geri
        </Button>
        <div>
          <h2 className="text-2xl font-bold" style={{ color: typeColor }}>
            {typeLabel}
          </h2>
          <p className="text-muted-foreground">
            Kategoriler solda, kaynaklar sagda listelenir
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="h-fit rounded-lg border bg-card shadow-sm lg:sticky lg:top-20">
          <div className="border-b px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kategoriler</p>
          </div>

          <div className="py-1">
            <button
              type="button"
              onClick={() => onSelectCategory(null)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                selectedCategory === null ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted'
              }`}
            >
              <Layers className="h-4 w-4 shrink-0" style={{ color: selectedCategory === null ? typeColor : undefined }} />
              <span className="truncate">Tümü</span>
            </button>

            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => onSelectCategory(category.id)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  selectedCategory === category.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted'
                }`}
              >
                <Folder className="h-4 w-4 shrink-0" style={{ color: category.color }} />
                <span className="truncate">{category.name}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="space-y-4 min-w-0">
          <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between shrink-0">
            <div>
              <h3 className="text-lg font-semibold">
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
                className="pl-9 h-9"
              />
            </div>
          </div>

          {children}
        </section>
      </div>
    </div>
  );
}
