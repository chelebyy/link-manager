import { Globe, Wrench, FileText, Github } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '../ui/card';
import type { ResourceType } from '../../types';

interface CategoryGridProps {
  onSelectType: (type: ResourceType) => void;
}

const typeConfig: Record<ResourceType, { icon: React.ElementType; label: string; color: string }> = {
  github: { icon: Github, label: 'GitHub Repos', color: '#333' },
  skill: { icon: Wrench, label: 'Skills', color: '#6366f1' },
  website: { icon: Globe, label: 'Websites', color: '#10b981' },
  note: { icon: FileText, label: 'Notes', color: '#f59e0b' },
};

export function CategoryGrid({ onSelectType }: CategoryGridProps) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold">Link Manager</h2>
        <p className="text-muted-foreground">
          Kaynaklarinizi organize edin ve yonetin
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
    </div>
  );
}
