import { useEffect, useState } from 'react';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Trash2, Edit2, Palette, GripVertical } from 'lucide-react';
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

const PRESET_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#64748b',
  '#1e293b', '#7c3aed', '#db2777', '#059669', '#dc2626'
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
  const [resourceTypes, setResourceTypes] = useState<ResourceTypeDefinition[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingType, setEditingType] = useState<ResourceTypeDefinition | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    icon: 'Folder',
    color: '#6366f1',
    description: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [colorInput, setColorInput] = useState('#6366f1');
  const [draggedId, setDraggedId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      void fetchResourceTypes();
    }
  }, [open]);

  const fetchResourceTypes = async () => {
    try {
      const response = await fetch('/api/resource-types');
      if (!response.ok) {
        setResourceTypes([]);
        return;
      }
      const data = await response.json();
      setResourceTypes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch resource types:', error);
      setResourceTypes([]);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', icon: 'Folder', color: '#6366f1', description: '' });
    setColorInput('#6366f1');
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
      const response = isEditing && editingType
        ? await fetch(`/api/resource-types/${editingType.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
        : await fetch('/api/resource-types', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

      if (!response.ok) {
        const payloadError = await response.json().catch(() => null);
        const message = payloadError?.error ?? 'Kart kaydedilemedi.';
        setError(message);
        onNotify?.('error', 'Kart kaydedilemedi', message);
        return;
      }

      resetForm();
      await fetchResourceTypes();
      onNotify?.('success', isEditing ? 'Kart güncellendi' : 'Kart eklendi');
    } catch (error) {
      console.error('Failed to save resource type:', error);
      onNotify?.('error', 'Kart kaydedilemedi');
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
      const response = await fetch(`/api/resource-types/${type.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        onNotify?.('error', 'Kart silinemedi', error?.error || 'Silme işlemi başarısız oldu');
        return;
      }

      await fetchResourceTypes();
      onNotify?.('success', 'Kart silindi');
    } catch (error) {
      console.error('Failed to delete resource type:', error);
      onNotify?.('error', 'Kart silinemedi');
    }
  };

  const reorderTypes = async (nextTypes: ResourceTypeDefinition[]) => {
    setResourceTypes(nextTypes);
    const response = await fetch('/api/resource-types/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: nextTypes.map((item) => item.id) })
    });

    if (!response.ok) {
      await fetchResourceTypes();
      onNotify?.('error', 'Kart sırası güncellenemedi');
      return;
    }

    onNotify?.('success', 'Kart sırası güncellendi');
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
          <div className="space-y-4 rounded-lg border bg-muted/50 p-4">
            <h3 className="font-medium">{isEditing ? 'Kart Tipini Düzenle' : 'Yeni Kart Tipi Ekle'}</h3>

            <div className="space-y-2">
              <Label>İsim</Label>
              <Input placeholder="Örn: API Dokümantasyonu" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
            </div>

            <div className="space-y-2">
              <Label>Açıklama (İsteğe bağlı)</Label>
              <Input placeholder="Bu kart tipinin açıklaması..." value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
            </div>

            <div className="space-y-2">
              <Label>İkon</Label>
              <div className="grid max-h-40 grid-cols-8 gap-2 overflow-y-auto rounded-md border bg-background p-2">
                {AVAILABLE_ICONS.map((icon) => {
                  const IconComponent = iconMap[icon] ?? Icons.Folder;
                  return (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setFormData({ ...formData, icon })}
                      className={`flex aspect-square items-center justify-center rounded border transition-colors ${formData.icon === icon ? 'border-primary bg-primary/10 text-primary' : 'border-transparent hover:bg-muted'}`}
                      title={icon}
                    >
                      <IconComponent className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">Seçilen: {formData.icon}</p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Palette className="h-4 w-4" /> Renk</Label>
              <div className="flex flex-wrap gap-2">
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
                  />
                ))}
              </div>
              <Input value={colorInput} onChange={(e) => setColorInput(e.target.value)} placeholder="#6366f1" />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSubmit} disabled={loading || !formData.name.trim()}>{isEditing ? 'Güncelle' : 'Ekle'}</Button>
              {isEditing ? <Button variant="outline" onClick={resetForm}>İptal</Button> : null}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Mevcut Kart Tipleri</h3>
            <div className="space-y-2">
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
                      {type.is_builtin ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Varsayılan</span> : null}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(type)}><Edit2 className="h-4 w-4" /></Button>
                      {!type.is_builtin ? <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => void handleDelete(type)}><Trash2 className="h-4 w-4" /></Button> : null}
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
