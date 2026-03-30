import { useState, useEffect } from 'react';
import { CategoryGrid } from './components/CategoryGrid/CategoryGrid';
import { ResourceList } from './components/ResourceList/ResourceList';
import { FilterBar } from './components/FilterBar/FilterBar';
import { CategoryManager } from './components/CategoryManager/CategoryManager';
import { AddResourceDialog } from './components/AddResourceDialog/AddResourceDialog';
import { TypeCategories } from './components/TypeCategories/TypeCategories';
import { Button } from './components/ui/button';
import { Plus, Settings, Github } from 'lucide-react';
import { ThemeToggle } from './components/ThemeToggle';
import { useTheme } from './contexts/ThemeContext';
import type { Category, ResourceType } from './types';

function App() {
  const { theme } = useTheme();
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedType, setSelectedType] = useState<ResourceType | null>(null);
  const [showTypeCategoriesView, setShowTypeCategoriesView] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showAddResource, setShowAddResource] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const typeConfig: Record<ResourceType, { label: string; color: string }> = {
    github: { label: 'GitHub Repos', color: '#333' },
    skill: { label: 'Skills', color: '#6366f1' },
    website: { label: 'Websites', color: '#10b981' },
    note: { label: 'Notes', color: '#f59e0b' },
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/categories');
      const data = await response.json();
      setCategories(data);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  };

  const handleCategorySelect = (categoryId: number | null) => {
    setSelectedCategory(categoryId);
    setShowTypeCategoriesView(false);
  };

  const handleTypeSelect = (type: ResourceType | null) => {
    setSelectedType(type);
    setShowTypeCategoriesView(true);
    setSelectedCategory(null);
  };

  const handleResourceAdded = () => {
    setRefreshKey(prev => prev + 1);
    setShowAddResource(false);
  };

  const handleResourceSuccess = (type: ResourceType) => {
    setSelectedType(type);
    setShowTypeCategoriesView(true);
    setSelectedCategory(null);
  };

  return (
    <div className={`min-h-screen bg-background transition-colors duration-300 ${theme}`}>
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 flex h-14 items-center justify-between">
          <div className="flex items-center gap-2">
            <Github className="h-6 w-6" />
            <h1 className="text-xl font-bold">Link Manager</h1>
          </div>
          <div className="flex items-center gap-2">
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
          <CategoryGrid 
            onSelectType={handleTypeSelect}
          />
        ) : showTypeCategoriesView ? (
          <TypeCategories
            typeLabel={typeConfig[selectedType].label}
            typeColor={typeConfig[selectedType].color}
            categories={categories}
            onSelectCategory={handleCategorySelect}
            onBack={() => {
              setSelectedType(null);
              setShowTypeCategoriesView(false);
            }}
          />
        ) : (
          <>
            <FilterBar
              selectedCategory={selectedCategory}
              selectedType={selectedType}
              onCategoryChange={handleCategorySelect}
              onTypeChange={handleTypeSelect}
              onSearchChange={setSearchQuery}
              categories={categories}
            />
            <ResourceList
              key={refreshKey}
              categoryId={selectedCategory}
              type={selectedType}
              searchQuery={searchQuery}
            />
          </>
        )}
      </main>

      {showCategoryManager && (
        <CategoryManager
          open={showCategoryManager}
          onClose={() => {
            setShowCategoryManager(false);
            fetchCategories();
          }}
        />
      )}

      {showAddResource && (
        <AddResourceDialog
          open={showAddResource}
          onClose={handleResourceAdded}
          onSuccess={handleResourceSuccess}
          categories={categories}
        />
      )}
    </div>
  );
}

export default App;
