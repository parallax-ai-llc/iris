export type ExtensionType = 'ai_tool' | 'workflow_template' | 'integration';
export type ExtensionCategory =
  | 'image_processing'
  | 'video_effects'
  | 'style_transfer'
  | 'filters'
  | 'automation'
  | 'productivity'
  | 'social'
  | 'analytics'
  | 'communication'
  | 'data'
  | 'developer_tools';

export type ExtensionSortOption = 'popular' | 'rating' | 'recent' | 'name';
export type InstallationStatus =
  | 'not_installed'
  | 'installing'
  | 'installed'
  | 'uninstalling'
  | 'updating'
  | 'error';

export interface Extension {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  type: ExtensionType;
  category: ExtensionCategory;
  icon: string | null;
  author: string;
  currentVersion: string;
  downloadCount: number;
  ratingAvg: number;
  ratingCount: number;
  price: number;
  isFeatured: boolean;
  isOfficial: boolean;
  tags: string[];
  isInstalled: boolean;
  createdAt: string;
}

export interface ExtensionVersion {
  id: string;
  version: string;
  changelog: string | null;
  createdAt: string;
}

export interface ExtensionDetail extends Extension {
  description: string;
  coverImage: string | null;
  authorUrl: string | null;
  metadata: unknown;
  versions: ExtensionVersion[];
  updatedAt: string;
}

export interface ExtensionReview {
  id: string;
  extensionId: string;
  rating: number;
  title: string | null;
  content: string | null;
  user: {
    id: string;
    name: string | null;
    profileImageThumbnail: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface InstalledExtension {
  id: string;
  extensionId: string;
  version: string;
  isEnabled: boolean;
  installedAt: string;
  extension: Extension;
}

export interface ExtensionListResponse {
  items: Extension[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ReviewListResponse {
  items: ExtensionReview[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ExtensionQueryParams {
  type?: ExtensionType;
  category?: string;
  search?: string;
  sort?: ExtensionSortOption;
  page?: number;
  limit?: number;
  featured?: boolean;
  tag?: string;
}

/**
 * Manifest payload the server stored alongside an uploaded .iex bundle
 * (`iris-extension.json` contents). Only the fields the desktop client needs
 * are typed; the runtime extension id is `id`, or `publisher.name` when absent.
 */
export interface ExtensionBundleManifest {
  id?: string;
  name?: string;
  publisher?: string;
  version?: string;
  [key: string]: unknown;
}

/** `GET /extensions/:id/bundle` response — download info for the .iex bundle. */
export interface ExtensionBundleInfo {
  id: string;
  bundleUrl: string | null;
  permissions: string[];
  engineVersion: string | null;
  manifestData: ExtensionBundleManifest | null;
}

/** `POST /extensions/my/:id/bundle` 200 response. */
export interface ExtensionBundleUploadResult {
  bundleUrl: string;
  version: string;
  status: string;
}

/** Envelope for bundle uploads — the error message is surfaced in the submit UI. */
export interface ExtensionBundleUploadResponse {
  success: boolean;
  data?: ExtensionBundleUploadResult;
  error?: string;
  statusCode?: number;
}

export type ReportReason = 'spam' | 'inappropriate' | 'misleading' | 'other';

export interface ExtensionSubmitData {
  name: string;
  slug?: string;
  description: string;
  shortDescription?: string;
  type: ExtensionType;
  category: ExtensionCategory;
  icon?: string;
  tags?: string[];
  price?: number;
}

export interface ExtensionUpdateData extends Partial<ExtensionSubmitData> {}

export interface ReportData {
  reason: ReportReason;
  description?: string;
}
