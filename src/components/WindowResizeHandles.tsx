import { startWindowResize, type WindowResizeDirection } from '../ipc';

/**
 * Invisible edge/corner grips for a frameless (decorations:false) window.
 * A frameless window has no OS hit-test border, so dragging an edge does
 * nothing until we hand off to the OS resize loop via `startResizeDragging`.
 * Corners come after edges in DOM order so they sit on top (z-order) at the
 * overlaps. Only mount these when the window is not maximized/fullscreen.
 */
const GRIP = 5; // edge thickness, px
const CORNER = 12; // corner square, px

interface Grip {
  dir: WindowResizeDirection;
  style: React.CSSProperties;
  cursor: string;
}

const GRIPS: Grip[] = [
  { dir: 'North', cursor: 'ns-resize', style: { top: 0, left: 0, right: 0, height: GRIP } },
  { dir: 'South', cursor: 'ns-resize', style: { bottom: 0, left: 0, right: 0, height: GRIP } },
  { dir: 'West', cursor: 'ew-resize', style: { top: 0, bottom: 0, left: 0, width: GRIP } },
  { dir: 'East', cursor: 'ew-resize', style: { top: 0, bottom: 0, right: 0, width: GRIP } },
  { dir: 'NorthWest', cursor: 'nwse-resize', style: { top: 0, left: 0, width: CORNER, height: CORNER } },
  { dir: 'NorthEast', cursor: 'nesw-resize', style: { top: 0, right: 0, width: CORNER, height: CORNER } },
  { dir: 'SouthWest', cursor: 'nesw-resize', style: { bottom: 0, left: 0, width: CORNER, height: CORNER } },
  { dir: 'SouthEast', cursor: 'nwse-resize', style: { bottom: 0, right: 0, width: CORNER, height: CORNER } },
];

export default function WindowResizeHandles() {
  return (
    <>
      {GRIPS.map((g) => (
        <div
          key={g.dir}
          onMouseDown={(e) => {
            // Only the primary button starts a resize; let other buttons pass.
            if (e.button !== 0) return;
            e.preventDefault();
            void startWindowResize(g.dir);
          }}
          className="fixed z-50"
          style={{ ...g.style, cursor: g.cursor }}
        />
      ))}
    </>
  );
}
