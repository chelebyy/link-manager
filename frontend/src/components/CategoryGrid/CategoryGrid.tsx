import { Card, CardHeader, CardDescription } from '../ui/card';
import type { ResourceTypeDefinition } from '../../types';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface CategoryGridProps {
  resourceTypes: ResourceTypeDefinition[];
  isLoading?: boolean;
  onSelectType: (typeId: string) => void;
  selectedTypeId?: string;
}

export function CategoryGrid({ resourceTypes, isLoading, onSelectType, selectedTypeId }: CategoryGridProps) {
  const iconMap = Icons as unknown as Record<string, LucideIcon>;

  if (isLoading) {
    return (
      <div className="space-y-10">
        <div className="text-center space-y-3">
          <h2 className="text-3xl font-bold font-mono tracking-tight">Link Manager</h2>
          <p className="text-muted-foreground font-sans text-sm">
            Kaynaklarinizi organize edin ve yonetin
          </p>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 w-24 bg-muted animate-pulse rounded-md" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Card key={i} className="border-[#d1d5db] rounded-sm bg-background">
              <CardHeader className="pb-3">
                <div className="w-10 h-10 rounded bg-muted animate-pulse mb-3" />
                <div className="h-5 w-24 bg-muted animate-pulse rounded" />
                <div className="h-4 w-32 bg-muted animate-pulse rounded mt-2" />
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="text-center space-y-3">
        <h2 className="text-3xl font-bold font-mono tracking-tight">Link Manager</h2>
        <p className="text-muted-foreground font-sans text-sm">
          Kaynaklarinizi organize edin ve yonetin
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide" role="group" aria-label="Filter categories">
        {resourceTypes.map((type) => {
          const isActive = selectedTypeId === type.id;
          return (
            <button
              key={type.id}
              onClick={() => onSelectType(type.id)}
              aria-label={`Filter by ${type.name}`}
              aria-pressed={isActive}
              className={`
                px-4 py-2 rounded-md text-sm font-sans whitespace-nowrap transition-colors duration-200
                border
                ${isActive 
                  ? 'bg-[#58a6ff] text-white border-[#58a6ff]' 
                  : 'bg-transparent text-foreground border-[#d1d5db] hover:border-[#58a6ff] hover:text-[#58a6ff]'
                }
              `}
            >
              {type.name}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5" role="list">
        {resourceTypes.map((type) => {
          const IconComponent = iconMap[type.icon] ?? Icons.Folder;

          return (
            <Card
              key={type.id}
              className="cursor-pointer border-[#d1d5db] rounded-sm transition-all duration-200 hover:border-[#58a6ff] bg-background"
              onClick={() => onSelectType(type.id)}
              role="listitem"
            >
              <CardHeader className="pb-3">
                <div
                  className="w-10 h-10 rounded flex items-center justify-center mb-3"
                  style={{ backgroundColor: `${type.color}15` }}
                >
                  <IconComponent className="w-5 h-5" style={{ color: type.color }} aria-hidden="true" />
                </div>
                <h3 className="font-mono text-base font-semibold tracking-tight">{type.name}</h3>
                <CardDescription className="font-sans text-xs">
                  {type.description || 'No description available'}
                </CardDescription>
              </CardHeader>
            </Card>
          );
        })}
      </div>
    </div>
  );
}