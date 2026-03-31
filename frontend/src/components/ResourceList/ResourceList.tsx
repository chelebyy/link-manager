import { useState, useEffect } from 'react';
import { Trash2, ExternalLink, Heart, Folder } from 'lucide-react';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Skeleton } from '../ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import type { ResourceWithSync } from '../../types';

interface ResourceListProps {
  categoryId: number | null;
  type: string | null;
  searchQuery: string;
}

export function ResourceList({ categoryId, type, searchQuery }: ResourceListProps) {
  const iconMap = Icons as unknown as Record<string, LucideIcon>;
  const [resources, setResources] = useState<ResourceWithSync[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  useEffect(() => {
    fetchResources();
  }, [categoryId, type, searchQuery]);

  const fetchResources = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (categoryId) params.append('category', categoryId.toString());
      if (type) params.append('type', type);
      if (searchQuery) params.append('search', searchQuery);

      const response = await fetch(`/api/resources?${params}`);
      const data = await response.json();
      setResources(data);
    } catch (error) {
      console.error('Failed to fetch resources:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = async (id: number, current: boolean) => {
    try {
      await fetch(`/api/resources/${id}/favorite`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_favorite: !current }),
      });
      fetchResources();
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    
    try {
      await fetch(`/api/resources/${deleteId}`, { method: 'DELETE' });
      fetchResources();
    } catch (error) {
      console.error('Failed to delete resource:', error);
    } finally {
      setDeleteId(null);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-5 w-3/4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (resources.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-muted-foreground mb-2">Henüz kaynak eklenmemiş.</div>
        <div className="text-sm text-muted-foreground/60">
          Yeni bir kaynak eklemek için "Ekle" butonunu kullanın.
        </div>
      </div>
    );
  }

  const getIcon = (iconName: string) => {
    return iconMap[iconName] ?? Folder;
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
        {resources.map((resource) => {
          const Icon = getIcon(resource.type);

          return (
            <Card key={resource.id} className="group hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <CardTitle className="text-base truncate">{resource.title}</CardTitle>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => toggleFavorite(resource.id, resource.is_favorite)}
                    >
                      <Heart
                        className={`h-4 w-4 ${resource.is_favorite ? 'fill-red-500 text-red-500' : ''}`}
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => setDeleteId(resource.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {resource.category && (
                  <Badge style={{ backgroundColor: resource.category.color }} className="mt-1">
                    {resource.category.name}
                  </Badge>
                )}
              </CardHeader>
              <CardContent>
                {resource.description && (
                  <CardDescription className="mb-3 line-clamp-2">{resource.description}</CardDescription>
                )}
                {resource.url && (
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Ziyaret Et
                  </a>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kaynağı Sil</AlertDialogTitle>
            <AlertDialogDescription>
              Bu kaynağı silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
