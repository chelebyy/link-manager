import { Card, CardHeader, CardTitle } from '../ui/card';
import type { ResourceTypeDefinition } from '../../types';
import * as Icons from 'lucide-react';

interface CategoryGridProps {
  resourceTypes: ResourceTypeDefinition[];
  onSelectType: (typeId: string) => void;
}

export function CategoryGrid({ resourceTypes, onSelectType }: CategoryGridProps) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold">Link Manager</h2>
        <p className="text-muted-foreground">
          Kaynaklarinizi organize edin ve yonetin
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {resourceTypes.map((type) => {
          const IconComponent = (Icons as Record<string, React.ComponentType<{ className?: string }>>)[type.icon] || Icons.Folder;

          return (
            <Card
              key={type.id}
              className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
              onClick={() => onSelectType(type.id)}
            >
              <CardHeader className="pb-2">
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center mb-2"
                  style={{ backgroundColor: `${type.color}20` }}
                >
                  <IconComponent className="w-6 h-6" style={{ color: type.color }} />
                </div>
                <CardTitle className="text-lg">{type.name}</CardTitle>
              </CardHeader>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
