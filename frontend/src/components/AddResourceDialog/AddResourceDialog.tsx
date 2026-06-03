import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
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
import { getIcon } from '../../lib/icon-map';
import { queryKeys } from '../../lib/query-keys';
import { sortCategoriesAlphabetically } from '../../lib/resource-view';

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
  const queryClient = useQueryClient();
  const [type, setType] = useState<string>(selectedType ?? (resourceTypes[0]?.id || 'website'));
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const isEditing = initialResource !== null;
  const effectiveType = initialResource
    ? type
    : type === 'website' && !selectedType && resourceTypes[0]?.id
      ? resourceTypes[0].id
      : type;

  const filteredCategories = sortCategoriesAlphabetically(categories.filter((category) => category.type === effectiveType));
  const typeResourcesQuery = useQuery({
    queryKey: queryKeys.resources({ categoryId: null, type: effectiveType, search: '' }),
    queryFn: () => api.getResources({ type: effectiveType }),
    enabled: open && effectiveType.length > 0,
  });
  const isDuplicateCheckLoading = typeResourcesQuery.isFetching || typeResourcesQuery.isLoading;

  const showDuplicateUrlError = () => {
    const message = 'URL zaten mevcut';
    setError(message);
    onNotify?.('error', message);
  };

  const hasDuplicateUrl = (candidateUrl: string | null) => {
    if (candidateUrl === null) {
      return false;
    }

    return (typeResourcesQuery.data ?? []).some((resource) => {
      if (resource.id === initialResource?.id) {
        return false;
      }

      return resource.url === candidateUrl;
    });
  };

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
      if (error instanceof ApiError && error.status === 409 && error.message === 'URL zaten mevcut') {
        onNotify?.('error', message);
        return;
      }

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
      if (error instanceof ApiError && error.status === 409 && error.message === 'URL zaten mevcut') {
        onNotify?.('error', message);
        return;
      }

      onNotify?.('error', 'Kaynak güncellenemedi', message);
    },
  });

  const handleTypeChange = (nextType: string) => {
    setType(nextType);
    setCategoryId('');
  };

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

    const candidateUrl = url || null;
    if (hasDuplicateUrl(candidateUrl)) {
      showDuplicateUrlError();
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
            url: candidateUrl,
            description: description || null,
            category_id: categoryId ? parseInt(categoryId) : null,
          },
        });
        onClose();
        return;
      } else {
          await createMutation.mutateAsync({
            type: effectiveType,
            title,
            url: candidateUrl,
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
      const message = error instanceof ApiError ? error.message : 'Beklenmeyen bir hata oluştu.';
      onNotify?.('error', 'Kaynak kaydedilemedi', message);
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
            <Select value={effectiveType} onValueChange={handleTypeChange} disabled={isEditing}>
              <SelectTrigger id="resource-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {resourceTypes.map((rt) => {
                  const IconComponent = getIcon(rt.icon);
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
              placeholder={effectiveType === 'github' ? 'https://github.com/owner/repo' : 'https://example.com'}
              type="url"
              autoComplete="url"
              disabled={isDuplicateCheckLoading}
              aria-busy={isDuplicateCheckLoading}
            />
            {isDuplicateCheckLoading ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1" role="status" aria-live="polite">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                Mevcut URL'ler kontrol ediliyor...
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="resource-category">Kategori</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="resource-category">
                <SelectValue placeholder="Kategori seç..." />
              </SelectTrigger>
              <SelectContent className="max-h-[200px] overflow-y-auto">
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
            <Button type="submit" disabled={loading || isDuplicateCheckLoading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
