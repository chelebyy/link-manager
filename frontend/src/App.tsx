import { useRef, useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CategoryGrid } from './components/CategoryGrid/CategoryGrid';
import { ResourceList } from './components/ResourceList/ResourceList';
import { CategoryManager } from './components/CategoryManager/CategoryManager';
import { ResourceTypeManager } from './components/ResourceTypeManager';
import { AddResourceDialog } from './components/AddResourceDialog/AddResourceDialog';
import { TypeCategories } from './components/TypeCategories/TypeCategories';
import { Button } from './components/ui/button';
import { Plus, Settings, Github, LayoutGrid, Download, Upload } from 'lucide-react';
import { GlobalSearchPanel } from './components/GlobalSearchPanel';
import { ToastBanner, type ToastItem } from './components/ui/toast-banner';
import type { ExportPayload } from './types';
import { api, ApiError } from './lib/api';
import { queryKeys } from './lib/query-keys';

function App() {
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showResourceTypeManager, setShowResourceTypeManager] = useState(false);
  const [showAddResource, setShowAddResource] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const importRef = useRef<HTMLInputElement | null>(null);

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories(),
    queryFn: () => api.getCategories(),
  });

  const resourceTypesQuery = useQuery({
    queryKey: queryKeys.resourceTypes(),
    queryFn: api.getResourceTypes,
  });

  const globalResultsQuery = useQuery({
    queryKey: queryKeys.globalResources(globalSearchQuery.trim()),
    queryFn: () => api.getResources({ search: globalSearchQuery.trim() }),
    enabled: globalSearchQuery.trim().length > 0,
  });

  const categories = categoriesQuery.data ?? [];
  const resourceTypes = resourceTypesQuery.data ?? [];
  const globalResults = globalResultsQuery.data ?? [];

  const isLoading = categoriesQuery.isLoading || resourceTypesQuery.isLoading;

  const showToast = (kind: ToastItem['kind'], title: string, description?: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, kind, title, description }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4000);
  };

  const dismissToast = (id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  const handleCategorySelect = (categoryId: number | null) => {
    setSelectedCategory(categoryId);
  };

  const handleTypeSelect = (type: string | null) => {
    setSelectedType(type);
    setSelectedCategory(null);
    setSearchQuery('');
    setGlobalSearchQuery('');
  };

  const handleCategoryOpenFromSearch = (type: string, categoryId: number) => {
    setSelectedType(type);
    setSelectedCategory(categoryId);
    setSearchQuery('');
    setGlobalSearchQuery('');
  };

  const handleResourceAdded = () => {
    setShowAddResource(false);
  };

  const handleResourceSuccess = (type: string) => {
    setSelectedType(type);
    setSelectedCategory(null);
    setSearchQuery('');
  };

  const handleExport = async () => {
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `link-manager-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      showToast('success', 'Export tamamlandı');
    } catch {
      showToast('error', 'Export başarısız', 'Beklenmeyen bir hata oluştu.');
    }
  };

  const importMutation = useMutation({
    mutationFn: (payload: ExportPayload) => api.importData(payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.categories() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.resourceTypes() }),
        queryClient.invalidateQueries({ queryKey: ['resources'] }),
      ]);
      showToast('success', 'Import tamamlandı');
    },
    onError: () => {
      showToast('error', 'Import başarısız', 'Dosya içeriği işlenemedi.');
    },
  });

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const payload = JSON.parse(text) as ExportPayload;
      await importMutation.mutateAsync(payload);
    } catch {
      showToast('error', 'Import başarısız', 'Geçerli bir JSON dosyası seçin.');
    } finally {
      event.target.value = '';
    }
  };

  useEffect(() => {
    const error = categoriesQuery.error || resourceTypesQuery.error || globalResultsQuery.error;
    if (error instanceof ApiError) {
      showToast('error', 'Veri yüklenemedi', error.message);
    }
  }, [categoriesQuery.error, resourceTypesQuery.error, globalResultsQuery.error]);

  const selectedTypeConfig = selectedType
    ? resourceTypes.find(t => t.id === selectedType)
    : null;

  const selectedTypeCategories = selectedType
    ? categories.filter((category) => category.type === selectedType)
    : [];

  return (
    <div className="min-h-screen bg-background transition-colors duration-300">
      <ToastBanner toasts={toasts} onDismiss={dismissToast} />
      <header className="sticky top-0 z-50 w-full border-b border-[#d1d5db] bg-background pt-[env(safe-area-inset-top)]">
        <div className="container mx-auto px-3 sm:px-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 shrink-0">
            <Github className="h-5 w-5 shrink-0" aria-hidden="true" />
            <h1
              className="font-mono text-lg sm:text-xl font-semibold cursor-pointer hover:text-primary transition-colors truncate"
              onClick={() => {
                setSelectedType(null);
                setSelectedCategory(null);
                setSearchQuery('');
              }}
            >
              Link Manager
            </h1>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto scrollbar-hide -mr-3 pr-3 min-w-0">
            <Button
              variant="outline"
              size="sm"
              className="rounded-sm border-border font-mono text-xs shrink-0"
              onClick={handleExport}
              aria-label="Export data"
            >
              <Download className="h-3 w-3 sm:mr-1.5" aria-hidden="true" />
              <span className="hidden sm:inline">Export</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-sm border-border font-mono text-xs shrink-0"
              onClick={() => importRef.current?.click()}
              aria-label="Import data"
            >
              <Upload className="h-3 w-3 sm:mr-1.5" aria-hidden="true" />
              <span className="hidden sm:inline">Import</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-sm border-border font-mono text-xs shrink-0"
              onClick={() => setShowResourceTypeManager(true)}
              aria-label="Manage resource type cards"
            >
              <LayoutGrid className="h-3 w-3 sm:mr-1.5" aria-hidden="true" />
              <span className="hidden sm:inline">Kartlar</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-sm border-border font-mono text-xs shrink-0"
              onClick={() => setShowCategoryManager(true)}
              aria-label="Manage categories"
            >
              <Settings className="h-3 w-3 sm:mr-1.5" aria-hidden="true" />
              <span className="hidden sm:inline">Kategoriler</span>
            </Button>
            <Button
              size="sm"
              className="rounded-sm font-mono text-xs shrink-0"
              onClick={() => setShowAddResource(true)}
              aria-label="Add new resource"
            >
              <Plus className="h-3 w-3 sm:mr-1.5" aria-hidden="true" />
              <span className="hidden md:inline">Ekle</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {isLoading ? (
          <div className="space-y-8">
            <div className="h-24 rounded-lg bg-muted animate-pulse" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          </div>
        ) : !selectedType ? (
          <div className="space-y-8">
            <GlobalSearchPanel
              query={globalSearchQuery}
              onQueryChange={setGlobalSearchQuery}
              categories={categories}
              resourceTypes={resourceTypes}
              resources={globalResults}
              onOpenType={handleTypeSelect}
              onOpenCategory={handleCategoryOpenFromSearch}
            />
            <CategoryGrid
              resourceTypes={globalSearchQuery.trim() ? resourceTypes.filter((type) => [type.name, type.description ?? '', type.id].some((value) => value.toString().toLowerCase().includes(globalSearchQuery.trim().toLowerCase()))) : resourceTypes}
              onSelectType={handleTypeSelect}
            />
          </div>
        ) : (
          <TypeCategories
            typeLabel={selectedTypeConfig?.name || selectedType}
            typeColor={selectedTypeConfig?.color || '#6366f1'}
            categories={selectedTypeCategories}
            selectedCategory={selectedCategory}
            searchQuery={searchQuery}
            onSelectCategory={handleCategorySelect}
            onSearchChange={setSearchQuery}
            onBack={() => {
              setSelectedType(null);
              setSelectedCategory(null);
              setSearchQuery('');
            }}
          >
            <ResourceList
              categoryId={selectedCategory}
              type={selectedType}
              searchQuery={searchQuery}
              onNotify={showToast}
            />
          </TypeCategories>
        )}
      </main>

      {showCategoryManager && (
        <CategoryManager
          open={showCategoryManager}
          selectedType={selectedType}
          onNotify={showToast}
          onClose={() => {
            setShowCategoryManager(false);
          }}
        />
      )}

      {showResourceTypeManager && (
        <ResourceTypeManager
          open={showResourceTypeManager}
          onNotify={showToast}
          onClose={() => {
            setShowResourceTypeManager(false);
          }}
        />
      )}

      {showAddResource && (
        <AddResourceDialog
          open={showAddResource}
          onClose={handleResourceAdded}
          onSuccess={handleResourceSuccess}
          onNotify={showToast}
          categories={categories}
          selectedType={selectedType}
          resourceTypes={resourceTypes}
        />
      )}
      
      <input
        ref={importRef}
        type="file"
        accept="application/json"
        onChange={handleImport}
        className="hidden"
      />
    </div>
  );
}

export default App;
