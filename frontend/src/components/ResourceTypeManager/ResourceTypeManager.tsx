import { useState, useEffect } from 'react';
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
  onClose: () => void;
}

export function ResourceTypeManager({ open, onClose }: ResourceTypeManagerProps) {
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

  useEffect(() => {
    if (open) {
      fetchResourceTypes();
    }
  }, [open]);

  const fetchResourceTypes = async () => {
    try {
      const response = await fetch('/api/resource-types');
      const data = await response.json();
      setResourceTypes(data);
    } catch (error) {
      console.error('Failed to fetch resource types:', error);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) return;

    setLoading(true);
    try {
      if (isEditing && editingType) {
        await fetch(`/api/resource-types/${editingType.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
      } else {
        await fetch('/api/resource-types', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
      }
      setFormData({ name: '', icon: 'Folder', color: '#6366f1', description: '' });
      setIsEditing(false);
      setEditingType(null);
      fetchResourceTypes();
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
  };

  const handleDelete = async (type: ResourceTypeDefinition) => {
    if (!confirm(`"${type.name}" tipini silmek istediğinize emin misiniz?`)) return;

    try {
      const response = await fetch(`/api/resource-types/${type.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || 'Silme işlemi başarısız oldu');
        return;
      }

      fetchResourceTypes();
    } catch (error) {
      console.error('Failed to delete resource type:', error);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditingType(null);
    setFormData({ name: '', icon: 'Folder', color: '#6366f1', description: '' });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kart Tiplerini Yönet</DialogTitle>
          <DialogDescription>
            Yeni kart tipleri ekleyin, düzenleyin veya silin.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-4 border rounded-lg p-4 bg-muted/50">
            <h3 className="font-medium">
              {isEditing ? 'Kart Tipini Düzenle' : 'Yeni Kart Tipi Ekle'}
            </h3>

            <div className="space-y-2">
              <Label>İsim</Label>
              <Input
                placeholder="Örn: API Dokümantasyonu"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Açıklama (İsteğe bağlı)</Label>
              <Input
                placeholder="Bu kart tipinin açıklaması..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>İkon</Label>
              <div className="grid grid-cols-10 gap-1 max-h-32 overflow-y-auto p-2 border rounded-md bg-background">
                {AVAILABLE_ICONS.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => setFormData({ ...formData, icon })}
                    className={`aspect-square flex items-center justify-center rounded text-xs font-medium transition-colors ${
                      formData.icon === icon
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                    }`}
                    title={icon}
                  >
                    {icon.slice(0, 3)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Seçilen: {formData.icon}</p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Palette className="h-4 w-4" />
                Renk
              </Label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      formData.color === color ? 'border-foreground scale-110' : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setFormData({ ...formData, color })}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSubmit} disabled={loading || !formData.name.trim()}>
                {isEditing ? 'Güncelle' : 'Ekle'}
              </Button>
              {isEditing && (
                <Button variant="outline" onClick={handleCancel}>
                  İptal
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
              Mevcut Kart Tipleri
            </h3>
            <div className="space-y-2">
              {resourceTypes.map((type) => (
                <div
                  key={type.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold"
                      style={{ backgroundColor: `${type.color}20`, color: type.color }}
                    >
                      {type.icon.slice(0, 2)}
                    </div>
                    <div>
                      <div className="font-medium">{type.name}</div>
                      {type.description && (
                        <div className="text-xs text-muted-foreground">{type.description}</div>
                      )}
                    </div>
                    {type.is_builtin && (
                      <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                        Varsayılan
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleEdit(type)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    {!type.is_builtin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => handleDelete(type)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
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
