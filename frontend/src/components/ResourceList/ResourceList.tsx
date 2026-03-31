import { useEffect, useState } from 'react';
import { Trash2, ExternalLink, Heart, Folder, GripVertical } from 'lucide-react';
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
  onNotify?: (kind: 'success' | 'error', title: string, description?: string) => void;
}

export function ResourceList({ categoryId, type, searchQuery, onNotify }: ResourceListProps) {
  const iconMap = Icons as unknown as Record<string, LucideIcon>;
  const [resources, setResources] = useState<ResourceWithSync[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);

  useEffect(() => {
    void fetchResources();
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
      setResources(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch resources:', error);
      setResources([]);
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
      await fetchResources();
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;

    try {
      await fetch(`/api/resources/${deleteId}`, { method: 'DELETE' });
      await fetchResources();
      onNotify?.('success', 'Kaynak silindi');
    } catch (error) {
      console.error('Failed to delete resource:', error);
      onNotify?.('error', 'Kaynak silinemedi');
    } finally {
      setDeleteId(null);
    }
  };

  const reorderResources = async (nextResources: ResourceWithSync[]) => {
    setResources(nextResources);
    const response = await fetch('/api/resources/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: nextResources.map((item) => item.id) }),
    });

    if (!response.ok) {
      await fetchResources();
      onNotify?.('error', 'Kaynak sırası güncellenemedi');
      return;
    }

    onNotify?.('success', 'Kaynak sırası güncellendi');
  };

  const handleDrop = async (targetId: number) => {
    if (draggedId === null || draggedId === targetId) return;

    const next = [...resources];
    const fromIndex = next.findIndex((item) => item.id === draggedId);
    const toIndex = next.findIndex((item) => item.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setDraggedId(null);
    await reorderResources(next);
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2"><Skeleton className="h-5 w-3/4" /></CardHeader>
            <CardContent><Skeleton className="mb-2 h-4 w-full" /><Skeleton className="h-4 w-2/3" /></CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (resources.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="mb-2 text-muted-foreground">Henüz kaynak eklenmemiş.</div>
        <div className="text-sm text-muted-foreground/60">Yeni bir kaynak eklemek için "Ekle" butonunu kullanın.</div>
      </div>
    );
  }

  const getIcon = (iconName: string) => iconMap[iconName] ?? Folder;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-2 lg:grid-cols-3">
        {resources.map((resource) => {
          const Icon = getIcon(resource.type);

          return (
            <Card
              key={resource.id}
              draggable
              onDragStart={() => setDraggedId(resource.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => void handleDrop(resource.id)}
              className="group transition-shadow hover:shadow-md"
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <CardTitle className="truncate text-base">{resource.title}</CardTitle>
                  </div>
                  <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void toggleFavorite(resource.id, resource.is_favorite)}>
                      <Heart className={`h-4 w-4 ${resource.is_favorite ? 'fill-red-500 text-red-500' : ''}`} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(resource.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {resource.category ? <Badge style={{ backgroundColor: resource.category.color }} className="mt-1">{resource.category.name}</Badge> : null}
              </CardHeader>
              <CardContent>
                {resource.description ? <CardDescription className="mb-3 line-clamp-2">{resource.description}</CardDescription> : null}
                {resource.url ? (
                  <a href={resource.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                    <ExternalLink className="h-3 w-3" />
                    Ziyaret Et
                  </a>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kaynağı Sil</AlertDialogTitle>
            <AlertDialogDescription>Bu kaynağı silmek istediğinize emin misiniz? Bu işlem geri alınamaz.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
