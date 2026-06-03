import { lazy, Suspense, useMemo, useRef, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CategoryGrid } from "./components/CategoryGrid/CategoryGrid";
import { TypeCategories } from "./components/TypeCategories/TypeCategories";
import { Button } from "./components/ui/button";
import {
  Plus,
  Settings,
  LayoutGrid,
  Download,
  Upload,
  FileText,
  Menu,
} from "lucide-react";
import { MobileMenu } from "./components/MobileMenu";
import { GlobalSearchPanel } from "./components/GlobalSearchPanel";
import { ToastBanner, type ToastItem } from "./components/ui/toast-banner";
import type { ExportPayload, ResourceWithSync } from "./types";
import { api, ApiError } from "./lib/api";
import { getIcon } from "./lib/icon-map";
import { queryKeys } from "./lib/query-keys";
import {
  buildExportFilename,
  buildFullExportMarkdown,
  buildSelectedViewMarkdown,
  downloadJson,
  downloadMarkdown,
  sortCategoriesAlphabetically,
  type ResourceFilterMode,
} from "./lib/resource-view";

const AddResourceDialog = lazy(() =>
  import("./components/AddResourceDialog/AddResourceDialog").then((module) => ({
    default: module.AddResourceDialog,
  })),
);
const CategoryManager = lazy(() =>
  import("./components/CategoryManager/CategoryManager").then((module) => ({
    default: module.CategoryManager,
  })),
);
const ResourceList = lazy(() =>
  import("./components/ResourceList/ResourceList").then((module) => ({
    default: module.ResourceList,
  })),
);
const ResourceTypeManager = lazy(() =>
  import("./components/ResourceTypeManager").then((module) => ({
    default: module.ResourceTypeManager,
  })),
);
const GithubIcon = getIcon("Github");

const LazyPanelFallback = () => (
  <div className="rounded-sm border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
    Yükleniyor...
  </div>
);

function useDebouncedValue(value: string, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(
      () => setDebouncedValue(value),
      delayMs,
    );
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debouncedValue;
}

function App() {
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showResourceTypeManager, setShowResourceTypeManager] = useState(false);
  const [showAddResource, setShowAddResource] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [resourceFilterMode, setResourceFilterMode] =
    useState<ResourceFilterMode>("all");
  const [visibleResources, setVisibleResources] = useState<ResourceWithSync[]>(
    [],
  );
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const importRef = useRef<HTMLInputElement | null>(null);
  const debouncedGlobalSearchQuery = useDebouncedValue(
    globalSearchQuery.trim(),
    250,
  );
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories(),
    queryFn: () => api.getCategories(),
  });

  const resourceTypesQuery = useQuery({
    queryKey: queryKeys.resourceTypes(),
    queryFn: api.getResourceTypes,
  });

  const globalResultsQuery = useQuery({
    queryKey: queryKeys.globalResources(debouncedGlobalSearchQuery),
    queryFn: () => api.getResources({ search: debouncedGlobalSearchQuery }),
    enabled: debouncedGlobalSearchQuery.length > 0,
  });

  const categories = useMemo(
    () => sortCategoriesAlphabetically(categoriesQuery.data ?? []),
    [categoriesQuery.data],
  );
  const resourceTypes = resourceTypesQuery.data ?? [];
  const globalResults = globalResultsQuery.data ?? [];

  const isLoading = categoriesQuery.isLoading || resourceTypesQuery.isLoading;

  const showToast = (
    kind: ToastItem["kind"],
    title: string,
    description?: string,
  ) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, kind, title, description }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4000);
  };

  const dismissToast = (id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode((current) => {
      const next = !current;
      if (!next) {
        setSelectedIds(new Set());
      }
      return next;
    });
  };

  const handleCategorySelect = (categoryId: number | null) => {
    setSelectedCategory(categoryId);
  };

  const handleTypeSelect = (type: string | null) => {
    setSelectedType(type);
    setSelectedCategory(null);
    setSearchQuery("");
    setGlobalSearchQuery("");
    setResourceFilterMode("all");
  };

  const handleCategoryOpenFromSearch = (type: string, categoryId: number) => {
    setSelectedType(type);
    setSelectedCategory(categoryId);
    setSearchQuery("");
    setGlobalSearchQuery("");
  };

  const handleResourceAdded = () => {
    setShowAddResource(false);
  };

  const handleResourceSuccess = (type: string) => {
    setSelectedType(type);
    setSelectedCategory(null);
    setSearchQuery("");
    setResourceFilterMode("all");
  };

  const handleExport = async () => {
    try {
      const data = await api.exportData();
      downloadJson(
        `link-manager-export-${new Date().toISOString().slice(0, 10)}.json`,
        data,
      );
      showToast("success", "Export tamamlandı");
    } catch {
      showToast("error", "Export başarısız", "Beklenmeyen bir hata oluştu.");
    }
  };

  const handleMarkdownExport = async () => {
    try {
      const data = await api.exportData();
      const markdown = buildFullExportMarkdown({
        exportedAt: data.exported_at,
        resourceTypes: data.resourceTypes,
        categories: sortCategoriesAlphabetically(data.categories),
        resources: data.resources,
      });

      downloadMarkdown(
        buildExportFilename("link-manager-export-all"),
        markdown,
      );
      showToast("success", "Markdown export hazır");
    } catch {
      showToast(
        "error",
        "Markdown export başarısız",
        "Beklenmeyen bir hata oluştu.",
      );
    }
  };

  const handleCurrentViewMarkdownExport = () => {
    if (!selectedTypeConfig) {
      showToast("error", "Görünüm export için önce bir kart seçin");
      return;
    }

    // Eğer seçim modundaysa sadece seçili kaynakları indir
    if (isSelectionMode && selectedIds.size > 0) {
      const selectedResources = visibleResources.filter((r) =>
        selectedIds.has(r.id),
      );
      const markdown = buildSelectedViewMarkdown({
        typeLabel: selectedTypeConfig.name,
        selectedCategoryName: selectedCategory
          ? (categories.find((category) => category.id === selectedCategory)
              ?.name ?? null)
          : null,
        searchQuery,
        filterMode: resourceFilterMode,
        resources: selectedResources,
      });

      downloadMarkdown(
        buildExportFilename(`link-manager-${selectedTypeConfig.id}-secili`),
        markdown,
      );
      showToast("success", `${selectedIds.size} kaynak indirildi`);
      return;
    }

    const selectedCategoryName = selectedCategory
      ? (categories.find((category) => category.id === selectedCategory)
          ?.name ?? null)
      : null;

    const markdown = buildSelectedViewMarkdown({
      typeLabel: selectedTypeConfig.name,
      selectedCategoryName,
      searchQuery,
      filterMode: resourceFilterMode,
      resources: visibleResources,
    });

    downloadMarkdown(
      buildExportFilename(`link-manager-${selectedTypeConfig.id}-view`),
      markdown,
    );
    showToast("success", "Görünüm Markdown indirildi");
  };

  const importMutation = useMutation({
    mutationFn: (payload: ExportPayload) => api.importData(payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.categories() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.resourceTypes() }),
        queryClient.invalidateQueries({ queryKey: ["resources"] }),
      ]);
      showToast("success", "Import tamamlandı");
    },
    onError: (error) => {
      const message =
        error instanceof ApiError ? error.message : "Dosya içeriği işlenemedi.";
      showToast("error", message);
    },
  });

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const payload = JSON.parse(text) as ExportPayload;

      try {
        await importMutation.mutateAsync(payload);
      } catch {
        return;
      }
    } catch {
      showToast("error", "Import başarısız", "Geçerli bir JSON dosyası seçin.");
    } finally {
      event.target.value = "";
    }
  };

  const queryLoadError =
    categoriesQuery.error instanceof ApiError
      ? categoriesQuery.error
      : resourceTypesQuery.error instanceof ApiError
        ? resourceTypesQuery.error
        : globalResultsQuery.error instanceof ApiError
          ? globalResultsQuery.error
          : null;

  const selectedTypeConfig = selectedType
    ? resourceTypes.find((t) => t.id === selectedType)
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
            <GithubIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
            <h1
              className="font-mono text-lg sm:text-xl font-semibold cursor-pointer hover:text-primary transition-colors truncate"
              onClick={() => {
                setSelectedType(null);
                setSelectedCategory(null);
                setSearchQuery("");
              }}
            >
              Link Manager
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1 sm:gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-sm border-border font-mono text-xs shrink-0"
                onClick={handleExport}
                aria-label="Export data"
              >
                <Download className="h-3 w-3 mr-1.5" aria-hidden="true" />
                <span>Export</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-sm border-border font-mono text-xs shrink-0"
                onClick={handleMarkdownExport}
                aria-label="Download all data as Markdown"
              >
                <FileText className="h-3 w-3 mr-1.5" aria-hidden="true" />
                <span>MD Tümü</span>
              </Button>
              {selectedType ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-sm border-border font-mono text-xs shrink-0"
                  onClick={handleCurrentViewMarkdownExport}
                  aria-label="Download current view as Markdown"
                >
                  <Download className="h-3 w-3 mr-1.5" aria-hidden="true" />
                  <span>MD Görünüm</span>
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                className="rounded-sm border-border font-mono text-xs shrink-0"
                onClick={() => importRef.current?.click()}
                aria-label="Import data"
              >
                <Upload className="h-3 w-3 mr-1.5" aria-hidden="true" />
                <span>Import</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-sm border-border font-mono text-xs shrink-0"
                onClick={() => setShowResourceTypeManager(true)}
                aria-label="Manage resource type cards"
              >
                <LayoutGrid className="h-3 w-3 mr-1.5" aria-hidden="true" />
                <span>Kartlar</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-sm border-border font-mono text-xs shrink-0"
                onClick={() => setShowCategoryManager(true)}
                aria-label="Manage categories"
              >
                <Settings className="h-3 w-3 mr-1.5" aria-hidden="true" />
                <span>Kategoriler</span>
              </Button>
              <Button
                size="sm"
                className="rounded-sm font-mono text-xs shrink-0"
                onClick={() => setShowAddResource(true)}
                aria-label="Add new resource"
              >
                <Plus className="h-3 w-3 mr-1.5" aria-hidden="true" />
                <span>Ekle</span>
              </Button>
            </div>

            <div className="sm:hidden">
              <MobileMenu
                trigger={<Menu className="h-5 w-5" />}
                items={[
                  {
                    id: "export",
                    label: "Export",
                    icon: <Download className="h-4 w-4" />,
                    onClick: handleExport,
                  },
                  {
                    id: "md-all",
                    label: "MD Tümü",
                    icon: <FileText className="h-4 w-4" />,
                    onClick: handleMarkdownExport,
                  },
                  ...(selectedType
                    ? [
                        {
                          id: "md-view",
                          label: "MD Görünüm",
                          icon: <Download className="h-4 w-4" />,
                          onClick: handleCurrentViewMarkdownExport,
                        },
                      ]
                    : []),
                  {
                    id: "import",
                    label: "Import",
                    icon: <Upload className="h-4 w-4" />,
                    onClick: () => importRef.current?.click(),
                  },
                  {
                    id: "cards",
                    label: "Kartlar",
                    icon: <LayoutGrid className="h-4 w-4" />,
                    onClick: () => setShowResourceTypeManager(true),
                  },
                  {
                    id: "categories",
                    label: "Kategoriler",
                    icon: <Settings className="h-4 w-4" />,
                    onClick: () => setShowCategoryManager(true),
                  },
                ]}
              />
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-6 pb-24 sm:pb-6">
        {queryLoadError ? (
          <div className="mb-6 rounded-sm border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <strong className="mr-2">Veri yüklenemedi:</strong>
            {queryLoadError.message}
          </div>
        ) : null}

        {isLoading ? (
          <div className="space-y-8">
            <div className="h-24 rounded-lg bg-muted animate-pulse" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={`skeleton-${i}`}
                  className="h-32 rounded-lg bg-muted animate-pulse"
                />
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
              globalResultsQuery={globalResultsQuery}
              onOpenType={handleTypeSelect}
              onOpenCategory={handleCategoryOpenFromSearch}
            />
            <CategoryGrid
              resourceTypes={
                globalSearchQuery.trim()
                  ? resourceTypes.filter((type) =>
                      [type.name, type.description ?? "", type.id].some(
                        (value) =>
                          value
                            .toString()
                            .toLowerCase()
                            .includes(globalSearchQuery.trim().toLowerCase()),
                      ),
                    )
                  : resourceTypes
              }
              onSelectType={handleTypeSelect}
            />
          </div>
        ) : (
          <TypeCategories
            typeLabel={selectedTypeConfig?.name || selectedType}
            typeColor={selectedTypeConfig?.color || "#6366f1"}
            categories={selectedTypeCategories}
            selectedCategory={selectedCategory}
            searchQuery={searchQuery}
            resourceFilterMode={resourceFilterMode}
            onSelectCategory={handleCategorySelect}
            onSearchChange={setSearchQuery}
            onResourceFilterChange={setResourceFilterMode}
            onBack={() => {
              setSelectedType(null);
              setSelectedCategory(null);
              setSearchQuery("");
              setResourceFilterMode("all");
              setIsSelectionMode(false);
              setSelectedIds(new Set());
            }}
            isSelectionMode={isSelectionMode}
            onToggleSelectionMode={toggleSelectionMode}
          >
            <Suspense fallback={<LazyPanelFallback />}>
              <ResourceList
                key={isSelectionMode ? "selection-mode" : "browse-mode"}
                categoryId={selectedCategory}
                type={selectedType}
                searchQuery={searchQuery}
                resourceFilterMode={resourceFilterMode}
                onVisibleResourcesChange={setVisibleResources}
                onNotify={showToast}
                isSelectionMode={isSelectionMode}
                onToggleSelectionMode={toggleSelectionMode}
                onSelectionChange={setSelectedIds}
              />
            </Suspense>
          </TypeCategories>
        )}
      </main>

      {showCategoryManager && (
        <Suspense fallback={<LazyPanelFallback />}>
          <CategoryManager
            open={showCategoryManager}
            selectedType={selectedType}
            onNotify={showToast}
            onClose={() => {
              setShowCategoryManager(false);
            }}
          />
        </Suspense>
      )}

      {showResourceTypeManager && (
        <Suspense fallback={<LazyPanelFallback />}>
          <ResourceTypeManager
            open={showResourceTypeManager}
            onNotify={showToast}
            onClose={() => {
              setShowResourceTypeManager(false);
            }}
          />
        </Suspense>
      )}

      {showAddResource && (
        <Suspense fallback={<LazyPanelFallback />}>
          <AddResourceDialog
            open={showAddResource}
            onClose={handleResourceAdded}
            onSuccess={handleResourceSuccess}
            onNotify={showToast}
            categories={categories}
            selectedType={selectedType}
            resourceTypes={resourceTypes}
          />
        </Suspense>
      )}

      <input
        ref={importRef}
        type="file"
        accept="application/json"
        onChange={handleImport}
        className="hidden"
      />

      <button
        type="button"
        onClick={() => setShowAddResource(true)}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:opacity-90 active:opacity-80 transition-opacity sm:hidden"
        aria-label="Yeni kaynak ekle"
      >
        <Plus className="h-6 w-6" />
      </button>
    </div>
  );
}

export default App;
