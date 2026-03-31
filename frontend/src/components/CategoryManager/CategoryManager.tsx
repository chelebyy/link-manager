import { useState, useEffect } from 'react';
import { Plus, Trash2, Folder, GripVertical } from 'lucide-react';
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
import type { Category, ResourceTypeDefinition } from '../../types';

const presetColors = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#64748b'
];

interface CategoryManagerProps {
  open: boolean;
  selectedType: string | null;
  onNotify?: (kind: 'success' | 'error', title: string, description?: string) => void;
  onClose: () => void;
}

export function CategoryManager({ open, selectedType, onNotify, onClose }: CategoryManagerProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [resourceTypes, setResourceTypes] = useState<ResourceTypeDefinition[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [managedType, setManagedType] = useState<string>(selectedType ?? 'website');
  const [loading, setLoading] = useState(false);
  const [colorInput, setColorInput] = useState(presetColors[0]);
  const [error, setError] = useState('');
  const [draggedId, setDraggedId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    fetchResourceTypes();

    if (selectedType) {
      setManagedType(selectedType);
    }
  }, [open, selectedType]);

  useEffect(() => {
    if (open && resourceTypes.length > 0) {
      fetchCategories();
    }
  }, [open, managedType, resourceTypes]);

  const fetchResourceTypes = async () => {
    try {
      const response = await fetch('/api/resource-types');
      if (!response.ok) {
        setResourceTypes([]);
        return;
      }
      const data = await response.json();
      const nextTypes = Array.isArray(data) ? data : [];
      setResourceTypes(nextTypes);
      if (!selectedType && nextTypes.length > 0) {
        setManagedType(nextTypes[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch resource types:', error);
      setResourceTypes([]);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await fetch(`/api/categories?type=${managedType}`);
      if (!response.ok) {
        setCategories([]);
        return;
      }
      const data = await response.json();
      setCategories(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      setCategories([]);
    }
  };

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
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCategoryName,
          color: colorInput,
          icon: 'Folder',
          type: managedType,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = payload?.error ?? 'Kategori eklenemedi.';
        setError(message);
        onNotify?.('error', 'Kategori eklenemedi', message);
        return;
      }

      setNewCategoryName('');
      setError('');
      fetchCategories();
      onNotify?.('success', 'Kategori eklendi');
    } catch (error) {
      console.error('Failed to create category:', error);
      onNotify?.('error', 'Kategori eklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const deleteCategory = async (id: number) => {
    if (!confirm('Bu kategoriyi silmek istediğinize emin misiniz?')) return;

    try {
      await fetch(`/api/categories/${id}`, { method: 'DELETE' });
      fetchCategories();
      onNotify?.('success', 'Kategori silindi');
    } catch (error) {
      console.error('Failed to delete category:', error);
      onNotify?.('error', 'Kategori silinemedi');
    }
  };

  const reorderCategories = async (nextCategories: Category[]) => {
    setCategories(nextCategories);
    await fetch('/api/categories/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: nextCategories.map((item) => item.id) }),
    });
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
    onNotify?.('success', 'Kategori sırası güncellendi');
  };

  const getTypeName = (typeId: string) => {
    return resourceTypes.find(t => t.id === typeId)?.name || typeId;
  };

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
            <Label>Kart</Label>
            <Select value={managedType} onValueChange={setManagedType}>
              <SelectTrigger>
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
            <Label>Yeni Kategori</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Kategori adı"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createCategory()}
              />
              <Button onClick={createCategory} disabled={loading}>
                <Plus className="h-4 w-4" />
              </Button>
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
                />
              ))}
            </div>
            <Input value={colorInput} onChange={(e) => setColorInput(e.target.value)} placeholder="#6366f1" />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>

          <div className="border-t pt-4">
            <Label>{getTypeName(managedType)} kategorileri</Label>
            <div className="space-y-2 mt-2">
              {categories.map((category) => (
                <div
                  key={category.id}
                  draggable
                  onDragStart={() => setDraggedId(category.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => void handleDrop(category.id)}
                  className="flex items-center justify-between rounded-lg border p-2"
                >
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <div
                      className="w-8 h-8 rounded flex items-center justify-center"
                      style={{ backgroundColor: `${category.color}20` }}
                    >
                      <Folder className="w-4 h-4" style={{ color: category.color }} />
                    </div>
                    <span>{category.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => deleteCategory(category.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
