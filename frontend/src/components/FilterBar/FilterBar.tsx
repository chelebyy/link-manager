import { ArrowLeft, Search } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import type { Category, ResourceType } from '../../types';

interface FilterBarProps {
  selectedCategory: number | null;
  selectedType: ResourceType | null;
  onCategoryChange: (categoryId: number | null) => void;
  onTypeChange: (type: ResourceType | null) => void;
  onSearchChange: (query: string) => void;
  categories: Category[];
}

const typeLabels: Record<ResourceType, string> = {
  github: 'GitHub',
  skill: 'Skills',
  website: 'Websites',
  note: 'Notes',
};

export function FilterBar({
  selectedCategory,
  selectedType,
  onCategoryChange,
  onTypeChange,
  onSearchChange,
  categories,
}: FilterBarProps) {
  const selectedCategoryName = selectedCategory
    ? categories.find((c) => c.id === selectedCategory)?.name
    : null;

  const clearFilters = () => {
    onCategoryChange(null);
    onTypeChange(null);
    onSearchChange('');
  };

  return (
    <div className="space-y-4 mb-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Geri
        </Button>
        <h2 className="text-xl font-semibold">
          {selectedCategoryName || (selectedType ? typeLabels[selectedType] : 'Tüm Kaynaklar')}
        </h2>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Ara..."
            className="pl-10"
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
