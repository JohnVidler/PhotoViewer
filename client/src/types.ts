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
}

export interface PhotoEntry {
  name: string;
  path: string;
  mtimeMs: number;
  birthtimeMs: number;
  size: number;
}

export interface BrowseResult {
  path: string;
  parentPath: string | null;
  folders: FolderEntry[];
  photos: PhotoEntry[];
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
