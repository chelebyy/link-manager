import { useState } from 'react';
import { Github, Globe, Wrench, FileText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
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
import type { Category, ResourceType } from '../../types';

interface AddResourceDialogProps {
  open: boolean;
  onClose: () => void;
  categories: Category[];
}

const typeOptions: { value: ResourceType; label: string; icon: React.ElementType }[] = [
  { value: 'github', label: 'GitHub Repo', icon: Github },
  { value: 'website', label: 'Website', icon: Globe },
  { value: 'skill', label: 'Skill', icon: Wrench },
  { value: 'note', label: 'Note', icon: FileText },
];

export function AddResourceDialog({ open, onClose, categories }: AddResourceDialogProps) {
  const [type, setType] = useState<ResourceType>('website');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    try {
      await fetch('/api/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          title,
          url: url || null,
          description: description || null,
          category_id: categoryId ? parseInt(categoryId) : null,
        }),
      });
      
      setTitle('');
      setUrl('');
      setDescription('');
      setCategoryId('');
      onClose();
    } catch (error) {
      console.error('Failed to add resource:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Yeni Kaynak Ekle</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Tip</Label>
            <Select value={type} onValueChange={(v) => setType(v as ResourceType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex items-center gap-2">
                      <opt.icon className="h-4 w-4" />
                      {opt.label}
                    </div>
                  </SelectItem>
                ))}
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
          </div>

          <div className="space-y-2">
            <Label>URL {type !== 'note' && '*'}</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={type === 'github' ? 'https://github.com/owner/repo' : 'https://example.com'}
              required={type !== 'note'}
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
                {categories.map((cat) => (
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
            <Button type="button" variant="outline" onClick={onClose}>
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
