import { useState, useCallback } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, File, Loader2 } from 'lucide-react';
import type { RealFileNode } from './types';
import type { ContextMenuState } from './TreeContextMenu';
import TreeContextMenu from './TreeContextMenu';
import { fsList, fsRename } from '../../ipc';
import { useToast } from '../ToastProvider';
import { useTranslation } from 'react-i18next';

interface FileTreeProps {
  nodes: RealFileNode[];
  onOpenFile: (filePath: string) => void;
  onRefresh: () => void;
}

/**
 * Recursive tree node with lazy-load, context menu rename, and file open.
 */
function TreeNode({
  node,
  depth,
  onOpenFile,
  onNodeUpdated,
}: {
  node: RealFileNode;
  depth: number;
  onOpenFile: (filePath: string) => void;
  onNodeUpdated: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<RealFileNode[]>(node.children);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(node.loaded);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.name);

  const isFolder = node.kind === 'folder';

  const handleToggle = useCallback(async () => {
    if (!isFolder) return;
    if (!expanded && !loaded) {
      setLoading(true);
      const result = await fsList(node.path);
      if (result.ok) {
        const childNodes: RealFileNode[] = result.value.entries.map((e) => ({
          name: e.name,
          path: e.path,
          kind: e.isDir ? 'folder' as const : 'file' as const,
          loaded: false,
          loading: false,
          children: [],
        }));
        // Sort: folders first, then alphabetical.
        childNodes.sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        setChildren(childNodes);
        setLoaded(true);
      }
      setLoading(false);
    }
    setExpanded(!expanded);
  }, [expanded, loaded, isFolder, node.path]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      nodePath: node.path,
      nodeName: node.name,
      nodeKind: node.kind,
    });
  }, [node.path, node.name, node.kind]);

  const handleRename = useCallback(async () => {
    const newName = renameValue.trim();
    if (!newName || newName === node.name) {
      setRenaming(false);
      setRenameValue(node.name);
      return;
    }
    const separator = node.path.includes('\\') ? '\\' : '/';
    const parentPath = node.path.slice(0, node.path.lastIndexOf(separator));
    const newPath = parentPath + separator + newName;
    const result = await fsRename(node.path, newPath);
    if (result.ok) {
      node.path = newPath;
      node.name = newName;
      onNodeUpdated();
    } else {
      toast({ level: 'error', message: t('fileTree.renameFailed', { error: result.error.message }) });
      setRenameValue(node.name);
    }
    setRenaming(false);
  }, [renameValue, node, onNodeUpdated, toast, t]);

  return (
    <div>
      <div
        className="w-full flex items-center gap-1.5 py-1 px-1 rounded-md hover:bg-canvas/40 dark:hover:bg-surface-dark-muted/50 text-on-surface dark:text-on-canvas-dark-muted transition-colors text-[12.5px] cursor-pointer group"
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={() => isFolder ? handleToggle() : onOpenFile(node.path)}
        onContextMenu={handleContextMenu}
        role="treeitem"
        aria-expanded={isFolder ? expanded : undefined}
      >
        {isFolder ? (
          loading ? (
            <Loader2 className="w-3.5 h-3.5 flex-shrink-0 animate-spin text-on-surface-muted dark:text-on-canvas-dark-muted" />
          ) : expanded ? (
            <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-on-surface-muted dark:text-on-canvas-dark-muted" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 text-on-surface-muted dark:text-on-canvas-dark-muted" />
          )
        ) : (
          <span className="w-3.5 flex-shrink-0" />
        )}
        {isFolder ? (
          expanded ? (
            <FolderOpen className="w-4 h-4 flex-shrink-0 text-warning dark:text-warning" />
          ) : (
            <Folder className="w-4 h-4 flex-shrink-0 text-warning dark:text-warning" />
          )
        ) : (
          <File className="w-4 h-4 flex-shrink-0 text-on-surface-muted dark:text-on-canvas-dark-muted" />
        )}
        {renaming ? (
          <input
            type="text"
            className="flex-1 min-w-0 px-1 py-0 text-[12px] bg-surface dark:bg-surface-dark-elevated border border-outline dark:border-outline-dark rounded-sm outline-none focus:border-primary"
            value={renameValue}
            autoFocus
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); void handleRename(); }
              if (e.key === 'Escape') { setRenaming(false); setRenameValue(node.name); }
            }}
            onBlur={() => void handleRename()}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="truncate">{node.name}</span>
        )}
      </div>
      {isFolder && expanded && loaded && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onOpenFile={onOpenFile}
              onNodeUpdated={onNodeUpdated}
            />
          ))}
        </div>
      )}
      {contextMenu && (
        <TreeContextMenu
          menu={contextMenu}
          onRename={(_path, _name) => { setRenaming(true); setRenameValue(node.name); }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

export default function FileTree({ nodes, onOpenFile, onRefresh }: FileTreeProps) {
  // Trigger a re-render when nodes change (rename updates node.name in place).
  const [, setTick] = useState(0);
  const handleNodeUpdated = useCallback(() => {
    onRefresh();
    setTick((t) => t + 1);
  }, [onRefresh]);

  return (
    <div className="space-y-0.5" role="tree">
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          depth={0}
          onOpenFile={onOpenFile}
          onNodeUpdated={handleNodeUpdated}
        />
      ))}
    </div>
  );
}
