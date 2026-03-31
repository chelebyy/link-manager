export interface Category {
  id: number;
  name: string;
  color: string;
  icon: string;
  type: string;
  created_at: string;
  updated_at: string;
}

export type ResourceType = string;

export interface ResourceTypeDefinition {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string | null;
  is_builtin: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Resource {
  id: number;
  category_id: number | null;
  type: string;
  title: string;
  url: string | null;
  description: string | null;
  metadata: Record<string, any>;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

export interface ResourceSyncState {
  resource_id: number;
  github_id: number | null;
  github_owner: string;
  github_repo: string;
  github_full_name: string;
  last_commit_sha: string | null;
  last_commit_date: string | null;
  last_commit_message: string | null;
  last_commit_author: string | null;
  last_release_tag: string | null;
  last_release_date: string | null;
  last_release_notes: string | null;
  last_tag: string | null;
  last_tag_date: string | null;
  acknowledged_release: string | null;
  release_notification_active: boolean;
  last_sync_at: string | null;
  has_updates: boolean;
}

export interface ResourceWithSync extends Resource {
  sync_state?: ResourceSyncState;
  category?: Category;
}

export interface DashboardStats {
  total_resources: number;
  total_categories: number;
  github_count: number;
  favorites_count: number;
  categories_with_count: (Category & { resource_count: number })[];
}
