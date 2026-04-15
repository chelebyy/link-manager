import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Folder, GripVertical, Edit2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import type { Category } from '../../types';
import { api, ApiError } from '../../lib/api';
import { queryKeys } from '../../lib/query-keys';

const presetColors = [
  '#58a6ff', '#10b981', '#f59e0b', '#ef4444', '#9ecbff',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#64748b'
];

interface CategoryManagerProps {
  open: boolean;
  selectedType: string | null;
  onNotify?: (kind: 'success' | 'error', title: string, description?: string) => void;
  onClose: () => void;
}

export function CategoryManager({ open, selectedType, onNotify, onClose }: CategoryManagerProps) {
  const queryClient = useQueryClient();
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [managedType, setManagedType] = useState<string>(selectedType ?? 'website');
  const [loading, setLoading] = useState(false);
  const [colorInput, setColorInput] = useState(presetColors[0]);
  const [error, setError] = useState('');
  const [draggedId, setDraggedId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (selectedType) {
      setManagedType(selectedType);
    }
  }, [open, selectedType]);

  const resourceTypesQuery = useQuery({
    queryKey: queryKeys.resourceTypes(),
    queryFn: api.getResourceTypes,
    enabled: open,
  });

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories(managedType),
    queryFn: () => api.getCategories(managedType),
    enabled: open && !!managedType,
  });

  const resourceTypes = resourceTypesQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];

  useEffect(() => {
    if (!selectedType && resourceTypes.length > 0) {
      setManagedType(resourceTypes[0].id);
    }
  }, [selectedType, resourceTypes]);

  useEffect(() => {
    const error = resourceTypesQuery.error || categoriesQuery.error;
    if (error instanceof ApiError) {
      onNotify?.('error', 'Veri yüklenemedi', error.message);
    }
  }, [categoriesQuery.error, onNotify, resourceTypesQuery.error]);

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; type: string; color: string; icon: string }) => api.createCategory(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.categories(managedType) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.categories() });
      onNotify?.('success', 'Kategori eklendi');
    },
    onError: (error) => {
      const message = error instanceof ApiError ? error.message : 'Kategori eklenemedi.';
      setError(message);
      onNotify?.('error', 'Kategori eklenemedi', message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { name: string; color: string; icon: string } }) => api.updateCategory(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.categories(managedType) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.categories() });
      onNotify?.('success', 'Kategori güncellendi');
    },
    onError: (error) => {
      const message = error instanceof ApiError ? error.message : 'Kategori güncellenemedi.';
      setError(message);
      onNotify?.('error', 'Kategori güncellenemedi', message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteCategory(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.categories(managedType) });
      await queryClient.invalidateQueries({ queryKey: ['resources'] });
      onNotify?.('success', 'Kategori silindi');
    },
    onError: () => onNotify?.('error', 'Kategori silinemedi'),
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: number[]) => api.reorderCategories(ids),
    onSuccess: () => onNotify?.('success', 'Kategori sırası güncellendi'),
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.categories(managedType) });
      onNotify?.('error', 'Kategori sırası güncellenemedi');
    },
  });

  const createCategory = async () => {
    if (!newCategoryName.trim()) {
      setError('Kategori adı zorunludur.');
      return;
    }

    if (!/^#[0-9A-Fa-f]{6}$/.test(colorInput)) {
      setError('Geçerli bir hex renk girin.');
      return;
    }

    setLoading(true);
    try {
      if (editingCategory) {
        await updateMutation.mutateAsync({
          id: editingCategory.id,
          payload: {
            name: newCategoryName,
            color: colorInput,
            icon: 'Folder',
          },
        });
      } else {
        await createMutation.mutateAsync({
          name: newCategoryName,
          color: colorInput,
          icon: 'Folder',
          type: managedType,
        });
      }

      setNewCategoryName('');
      setEditingCategory(null);
      setError('');
    } catch (error) {
      console.error('Failed to create category:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteCategory = async (id: number) => {
    if (!confirm('Bu kategoriyi silmek istediğinize emin misiniz?')) return;

    try {
      await deleteMutation.mutateAsync(id);
    } catch (error) {
      console.error('Failed to delete category:', error);
    }
  };

  const startEditCategory = (category: Category) => {
    setEditingCategory(category);
    setNewCategoryName(category.name);
    setColorInput(category.color);
    setError('');
  };

  const cancelEditCategory = () => {
    setEditingCategory(null);
    setNewCategoryName('');
    setColorInput(presetColors[0]);
    setError('');
  };

  const reorderCategories = async (nextCategories: Category[]) => {
    queryClient.setQueryData(queryKeys.categories(managedType), nextCategories);
    await reorderMutation.mutateAsync(nextCategories.map((item) => item.id));
  };

  const handleDrop = async (targetId: number) => {
    if (draggedId === null || draggedId === targetId) return;

    const next = [...categories];
    const fromIndex = next.findIndex((item) => item.id === draggedId);
    const toIndex = next.findIndex((item) => item.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setDraggedId(null);
    await reorderCategories(next);
  };

  const getTypeName = (typeId: string) => {
    return resourceTypes.find(t => t.id === typeId)?.name || typeId;
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Kategorileri Yönet</DialogTitle>
          <DialogDescription>
            Kartlar için kategoriler ekleyin veya silin.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="category-type">Kart</Label>
            <Select value={managedType} onValueChange={setManagedType}>
              <SelectTrigger id="category-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {resourceTypes.map((rt) => (
                  <SelectItem key={rt.id} value={rt.id}>
                    {rt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category-name">{editingCategory ? 'Kategoriyi Düzenle' : 'Yeni Kategori'}</Label>
            <div className="flex gap-2">
              <Input
                id="category-name"
                placeholder="Kategori adı"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createCategory()}
                autoComplete="off"
                disabled={isSubmitting}
              />
              <Button 
                onClick={createCategory} 
                disabled={isSubmitting || loading || !newCategoryName.trim()}
                aria-label={editingCategory ? 'Kaydet' : 'Yeni kategori ekle'}
              >
                {editingCategory ? 'Kaydet' : <Plus className="h-4 w-4" />}
              </Button>
              {editingCategory ? <Button variant="outline" onClick={cancelEditCategory}>İptal</Button> : null}
            </div>

            <div className="flex gap-2 flex-wrap">
              {presetColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`w-6 h-6 rounded-full border-2 ${
                    colorInput === color ? 'border-foreground' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => {
                    setColorInput(color);
                  }}
                  aria-label={`Renk seç: ${color}`}
                />
              ))}
            </div>
            <Label htmlFor="category-color" className="sr-only">Renk kodu</Label>
            <Input 
              id="category-color" 
              value={colorInput} 
              onChange={(e) => setColorInput(e.target.value)} 
              placeholder="#58a6ff" 
              autoComplete="off"
              disabled={isSubmitting}
            />
            {error ? (
              <p id="category-error" className="text-xs text-destructive" aria-live="polite">{error}</p>
            ) : null}
          </div>

          <div className="border-t pt-4">
            <Label>{getTypeName(managedType)} kategorileri</Label>
            <div className="space-y-1 mt-2 max-h-[300px] overflow-y-auto">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 group"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="font-mono text-xs"
                      style={{ color: category.color }}
                    >
                      {category.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => startEditCategory(category)}
                      aria-label={`${category.name} kategorisini düzenle`}
                      disabled={deleteMutation.isPending}
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={() => deleteCategory(category.id)}
                      aria-label={`${category.name} kategorisini sil`}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
