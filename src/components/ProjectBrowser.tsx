import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, CornerLeftUp, Folder } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fsList, type FsEntry } from '../ipc';

/**
 * Sidecar-namespace folder browser (add-wsl-remote C1b). Navigates directories
 * via `GET /v1/fs/list` and lets the user pick one as the project workdir. The
 * paths are the sidecar's namespace (e.g. WSL POSIX paths for a remote sidecar),
 * not host paths — there is deliberately no native OS folder dialog.
 *
 * Starts at the sidecar's `default_workdir` (an empty `fsList()` defaults there).
 */

/** Parent of a sidecar path, handling POSIX and Windows separators. `null` at a
 *  root (nothing above to navigate to). */
function parentOf(path: string): string | null {
  const trimmed = path.replace(/[/\\]+$/, '');
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  if (idx < 0) return null;
  if (idx === 0) return '/'; // POSIX root
  const parent = trimmed.slice(0, idx);
  // Keep a Windows drive root navigable (`C:` → `C:\`).
  return /^[A-Za-z]:$/.test(parent) ? `${parent}\\` : parent;
}

export default function ProjectBrowser({
  onPick,
  initialPath,
}: {
  onPick: (path: string) => void;
  /** When set, the initial `load()` starts at this directory instead of the
   *  sidecar's default workdir. Used by the agent confirm flow to pre-fill the
   *  picker with the candidate path. Manual open passes nothing → unchanged. */
  initialPath?: string;
}) {
  const { t } = useTranslation();
  const [path, setPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (target?: string) => {
    setLoading(true);
    setError(null);
    const res = await fsList(target);
    setLoading(false);
    if (res.ok) {
      setPath(res.value.path);
      // Only directories are navigable / selectable as a project.
      setEntries(res.value.entries.filter((e) => e.isDir));
    } else {
      setError(res.error.message);
    }
  }, []);

  useEffect(() => {
    void load(initialPath);
  }, [load, initialPath]);

  const parent = path ? parentOf(path) : null;
  const rowClass =
    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] transition-colors hover:bg-surface-muted dark:hover:bg-surface-dark-muted';

  return (
    <div className="w-[320px]">
      <div className="flex items-center gap-1 border-b border-outline/60 px-3 py-1.5 dark:border-neutral-800/60">
        <span className="truncate text-[11.5px] text-gray-500 dark:text-gray-400" title={path ?? ''}>
          {path ?? t('project.loading')}
        </span>
      </div>
      <div className="max-h-[240px] overflow-y-auto custom-scrollbar py-1">
        {parent !== null && (
          <button
            type="button"
            onClick={() => void load(parent)}
            className={`${rowClass} text-gray-600 dark:text-gray-300`}
          >
            <CornerLeftUp className="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
            <span className="truncate">{t('project.parentDir')}</span>
          </button>
        )}
        {loading && (
          <div className="px-3 py-1.5 text-[12px] text-gray-400">{t('project.loading')}</div>
        )}
        {error && (
          <div className="px-3 py-1.5 text-[12px] text-red-500 dark:text-red-400" title={error}>
            {error}
          </div>
        )}
        {!loading && !error && entries.length === 0 && (
          <div className="px-3 py-1.5 text-[12px] text-gray-400">{t('project.noSubfolders')}</div>
        )}
        {entries.map((e) => (
          <button
            key={e.path}
            type="button"
            onClick={() => void load(e.path)}
            title={e.path}
            className={`${rowClass} justify-between text-gray-600 dark:text-gray-300`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <Folder className="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
              <span className="truncate">{e.name}</span>
            </span>
            <ChevronRight className="h-3 w-3 flex-shrink-0 opacity-40" />
          </button>
        ))}
      </div>
      <div className="border-t border-outline/60 px-2 py-1.5 dark:border-neutral-800/60">
        <button
          type="button"
          disabled={!path}
          onClick={() => path && onPick(path)}
          className="flex w-full items-center justify-center gap-2 rounded-sm bg-tertiary px-3 py-1.5 text-[12.5px] font-medium text-on-tertiary transition-colors hover:bg-primary-container hover:text-on-primary-container disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Folder className="h-3.5 w-3.5" />
          <span>{t('project.openThisFolder')}</span>
        </button>
      </div>
    </div>
  );
}
