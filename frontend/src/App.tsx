import { useRef, useState, useEffect } from 'react';
import { CategoryGrid } from './components/CategoryGrid/CategoryGrid';
import { ResourceList } from './components/ResourceList/ResourceList';
import { CategoryManager } from './components/CategoryManager/CategoryManager';
import { ResourceTypeManager } from './components/ResourceTypeManager';
import { AddResourceDialog } from './components/AddResourceDialog/AddResourceDialog';
import { TypeCategories } from './components/TypeCategories/TypeCategories';
import { Button } from './components/ui/button';
import { Plus, Settings, Github, LayoutGrid, Download, Upload } from 'lucide-react';
import { ThemeToggle } from './components/ThemeToggle';
import { useTheme } from './contexts/ThemeContext';
import { GlobalSearchPanel } from './components/GlobalSearchPanel';
import { ToastBanner, type ToastItem } from './components/ui/toast-banner';
import type { Category, ExportPayload, ResourceTypeDefinition, ResourceWithSync } from './types';

function App() {
  const { theme } = useTheme();
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showResourceTypeManager, setShowResourceTypeManager] = useState(false);
  const [showAddResource, setShowAddResource] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [resourceTypes, setResourceTypes] = useState<ResourceTypeDefinition[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalResults, setGlobalResults] = useState<ResourceWithSync[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const importRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetchCategories();
    fetchResourceTypes();
  }, []);

  useEffect(() => {
    if (!globalSearchQuery.trim()) {
      setGlobalResults([]);
      return;
    }

    const controller = new AbortController();

    const run = async () => {
      try {
        const params = new URLSearchParams({ search: globalSearchQuery.trim() });
        const response = await fetch(`/api/resources?${params.toString()}`, { signal: controller.signal });
        if (!response.ok) {
          setGlobalResults([]);
          return;
        }
        const data = await response.json();
        setGlobalResults(Array.isArray(data) ? data : []);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setGlobalResults([]);
        }
      }
    };

    const timeout = window.setTimeout(run, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [globalSearchQuery]);

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

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/categories');
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

  const handleCategorySelect = (categoryId: number | null) => {
    setSelectedCategory(categoryId);
  };

  const handleTypeSelect = (type: string | null) => {
    setSelectedType(type);
    setSelectedCategory(null);
    setSearchQuery('');
  };

  const handleCategoryOpenFromSearch = (type: string, categoryId: number) => {
    setSelectedType(type);
    setSelectedCategory(categoryId);
    setSearchQuery('');
    setGlobalSearchQuery('');
  };

  const handleResourceAdded = () => {
    setRefreshKey(prev => prev + 1);
    setShowAddResource(false);
    fetchCategories();
    fetchResourceTypes();
  };

  const handleResourceSuccess = (type: string) => {
    setSelectedType(type);
    setSelectedCategory(null);
    setSearchQuery('');
  };

  const handleExport = async () => {
    try {
      const response = await fetch('/api/data/export');
      if (!response.ok) {
        showToast('error', 'Export başarısız', 'Veriler indirilemedi.');
        return;
      }

      const data = await response.json() as ExportPayload;
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

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const response = await fetch('/api/data/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        showToast('error', 'Import başarısız', 'Dosya içeriği işlenemedi.');
        return;
      }

      await Promise.all([fetchCategories(), fetchResourceTypes()]);
      setRefreshKey((prev) => prev + 1);
      showToast('success', 'Import tamamlandı');
    } catch {
      showToast('error', 'Import başarısız', 'Geçerli bir JSON dosyası seçin.');
    } finally {
      event.target.value = '';
    }
  };

  const selectedTypeConfig = selectedType
    ? resourceTypes.find(t => t.id === selectedType)
    : null;

  const selectedTypeCategories = selectedType
    ? categories.filter((category) => category.type === selectedType)
    : [];

  return (
    <div className={`min-h-screen bg-background transition-colors duration-300 ${theme}`}>
      <ToastBanner toasts={toasts} onDismiss={dismissToast} />
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 flex h-14 items-center justify-between">
          <div className="flex items-center gap-2">
            <Github className="h-6 w-6" />
            <h1
              className="text-xl font-bold cursor-pointer hover:text-primary transition-colors"
              onClick={() => {
                setSelectedType(null);
                setSelectedCategory(null);
                setSearchQuery('');
              }}
            >
              Link Manager
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => importRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              Import
            </Button>
            <input ref={importRef} type="file" accept="application/json" className="hidden" onChange={handleImport} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowResourceTypeManager(true)}
            >
              <LayoutGrid className="h-4 w-4 mr-2" />
              Kartlar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCategoryManager(true)}
            >
              <Settings className="h-4 w-4 mr-2" />
              Kategoriler
            </Button>
            <Button
              size="sm"
              onClick={() => setShowAddResource(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Ekle
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {!selectedType ? (
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
              resourceTypes={globalSearchQuery.trim() ? resourceTypes.filter((type) => [type.name, type.description ?? '', type.id].some((value) => value.toLowerCase().includes(globalSearchQuery.trim().toLowerCase()))) : resourceTypes}
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
              key={refreshKey}
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
            fetchCategories();
          }}
        />
      )}

      {showResourceTypeManager && (
        <ResourceTypeManager
          open={showResourceTypeManager}
          onNotify={showToast}
          onClose={() => {
            setShowResourceTypeManager(false);
            fetchResourceTypes();
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
    </div>
  );
}

export default App;
