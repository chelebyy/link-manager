import { Folder, ArrowLeft, Layers } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import type { Category } from '../../types';

interface TypeCategoriesProps {
  typeLabel: string;
  typeColor: string;
  categories: Category[];
  onSelectCategory: (categoryId: number | null) => void;
  onBack: () => void;
}

export function TypeCategories({ 
  typeLabel, 
  typeColor, 
  categories, 
  onSelectCategory,
  onBack 
}: TypeCategoriesProps) {
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
            Kategori secin veya tumunu goruntuleyin
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card
          className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:-translate-y-1 border-2 border-dashed border-muted"
          onClick={() => onSelectCategory(null)}
        >
          <CardContent className="flex items-center gap-4 p-6">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${typeColor}20` }}
            >
              <Layers className="w-7 h-7" style={{ color: typeColor }} />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Tumu</h3>
              <p className="text-sm text-muted-foreground">
                Bu tipteki tum kaynaklar
              </p>
            </div>
          </CardContent>
        </Card>

        {categories.map((category) => (
          <Card
            key={category.id}
            className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
            onClick={() => onSelectCategory(category.id)}
          >
            <CardContent className="flex items-center gap-4 p-6">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${category.color}20` }}
              >
                <Folder className="w-7 h-7" style={{ color: category.color }} />
              </div>
              <div>
                <h3 className="font-semibold text-lg">{category.name}</h3>
                <p className="text-sm text-muted-foreground">Kategori</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
