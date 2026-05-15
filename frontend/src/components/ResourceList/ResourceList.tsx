import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, ExternalLink, Star, GripVertical, Edit2, ChevronRight, Copy, Download, Square, CheckSquare } from 'lucide-react';
import { Button } from '../ui/button';
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
import { getIcon } from '../../lib/icon-map';
import { queryKeys } from '../../lib/query-keys';
import { AddResourceDialog } from '../AddResourceDialog/AddResourceDialog';
import {
  buildExportFilename,
  buildSelectedViewMarkdown,
  downloadMarkdown,
  filterResourcesByMode,
  sortResourcesForView,
  type ResourceFilterMode,
} from '../../lib/resource-view';

interface ResourceListProps {
  categoryId: number | null;
  type: string | null;
  searchQuery: string;
  resourceFilterMode: ResourceFilterMode;
  onVisibleResourcesChange?: (resources: ResourceWithSync[]) => void;
  onNotify?: (kind: 'success' | 'error', title: string, description?: string) => void;
  isSelectionMode?: boolean;
  onToggleSelectionMode?: () => void;
  onSelectionChange?: (ids: Set<number>) => void;
}

export function ResourceList({ categoryId, type, searchQuery, resourceFilterMode, onVisibleResourcesChange, onNotify, isSelectionMode: externalIsSelectionMode, onToggleSelectionMode, onSelectionChange }: ResourceListProps) {
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [editingResource, setEditingResource] = useState<ResourceWithSync | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<number>>(new Set());

  const isSelectionMode = externalIsSelectionMode ?? false;
  const selectedIds = internalSelectedIds;

  useEffect(() => {
    onSelectionChange?.(selectedIds);
  }, [onSelectionChange, selectedIds]);

  useEffect(() => {
    if (externalIsSelectionMode === false && selectedIds.size > 0) {
      setInternalSelectedIds(new Set());
    }
  }, [externalIsSelectionMode, selectedIds]);

  const toggleSelection = (id: number) => {
    setInternalSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === visibleResources.length) {
      setInternalSelectedIds(new Set());
    } else {
      setInternalSelectedIds(new Set(visibleResources.map((r) => r.id)));
    }
  };

  const downloadSelected = () => {
    const selected = visibleResources.filter((r) => selectedIds.has(r.id));
    const typeLabel = resourceTypesQuery.data?.find((resourceType) => resourceType.id === type)?.name ?? type ?? 'Kaynaklar';
    const selectedCategoryName = categoryId
      ? categoriesQuery.data?.find((category) => category.id === categoryId)?.name ?? null
      : null;

    const markdown = buildSelectedViewMarkdown({
      typeLabel,
      selectedCategoryName,
      searchQuery,
      filterMode: resourceFilterMode,
      resources: selected,
    });

    downloadMarkdown(buildExportFilename(`link-manager-${type ?? 'resources'}-secili`), markdown);

    onNotify?.('success', 'Seçili kaynaklar indirildi');
    setInternalSelectedIds(new Set());
    onToggleSelectionMode?.();
  };

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
  const sortedResources = useMemo(() => sortResourcesForView(resources), [resources]);
  const visibleResources = useMemo(() => filterResourcesByMode(sortedResources, resourceFilterMode), [sortedResources, resourceFilterMode]);
  const canReorderResources = resourceFilterMode === 'all';
  const loading = resourcesQuery.isLoading;

  useEffect(() => {
    onVisibleResourcesChange?.(visibleResources);
  }, [onVisibleResourcesChange, visibleResources.length]);

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

  const toggleFavorite = (id: number, current: boolean) => {
    favoriteMutation.mutate({ id, next: !current });
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
    if (!canReorderResources) {
      onNotify?.('error', 'Sadece önemli filtresinde sıralama kapalı');
      return;
    }

    if (draggedId === null || draggedId === targetId) return;

    const draggedResource = visibleResources.find((item) => item.id === draggedId);
    const targetResource = visibleResources.find((item) => item.id === targetId);
    if (!draggedResource || !targetResource) return;

    if (draggedResource.is_favorite !== targetResource.is_favorite) {
      onNotify?.('error', 'Önemli ve normal kayıtlar birlikte taşınamaz');
      return;
    }

    const next = [...visibleResources];
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
          <div key={`resource-skeleton-${i}`} className="flex items-center gap-3 rounded-sm border px-3 py-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-4" />
            <div className="flex-1"><Skeleton className="h-4 w-3/4" /></div>
          </div>
        ))}
      </div>
    );
  }

  if (visibleResources.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        {resourceFilterMode === 'important'
          ? 'Henüz önemli olarak işaretlenmiş kayıt yok.'
          : 'Henüz kaynak eklenmemiş. Yeni bir kaynak eklemek için "Ekle" butonunu kullanın.'}
      </div>
    );
  }

  return (
    <>
      {isSelectionMode && (
        <div className="flex items-center justify-between mb-3 p-2 bg-muted/30 rounded-sm border border-border">
          <div className="flex items-center gap-2">
            <button onClick={toggleSelectAll} className="p-1 hover:bg-accent rounded" title="Tümünü seç">
              {selectedIds.size === visibleResources.length ? (
                <CheckSquare className="h-4 w-4 text-primary" />
              ) : (
                <Square className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            <span className="text-sm text-muted-foreground">{selectedIds.size} seçili</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setInternalSelectedIds(new Set()); onToggleSelectionMode?.(); }}
            >
              İptal
            </Button>
            <Button size="sm" onClick={downloadSelected} disabled={selectedIds.size === 0}>
              <Download className="h-4 w-4 mr-1" />
              İndir
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {visibleResources.map((resource) => {
          const Icon = getIcon(resource.type);
          const isSelected = selectedIds.has(resource.id);

          return (
            <div
              key={resource.id}
              draggable={canReorderResources && !reorderMutation.isPending}
              onDragStart={() => setDraggedId(resource.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => void handleDrop(resource.id)}
              onClick={() => isSelectionMode ? toggleSelection(resource.id) : setExpandedId(expandedId === resource.id ? null : resource.id)}
              className={`group flex items-center gap-3 rounded-sm border border-transparent hover:border-border hover:bg-muted/30 px-3 py-2 cursor-pointer transition-all touch-manipulation ${isSelectionMode ? 'cursor-pointer' : ''}`}
            >
              {isSelectionMode ? (
                <div className="flex items-center justify-center w-5 h-5">
                  <div className={`w-4 h-4 border rounded flex items-center justify-center ${isSelected ? 'bg-primary border-primary' : 'border-border'}`}>
                    {isSelected && <CheckSquare className="h-3 w-3 text-primary-foreground" />}
                  </div>
                </div>
              ) : (
                <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground cursor-grab" />
              )}
              
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{resource.title}</span>
                  {resource.is_favorite ? <Star className="h-3.5 w-3.5 fill-red-500 text-red-500 shrink-0" /> : null}
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
                    <div className="flex items-start gap-2 mt-0.5">
                      <p className="text-xs text-muted-foreground flex-1">{resource.description}</p>
                      <button
                        onClick={(e) => { e.stopPropagation(); void navigator.clipboard?.writeText(resource.description ?? '').catch(console.error); }}
                        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1 hover:bg-accent rounded transition-opacity"
                        title="Açıklamayı kopyala"
                      >
                        <Copy className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground truncate flex-1">{resource.description}</p>
                      <button
                        onClick={(e) => { e.stopPropagation(); void navigator.clipboard?.writeText(resource.description ?? '').catch(console.error); }}
                        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1 hover:bg-accent rounded transition-opacity shrink-0"
                        title="Açıklamayı kopyala"
                      >
                        <Copy className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  )
                ) : null}
              </div>
              
              <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${expandedId === resource.id ? 'rotate-90' : ''}`} />
              
              <div className="flex items-center gap-2 shrink-0">
                {resource.url ? (
                  <a 
                    href={resource.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center justify-center min-h-[44px] min-w-[44px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ) : null}
                
                <Button 
                  aria-label={resource.is_favorite ? 'Önemli işaretini kaldır' : 'Önemli olarak işaretle'} 
                  variant="ghost" 
                  size="icon" 
                  className="h-9 w-9 opacity-100 sm:opacity-0 sm:group-hover:opacity-100" 
                  onClick={(e) => { e.stopPropagation(); void toggleFavorite(resource.id, resource.is_favorite); }}
                >
                  <Star className={`h-4 w-4 ${resource.is_favorite ? 'fill-red-500 text-red-500' : ''}`} />
                </Button>
                
                <Button 
                  aria-label="Kaynağı düzenle" 
                  variant="ghost" 
                  size="icon" 
                  className="h-9 w-9 opacity-100 sm:opacity-0 sm:group-hover:opacity-100" 
                  onClick={(e) => { e.stopPropagation(); setEditingResource(resource); }}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                
                <Button 
                  aria-label="Kaynağı sil" 
                  variant="ghost" 
                  size="icon" 
                  className="h-9 w-9 text-destructive opacity-100 sm:opacity-0 sm:group-hover:opacity-100" 
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
