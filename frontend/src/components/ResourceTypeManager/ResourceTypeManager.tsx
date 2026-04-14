import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Trash2, Edit2, Palette, GripVertical, Loader2 } from 'lucide-react';
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
import type { ResourceTypeDefinition } from '../../types';
import { api, ApiError } from '../../lib/api';
import { queryKeys } from '../../lib/query-keys';

const PRESET_COLORS = [
  '#58a6ff', '#10b981', '#f59e0b', '#ef4444', '#9ecbff',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#64748b',
  '#1e293b', '#032f62', '#db2777', '#059669', '#dc2626'
];

const AVAILABLE_ICONS = [
  'Github', 'Globe', 'Wrench', 'FileText', 'Folder',
  'Star', 'Heart', 'Bookmark', 'Tag', 'Zap',
  'Code', 'Terminal', 'Database', 'Cloud', 'Server',
  'Layout', 'Image', 'Video', 'Music', 'Mail',
  'Calendar', 'Clock', 'Map', 'Phone', 'Link',
  'Book', 'Briefcase', 'Coffee', 'Cpu', 'Layers',
  'Box', 'Home', 'User', 'Users', 'Settings',
  'Search', 'Filter', 'Bell', 'Flag', 'Shield'
];

interface ResourceTypeManagerProps {
  open: boolean;
  onNotify?: (kind: 'success' | 'error', title: string, description?: string) => void;
  onClose: () => void;
}

export function ResourceTypeManager({ open, onNotify, onClose }: ResourceTypeManagerProps) {
  const iconMap = Icons as unknown as Record<string, LucideIcon>;
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editingType, setEditingType] = useState<ResourceTypeDefinition | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    icon: 'Folder',
    color: '#58a6ff',
    description: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [colorInput, setColorInput] = useState('#58a6ff');
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const resourceTypesQuery = useQuery({
    queryKey: queryKeys.resourceTypes(),
    queryFn: api.getResourceTypes,
    enabled: open,
  });

  const resourceTypes = resourceTypesQuery.data ?? [];

  useEffect(() => {
    if (resourceTypesQuery.error instanceof ApiError) {
      onNotify?.('error', 'Kartlar yüklenemedi', resourceTypesQuery.error.message);
    }
  }, [onNotify, resourceTypesQuery.error]);

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; icon: string; color: string; description: string }) => api.createResourceType(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.resourceTypes() });
      onNotify?.('success', 'Kart eklendi');
    },
    onError: (error) => {
      const message = error instanceof ApiError ? error.message : 'Kart kaydedilemedi.';
      setError(message);
      onNotify?.('error', 'Kart kaydedilemedi', message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { name: string; icon: string; color: string; description: string } }) => api.updateResourceType(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.resourceTypes() });
      onNotify?.('success', 'Kart güncellendi');
    },
    onError: (error) => {
      const message = error instanceof ApiError ? error.message : 'Kart kaydedilemedi.';
      setError(message);
      onNotify?.('error', 'Kart kaydedilemedi', message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteResourceType(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.resourceTypes() });
      await queryClient.invalidateQueries({ queryKey: ['resources'] });
      onNotify?.('success', 'Kart silindi');
    },
    onError: (error) => {
      const message = error instanceof ApiError ? error.message : 'Kart silinemedi.';
      onNotify?.('error', 'Kart silinemedi', message);
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => api.reorderResourceTypes(ids),
    onSuccess: () => onNotify?.('success', 'Kart sırası güncellendi'),
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.resourceTypes() });
      onNotify?.('error', 'Kart sırası güncellenemedi');
    },
  });

  const resetForm = () => {
    setFormData({ name: '', icon: 'Folder', color: '#58a6ff', description: '' });
    setColorInput('#58a6ff');
    setError('');
    setIsEditing(false);
    setEditingType(null);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      setError('Kart adı zorunludur.');
      return;
    }

    if (!/^#[0-9A-Fa-f]{6}$/.test(colorInput)) {
      setError('Geçerli bir hex renk girin.');
      return;
    }

    setLoading(true);
    try {
      const payload = { ...formData, color: colorInput };
      if (isEditing && editingType) {
        await updateMutation.mutateAsync({ id: editingType.id, payload });
      } else {
        await createMutation.mutateAsync(payload);
      }

      resetForm();
    } catch (error) {
      console.error('Failed to save resource type:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (type: ResourceTypeDefinition) => {
    setIsEditing(true);
    setEditingType(type);
    setFormData({
      name: type.name,
      icon: type.icon,
      color: type.color,
      description: type.description || ''
    });
    setColorInput(type.color);
    setError('');
  };

  const handleDelete = async (type: ResourceTypeDefinition) => {
    if (!confirm(`"${type.name}" tipini silmek istediğinize emin misiniz?`)) return;

    try {
      await deleteMutation.mutateAsync(type.id);
    } catch (error) {
      console.error('Failed to delete resource type:', error);
    }
  };

  const reorderTypes = async (nextTypes: ResourceTypeDefinition[]) => {
    queryClient.setQueryData(queryKeys.resourceTypes(), nextTypes);
    await reorderMutation.mutateAsync(nextTypes.map((item) => item.id));
  };

  const handleDrop = async (targetId: string) => {
    if (draggedId === null || draggedId === targetId) return;
    const next = [...resourceTypes];
    const fromIndex = next.findIndex((item) => item.id === draggedId);
    const toIndex = next.findIndex((item) => item.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setDraggedId(null);
    await reorderTypes(next);
  };

  const isSubmitting = loading || createMutation.isPending || updateMutation.isPending;
  const isDeleting = deleteMutation.isPending;
  const isReordering = reorderMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kart Tiplerini Yönet</DialogTitle>
          <DialogDescription>
            Toast, validasyon ve sürükle-bırak sıralama desteklenir.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-4 rounded-lg border bg-background p-4">
            <h3 className="font-medium">{isEditing ? 'Kart Tipini Düzenle' : 'Yeni Kart Tipi Ekle'}</h3>

            <div className="space-y-2">
              <Label htmlFor="rt-name">İsim</Label>
              <Input
                id="rt-name"
                placeholder="Örn: API Dokümantasyonu"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                disabled={isSubmitting}
              />
              {error ? (
                <p className="text-xs text-destructive" role="alert" aria-live="polite">{error}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="rt-description">Açıklama (İsteğe bağlı)</Label>
              <Input
                id="rt-description"
                placeholder="Bu kart tipinin açıklaması..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rt-icon-picker">İkon</Label>
              <div
                id="rt-icon-picker"
                className="grid max-h-40 grid-cols-8 gap-2 overflow-y-auto rounded-md border bg-background p-2"
                role="group"
                aria-label="İkon seçin"
              >
                {AVAILABLE_ICONS.map((icon) => {
                  const IconComponent = iconMap[icon] ?? Icons.Folder;
                  return (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setFormData({ ...formData, icon })}
                      className={`flex aspect-square items-center justify-center rounded border transition-colors ${formData.icon === icon ? 'border-primary bg-primary/10 text-primary' : 'border-transparent hover:bg-muted/50'}`}
                      aria-label={icon}
                      aria-pressed={formData.icon === icon}
                      disabled={isSubmitting}
                    >
                      <IconComponent className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">Seçilen: {formData.icon}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rt-color-input" className="flex items-center gap-2">
                <Palette className="h-4 w-4" /> Renk
              </Label>
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="Renk seçin"
              >
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`h-8 w-8 rounded-full border-2 transition-all ${colorInput === color ? 'border-foreground scale-110' : 'border-transparent hover:scale-105'}`}
                    style={{ backgroundColor: color }}
                    onClick={() => {
                      setFormData({ ...formData, color });
                      setColorInput(color);
                    }}
                    aria-label={`Renk ${color}`}
                    aria-pressed={colorInput === color}
                    disabled={isSubmitting}
                  />
                ))}
              </div>
              <Input
                id="rt-color-input"
                value={colorInput}
                onChange={(e) => setColorInput(e.target.value)}
                placeholder="#58a6ff"
                disabled={isSubmitting}
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !formData.name.trim()}
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Güncelle' : 'Ekle'}
              </Button>
              {isEditing ? <Button variant="outline" onClick={resetForm} disabled={isSubmitting}>İptal</Button> : null}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Mevcut Kart Tipleri</h3>
            <div className="space-y-2" aria-live="polite" aria-label="Kart tipleri listesi">
              {resourceTypes.map((type) => {
                const IconComponent = iconMap[type.icon] ?? Icons.Folder;
                return (
                  <div
                    key={type.id}
                    draggable={!type.is_builtin}
                    onDragStart={() => setDraggedId(type.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => void handleDrop(type.id)}
                    className="flex items-center justify-between rounded-lg border bg-card p-3"
                  >
                    <div className="flex items-center gap-3">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: `${type.color}20` }}>
                        <IconComponent className="h-4 w-4" style={{ color: type.color }} />
                      </div>
                      <div>
                        <div className="font-medium">{type.name}</div>
                        <div className="text-xs text-muted-foreground">{type.description || 'Açıklama yok'} • {type.resource_count ?? 0} kaynak</div>
                      </div>
                      {type.is_builtin ? <span className="rounded-full bg-secondary/50 px-2 py-0.5 text-xs text-muted-foreground">Varsayılan</span> : null}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEdit(type)}
                        aria-label={`${type.name} kart tipini düzenle`}
                        disabled={isDeleting || isReordering}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      {!type.is_builtin ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => void handleDelete(type)}
                          aria-label={`${type.name} kart tipini sil`}
                          disabled={isDeleting || isReordering}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
