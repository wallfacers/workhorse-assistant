/** A single node in the real file tree (loaded from fsList). */
export interface RealFileNode {
  /** Display name (e.g., "App.tsx"). */
  name: string;
  /** Absolute path on disk. */
  path: string;
  /** File or folder. */
  kind: 'file' | 'folder';
  /** Whether this folder's children have been loaded. Always false for files. */
  loaded: boolean;
  /** Whether children are currently being fetched. */
  loading: boolean;
  /** Child nodes (populated after lazy-load). */
  children: RealFileNode[];
}
