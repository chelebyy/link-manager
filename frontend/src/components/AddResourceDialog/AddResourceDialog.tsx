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
}

export function AddResourceDialog({ open, onClose, onSuccess, onNotify, categories, selectedType, resourceTypes }: AddResourceDialogProps) {
  const iconMap = Icons as unknown as Record<string, LucideIcon>;
  const queryClient = useQueryClient();
  const [type, setType] = useState<string>(selectedType ?? (resourceTypes[0]?.id || 'website'));
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

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

  const handleTypeChange = (nextType: string) => {
    setType(nextType);
    setCategoryId('');
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const defaultType = selectedType ?? resourceTypes[0]?.id ?? 'website';
    setType(defaultType);
    setCategoryId('');
  }, [open, selectedType, resourceTypes]);

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
      await createMutation.mutateAsync({
        type,
        title,
        url: url || null,
        description: description || null,
        category_id: categoryId ? parseInt(categoryId) : null,
      });

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
          <DialogTitle>Yeni Kaynak Ekle</DialogTitle>
          <DialogDescription>
            Yeni bir kaynak eklemek için aşağıdaki formu doldurun.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Tip</Label>
            <Select value={type} onValueChange={handleTypeChange}>
              <SelectTrigger>
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
            <Label>Başlık *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Örn: React Documentation"
              required
            />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>

          <div className="space-y-2">
            <Label>URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={type === 'github' ? 'https://github.com/owner/repo' : 'https://example.com'}
              type="url"
            />
          </div>

          <div className="space-y-2">
            <Label>Kategori</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
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
            <Label>Açıklama</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Kısa açıklama..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onClose()}>
              İptal
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Ekleniyor...' : 'Ekle'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
