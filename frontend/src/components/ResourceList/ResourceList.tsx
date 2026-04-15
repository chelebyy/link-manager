import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, ExternalLink, Heart, Folder, GripVertical, Edit2 } from 'lucide-react';
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
import { AddResourceDialog } from '../AddResourceDialog/AddResourceDialog';

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
  const [editingResource, setEditingResource] = useState<ResourceWithSync | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories(type ?? undefined),
    queryFn: () => api.getCategories(type ?? undefined),
    enabled: !!type,
  });

  const resourceTypesQuery = useQuery({
    queryKey: queryKeys.resourceTypes(),
    queryFn: api.getResourceTypes,
  });

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
      <div className="space-y-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-sm border px-3 py-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-4" />
            <div className="flex-1"><Skeleton className="h-4 w-3/4" /></div>
          </div>
        ))}
      </div>
    );
  }

  if (resources.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Henüz kaynak eklenmemiş. Yeni bir kaynak eklemek için "Ekle" butonunu kullanın.
      </div>
    );
  }

  const getIcon = (iconName: string) => iconMap[iconName] ?? Folder;

  return (
    <>
      <div className="space-y-1">
        {resources.map((resource) => {
          const Icon = getIcon(resource.type);

          return (
            <div
              key={resource.id}
              draggable
              onDragStart={() => setDraggedId(resource.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => void handleDrop(resource.id)}
              onClick={() => setExpandedId(expandedId === resource.id ? null : resource.id)}
              className="group flex items-center gap-3 rounded-sm border border-transparent hover:border-border hover:bg-muted/30 px-3 py-2 cursor-pointer transition-all"
            >
              <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab" />
              
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{resource.title}</span>
                  {resource.category ? (
                    <span 
                      className="text-[10px] px-1.5 py-0.5 rounded-sm font-mono shrink-0"
                      style={{ backgroundColor: `${resource.category.color}20`, color: resource.category.color }}
                    >
                      {resource.category.name}
                    </span>
                  ) : null}
                </div>
                
                {resource.description ? (
                  expandedId === resource.id ? (
                    <p className="text-xs text-muted-foreground mt-0.5">{resource.description}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground truncate">{resource.description}</p>
                  )
                ) : null}
              </div>
              
              <div className="flex items-center gap-2 shrink-0">
                {resource.url ? (
                  <a 
                    href={resource.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
                
                <Button 
                  aria-label={resource.is_favorite ? 'Favoriden çıkar' : 'Favoriye ekle'} 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 opacity-0 group-hover:opacity-100" 
                  onClick={(e) => { e.stopPropagation(); void toggleFavorite(resource.id, resource.is_favorite); }}
                >
                  <Heart className={`h-4 w-4 ${resource.is_favorite ? 'fill-red-500 text-red-500' : ''}`} />
                </Button>
                
                <Button 
                  aria-label="Kaynağı düzenle" 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 opacity-0 group-hover:opacity-100" 
                  onClick={(e) => { e.stopPropagation(); setEditingResource(resource); }}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                
                <Button 
                  aria-label="Kaynağı sil" 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive" 
                  onClick={(e) => { e.stopPropagation(); setDeleteId(resource.id); }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
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

      <AddResourceDialog
        open={editingResource !== null}
        onClose={() => setEditingResource(null)}
        onNotify={onNotify}
        onSuccess={() => setEditingResource(null)}
        categories={categoriesQuery.data ?? []}
        selectedType={type}
        resourceTypes={resourceTypesQuery.data ?? []}
        initialResource={editingResource ? {
          id: editingResource.id,
          type: editingResource.type,
          title: editingResource.title,
          url: editingResource.url,
          description: editingResource.description,
          category_id: editingResource.category_id,
        } : null}
      />
    </>
  );
}
