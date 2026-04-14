import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import type { Category, ResourceTypeDefinition } from '../../types';
import { api, ApiError } from '../../lib/api';
import { queryKeys } from '../../lib/query-keys';

interface AddResourceDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (type: string) => void;
  onNotify?: (kind: 'success' | 'error', title: string, description?: string) => void;
  categories: Category[];
  selectedType: string | null;
  resourceTypes: ResourceTypeDefinition[];
  initialResource?: {
    id: number;
    type: string;
    title: string;
    url: string | null;
    description: string | null;
    category_id: number | null;
  } | null;
}

export function AddResourceDialog({ open, onClose, onSuccess, onNotify, categories, selectedType, resourceTypes, initialResource = null }: AddResourceDialogProps) {
  const iconMap = Icons as unknown as Record<string, LucideIcon>;
  const queryClient = useQueryClient();
  const [type, setType] = useState<string>(selectedType ?? (resourceTypes[0]?.id || 'website'));
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const isEditing = initialResource !== null;

  const filteredCategories = categories.filter((category) => category.type === type);

  const createMutation = useMutation({
    mutationFn: (payload: { type: string; title: string; url: string | null; description: string | null; category_id: number | null }) => api.createResource(payload),
    onSuccess: async (_, payload) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['resources'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.resourceTypes() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.categories() }),
      ]);
      onNotify?.('success', 'Kaynak eklendi');
      onSuccess?.(payload.type);
    },
    onError: (error) => {
      const message = error instanceof ApiError ? error.message : 'Kaynak eklenemedi.';
      setError(message);
      onNotify?.('error', 'Kaynak eklenemedi', message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { title: string; url: string | null; description: string | null; category_id: number | null } }) => api.updateResource(id, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['resources'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.resourceTypes() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.categories() }),
      ]);
      onNotify?.('success', 'Kaynak güncellendi');
      onSuccess?.(type);
    },
    onError: (error) => {
      const message = error instanceof ApiError ? error.message : 'Kaynak güncellenemedi.';
      setError(message);
      onNotify?.('error', 'Kaynak güncellenemedi', message);
    },
  });

  const handleTypeChange = (nextType: string) => {
    setType(nextType);
    setCategoryId('');
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const defaultType = selectedType ?? resourceTypes[0]?.id ?? 'website';
    if (initialResource) {
      setType(initialResource.type);
      setTitle(initialResource.title);
      setUrl(initialResource.url ?? '');
      setDescription(initialResource.description ?? '');
      setCategoryId(initialResource.category_id ? String(initialResource.category_id) : '');
    } else {
      setType(defaultType);
      setTitle('');
      setUrl('');
      setDescription('');
      setCategoryId('');
    }
    setError('');
  }, [open, selectedType, resourceTypes, initialResource]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError('Başlık zorunludur.');
      return;
    }

    if (url && !/^https?:\/\//i.test(url)) {
      setError('URL http:// veya https:// ile başlamalıdır.');
      return;
    }

    setError('');

    setLoading(true);
    try {
      if (initialResource) {
        await updateMutation.mutateAsync({
          id: initialResource.id,
          payload: {
            title,
            url: url || null,
            description: description || null,
            category_id: categoryId ? parseInt(categoryId) : null,
          },
        });
        onClose();
        return;
      } else {
        await createMutation.mutateAsync({
          type,
          title,
          url: url || null,
          description: description || null,
          category_id: categoryId ? parseInt(categoryId) : null,
        });
      }

      setTitle('');
      setUrl('');
      setDescription('');
      setCategoryId('');
      setError('');
      onClose();
    } catch (error) {
      console.error('Failed to add resource:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Kaynağı Düzenle' : 'Yeni Kaynak Ekle'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Kaynak bilgilerini güncelleyin.' : 'Yeni bir kaynak eklemek için aşağıdaki formu doldurun.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="resource-type">Tip</Label>
            <Select value={type} onValueChange={handleTypeChange} disabled={isEditing}>
              <SelectTrigger id="resource-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {resourceTypes.map((rt) => {
                  const IconComponent = iconMap[rt.icon] ?? Icons.Folder;
                  return (
                    <SelectItem key={rt.id} value={rt.id}>
                      <div className="flex items-center gap-2">
                        <IconComponent className="h-4 w-4" />
                        {rt.name}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="resource-title">Başlık *</Label>
            <Input
              id="resource-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Örn: React Documentation"
              required
              autoComplete="off"
              aria-describedby={error && !url && !description ? 'resource-title-error' : undefined}
            />
            {error && !url && !description ? (
              <p id="resource-title-error" className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="resource-url">URL</Label>
            <Input
              id="resource-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={type === 'github' ? 'https://github.com/owner/repo' : 'https://example.com'}
              type="url"
              autoComplete="url"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="resource-category">Kategori</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="resource-category">
                <SelectValue placeholder="Kategori seç..." />
              </SelectTrigger>
              <SelectContent>
                {filteredCategories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id.toString()}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="resource-description">Açıklama</Label>
            <Textarea
              id="resource-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Kısa açıklama..."
              rows={3}
              autoComplete="off"
            />
          </div>

          {error && (
            <div role="alert" aria-live="polite">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onClose()}>
              İptal
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Icons.Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEditing ? 'Kaydediliyor...' : 'Ekleniyor...'}
                </>
              ) : (
                isEditing ? 'Kaydet' : 'Ekle'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
