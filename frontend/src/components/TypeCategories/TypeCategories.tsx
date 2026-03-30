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

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="h-fit rounded-2xl border bg-card p-4 shadow-sm lg:sticky lg:top-20">
          <div className="mb-4">
            <p className="text-sm font-medium text-muted-foreground">Kategoriler</p>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => onSelectCategory(null)}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                selectedCategory === null ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted'
              }`}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${typeColor}20` }}
              >
                <Layers className="h-5 w-5" style={{ color: typeColor }} />
              </div>
              <div className="min-w-0">
                <div className="font-medium">Tümü</div>
                <div className="text-sm text-muted-foreground">Bu karttaki tüm kaynaklar</div>
              </div>
            </button>

            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => onSelectCategory(category.id)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                  selectedCategory === category.id ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted'
                }`}
              >
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${category.color}20` }}
                >
                  <Folder className="h-5 w-5" style={{ color: category.color }} />
                </div>
                <div className="min-w-0">
                  <div className="truncate font-medium">{category.name}</div>
                  <div className="text-sm text-muted-foreground">Kategori</div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="space-y-4">
          <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-xl font-semibold">
                {selectedCategoryName ?? typeLabel}
              </h3>
              <p className="text-sm text-muted-foreground">
                {selectedCategoryName ? 'Seçili kategori kaynakları' : 'Bu karttaki tüm kaynaklar'}
              </p>
            </div>

            <div className="relative w-full md:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Ara..."
                className="pl-10"
              />
            </div>
          </div>

          {children}
        </section>
      </div>
    </div>
  );
}
