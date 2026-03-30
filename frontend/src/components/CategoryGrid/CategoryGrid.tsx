import { Folder, Globe, Wrench, FileText, Github } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import type { Category, ResourceType } from '../../types';

interface CategoryGridProps {
  onSelectCategory: (categoryId: number | null) => void;
  onSelectType: (type: ResourceType | null) => void;
  categories: Category[];
}

const typeConfig: Record<ResourceType, { icon: React.ElementType; label: string; color: string }> = {
  github: { icon: Github, label: 'GitHub Repos', color: '#333' },
  skill: { icon: Wrench, label: 'Skills', color: '#6366f1' },
  website: { icon: Globe, label: 'Websites', color: '#10b981' },
  note: { icon: FileText, label: 'Notes', color: '#f59e0b' },
};

export function CategoryGrid({ onSelectCategory, onSelectType, categories }: CategoryGridProps) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold">Link Manager</h2>
        <p className="text-muted-foreground">
          Kaynaklarınızı organize edin ve yönetin
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {(Object.keys(typeConfig) as ResourceType[]).map((type) => {
          const config = typeConfig[type];
          const Icon = config.icon;
          
          return (
            <Card
              key={type}
              className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
              onClick={() => onSelectType(type)}
            >
              <CardHeader className="pb-2">
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center mb-2"
                  style={{ backgroundColor: `${config.color}20` }}
                >
                  <Icon className="w-6 h-6" style={{ color: config.color }} />
                </div>
                <CardTitle className="text-lg">{config.label}</CardTitle>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      {categories.length > 0 && (
        <>
          <div className="border-t pt-8">
            <h3 className="text-xl font-semibold mb-4">Kategoriler</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map((category) => (
                <Card
                  key={category.id}
                  className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
                  onClick={() => onSelectCategory(category.id)}
                >
                  <CardContent className="flex items-center gap-3 p-4">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${category.color}20` }}
                    >
                      <Folder className="w-5 h-5" style={{ color: category.color }} />
                    </div>
                    <span className="font-medium">{category.name}</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
