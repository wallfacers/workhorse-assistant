import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import type { Group as GroupType, LayoutNode } from './workspaceReducer';
import { flattenLeaves } from './workspaceReducer';
import PaneCard from './PaneCard';

interface TerminalGroupProps {
  group: GroupType;
  onSplitPane: (paneId: string, direction: 'row' | 'column') => void;
  onClosePane: (paneId: string) => void;
  onActivatePane: (paneId: string) => void;
  onPaneTitle: (paneId: string, title: string) => void;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function rectsEqual(
  a: Record<string, Rect>,
  b: Record<string, Rect>,
): boolean {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  for (const k of ak) {
    const x = a[k];
    const y = b[k];
    if (
      !y ||
      x.left !== y.left ||
      x.top !== y.top ||
      x.width !== y.width ||
      x.height !== y.height
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Renders a group as two decoupled layers:
 *
 *  - **Geometry layer** — the resizable split tree (`Group`/`Panel`/
 *    `Separator`) whose leaves are *empty* placeholder boxes. This layer is
 *    free to restructure (and remount) on every split/close.
 *  - **Terminal layer** — a flat, stably-keyed list of `<PaneCard>`s (each
 *    owning one live `<Terminal>`), absolutely positioned over the placeholder
 *    boxes. Because every terminal is a sibling under one parent that is never
 *    restructured, splitting/closing/resizing never remounts a surviving pane,
 *    so its PTY session is preserved — including the pane being split, which a
 *    terminal-in-tree layout would otherwise restart when its `<Panel>` becomes
 *    a `<Group>`.
 *
 * The flat layer is `pointer-events-none`; only the cards are
 * `pointer-events-auto`, so the gaps between cards leave the underlying
 * `Separator` drag handles reachable.
 */
export default function TerminalGroup({
  group,
  onSplitPane,
  onClosePane,
  onActivatePane,
  onPaneTitle,
}: TerminalGroupProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const placeholderRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [rects, setRects] = useState<Record<string, Rect>>({});

  const leaves = flattenLeaves(group.layout);
  const paneIds = leaves.map((p) => p.id);

  const register = useCallback((id: string, el: HTMLElement | null) => {
    if (el) placeholderRefs.current.set(id, el);
    else placeholderRefs.current.delete(id);
  }, []);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const base = container.getBoundingClientRect();
    const next: Record<string, Rect> = {};
    for (const [id, el] of placeholderRefs.current) {
      const r = el.getBoundingClientRect();
      next[id] = {
        left: r.left - base.left,
        top: r.top - base.top,
        width: r.width,
        height: r.height,
      };
    }
    setRects((prev) => (rectsEqual(prev, next) ? prev : next));
  }, []);

  // Re-measure after every commit: catches structural and position-only shifts
  // (e.g. a sibling moving without changing size) that a ResizeObserver misses.
  // Guarded by `rectsEqual`, so it converges in one extra pass with no loop.
  useLayoutEffect(() => {
    measure();
  });

  // Continuous re-measure during divider drags, container resizes, and the
  // hidden→shown tab transition. Re-bound when the set of panes changes so new
  // placeholders are observed.
  const idsKey = paneIds.join('|');
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(container);
    for (const el of placeholderRefs.current.values()) ro.observe(el);
    return () => ro.disconnect();
  }, [idsKey, measure]);

  // Render one child slot of a parent `<Group>`. v4 only treats *direct* Group
  // children carrying `data-panel` as resizable (it scans `group.children` for
  // that attribute), so a nested split must live *inside* a `<Panel>` — a bare
  // `<Group>` placed beside its siblings is ignored by the layout engine and
  // collapses to zero size, which is why deeper splits used to vanish.
  const renderChild = useCallback(
    (node: LayoutNode): ReactNode => {
      if (node.kind === 'pane') {
        return (
          <Panel id={node.id} key={node.id} minSize={10}>
            <div
              ref={(el) => register(node.id, el)}
              className="h-full w-full"
            />
          </Panel>
        );
      }
      const orientation = node.direction === 'row' ? 'horizontal' : 'vertical';
      // The inner Group needs an id distinct from the wrapping Panel's: both
      // write their id to the DOM `id` attribute, so reusing `node.id` would
      // emit a duplicate. Group already defaults to 100% × 100%.
      return (
        <Panel id={node.id} key={node.id} minSize={10}>
          <Group id={`${node.id}:group`} orientation={orientation}>
            {renderChild(node.children[0])}
            <Separator className="separator-handle" />
            {renderChild(node.children[1])}
          </Group>
        </Panel>
      );
    },
    [register],
  );

  const root = group.layout;

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {/* Geometry layer: resizable placeholders + separators, no terminals. */}
      <div className="absolute inset-1.5">
        {root.kind === 'pane' ? (
          // Single pane: a bare placeholder — `<Panel>` needs a `<Group>`
          // ancestor (group context) and a lone pane has nothing to resize.
          <div ref={(el) => register(root.id, el)} className="h-full w-full" />
        ) : (
          // Root split: the top-level Group is rendered directly (it has no
          // parent Group, so it must not be wrapped in a Panel).
          <Group
            id={root.id}
            orientation={root.direction === 'row' ? 'horizontal' : 'vertical'}
          >
            {renderChild(root.children[0])}
            <Separator className="separator-handle" />
            {renderChild(root.children[1])}
          </Group>
        )}
      </div>

      {/* Terminal layer: flat, stably-keyed cards positioned over placeholders. */}
      <div className="pointer-events-none absolute inset-0">
        {leaves.map((pane) => {
          const r = rects[pane.id];
          const style: CSSProperties = {
            position: 'absolute',
            left: r?.left ?? 0,
            top: r?.top ?? 0,
            width: r?.width ?? 0,
            height: r?.height ?? 0,
          };
          return (
            <div key={pane.id} style={style} className="pointer-events-auto">
              <PaneCard
                node={pane}
                isActive={pane.id === group.activePaneId}
                totalPanes={leaves.length}
                onSplit={(dir) => onSplitPane(pane.id, dir)}
                onClose={() => onClosePane(pane.id)}
                onActivate={() => onActivatePane(pane.id)}
                onTitle={onPaneTitle}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
