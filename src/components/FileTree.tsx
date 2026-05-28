import { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, File } from 'lucide-react';
import type { FileNode } from './right-panel.mock';

function TreeNode({ node, depth = 0 }: { node: FileNode; depth?: number }) {
  const [expanded, setExpanded] = useState(false);
  const isFolder = node.kind === 'folder';

  return (
    <div>
      <button
        className="w-full flex items-center gap-1.5 py-1 px-1 rounded-lg hover:bg-gray-200/40 dark:hover:bg-neutral-800/50 text-gray-700 dark:text-gray-400 transition-colors text-[12.5px]"
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={() => isFolder && setExpanded(!expanded)}
        aria-expanded={isFolder ? expanded : undefined}
      >
        {isFolder ? (
          expanded ? (
            <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500" />
          )
        ) : (
          <span className="w-3.5 flex-shrink-0" />
        )}
        {isFolder ? (
          expanded ? (
            <FolderOpen className="w-4 h-4 flex-shrink-0 text-amber-500 dark:text-amber-400" />
          ) : (
            <Folder className="w-4 h-4 flex-shrink-0 text-amber-500 dark:text-amber-400" />
          )
        ) : (
          <File className="w-4 h-4 flex-shrink-0 text-gray-400 dark:text-gray-500" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {isFolder && expanded && node.children && (
        <div>
          {node.children.map((child, i) => (
            <TreeNode key={`${child.name}-${i}`} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FileTree({ nodes }: { nodes: FileNode[] }) {
  return (
    <div className="space-y-0.5">
      {nodes.map((node, i) => (
        <TreeNode key={`${node.name}-${i}`} node={node} />
      ))}
    </div>
  );
}
