import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { api, ApiError } from '../../lib/api';
import { queryKeys } from '../../lib/query-keys';

interface ResourceListProps {
  categoryId: number | null;
  type: string | null;
  searchQuery: string;
  onNotify?: (kind: 'success' | 'error', title: string, description?: string) => void;
}

export function ResourceList({ categoryId, type, searchQuery, onNotify }: ResourceListProps) {
  const iconMap = Icons as unknown as Record<string, LucideIcon>;
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);

  const resourcesQuery = useQuery({
    queryKey: queryKeys.resources({ categoryId, type, search: searchQuery }),
    queryFn: () => api.getResources({ categoryId, type, search: searchQuery }),
    placeholderData: keepPreviousData,
  });

  const resources = resourcesQuery.data ?? [];
  const loading = resourcesQuery.isLoading;

  useEffect(() => {
    if (resourcesQuery.error instanceof ApiError) {
      onNotify?.('error', 'Kaynaklar yüklenemedi', resourcesQuery.error.message);
    }
  }, [onNotify, resourcesQuery.error]);

  const favoriteMutation = useMutation({
    mutationFn: ({ id, next }: { id: number; next: boolean }) => api.toggleFavorite(id, next),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['resources'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteResource(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['resources'] });
      onNotify?.('success', 'Kaynak silindi');
    },
    onError: () => onNotify?.('error', 'Kaynak silinemedi'),
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: number[]) => api.reorderResources(ids),
    onSuccess: () => onNotify?.('success', 'Kaynak sırası güncellendi'),
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: ['resources'] });
      onNotify?.('error', 'Kaynak sırası güncellenemedi');
    },
  });

  const toggleFavorite = async (id: number, current: boolean) => {
    try {
      await favoriteMutation.mutateAsync({ id, next: !current });
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;

    try {
      await deleteMutation.mutateAsync(deleteId);
    } catch (error) {
      console.error('Failed to delete resource:', error);
    } finally {
      setDeleteId(null);
    }
  };

  const reorderResources = async (nextResources: ResourceWithSync[]) => {
    queryClient.setQueryData(queryKeys.resources({ categoryId, type, search: searchQuery }), nextResources);
    await reorderMutation.mutateAsync(nextResources.map((item) => item.id));
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
