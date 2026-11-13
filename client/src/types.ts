export interface PhotoPreview {
  path: string;
  mtimeMs: number;
}

export interface FolderEntry {
  name: string;
  path: string;
  photoCount: number;
  /** A handful of photos from the folder (or its subfolders) for the tile mosaic. */
  previews: PhotoPreview[];
  /** Extra line under the photo count, e.g. who shared the album. */
  subtitle?: string | undefined;
  /** One of the user's own albums that they have shared with others. */
  shared?: boolean | undefined;
  /** For albums shared with the user: whether photos can be dropped into them. Unset means "same as the page". */
  writable?: boolean | undefined;
}

export interface PhotoEntry {
  name: string;
  path: string;
  mtimeMs: number;
  birthtimeMs: number;
  /** EXIF capture time as written by the camera ("2024:05:01 12:34:56", no timezone), if present. */
  takenAt?: string | undefined;
  size: number;
}

export interface BrowseResult {
  path: string;
  parentPath: string | null;
  folders: FolderEntry[];
  photos: PhotoEntry[];
  /** Present when this folder belongs to someone else's share or a public link rather than the user's own library. */
  scope?: ShareScope;
}

export interface ShareScope {
  kind: "shared" | "public";
  /** Name of the shared album. */
  name: string;
  ownerName: string;
  canWrite: boolean;
}

/** An album another user has shared with the signed-in user. */
export interface SharedFolder {
  name: string;
  /** Where it lives in the client's folder paths, e.g. ".shared/12". */
  path: string;
  photoCount: number;
  previews: PhotoPreview[];
  ownerName: string;
  canWrite: boolean;
}

/** Who one of the user's own albums is shared with. */
export interface ShareState {
  users: { id: number; username: string; canWrite: boolean }[];
  public: { id: number; token: string } | null;
}

export interface PhotoInfo {
  file: {
    name: string;
    path: string;
    size: number;
    mimeType: string;
    modifiedMs: number;
    createdMs: number;
  };
  image: {
    format?: string | undefined;
    /** Displayed dimensions, i.e. after applying EXIF orientation. */
    width?: number | undefined;
    height?: number | undefined;
    orientation?: number | undefined;
    colorSpace?: string | undefined;
    channels?: number | undefined;
    bitDepth?: number | undefined;
    hasAlpha?: boolean | undefined;
    density?: number | undefined;
    iccProfile?: string | undefined;
    pages?: number | undefined;
  };
  compression: {
    method?: string | undefined;
    estimatedQuality?: number | undefined;
    chromaSubsampling?: string | undefined;
    progressive?: boolean | undefined;
    interlaced?: boolean | undefined;
    bitsPerPixel?: number | undefined;
  };
  location: { latitude: number; longitude: number; altitude?: number | undefined } | null;
  /** Every embedded EXIF/GPS/IPTC/XMP/ICC tag, keyed by tag name. */
  metadata: Record<string, string | number | boolean>;
}

export interface AuthUser {
  id: number;
  username: string;
  role: "admin" | "user";
}

export interface AuthStatus {
  /** True on a fresh install: the first account created becomes the administrator. */
  setupRequired: boolean;
  signupsEnabled: boolean;
  user: AuthUser | null;
}

export interface AdminUser {
  id: number;
  username: string;
  role: "admin" | "user";
  status: "active" | "locked";
  createdAt: number;
  lastLoginAt: number | null;
}

export interface UploadSummary {
  uploaded: number;
  skipped: { name: string; reason: string }[];
}

export interface MoveResult {
  moved: { from: string; to: string }[];
  skipped: { path: string; reason: string }[];
}

export interface DeleteResult {
  deleted: string[];
  skipped: { path: string; reason: string }[];
}

export interface CopyResult {
  copied: { from: string; to: string }[];
  skipped: { path: string; reason: string }[];
}
