interface MonoPathProps {
  /** The full path string. Always surfaced via `title` for hover preview. */
  path: string;
  /**
   * `inline` (default): single line, truncates with ellipsis when constrained.
   * Pair with a flex parent that has `min-w-0`.
   *
   * `block`: wraps onto multiple lines using `break-all`. Use inside dedicated
   * "file location" cards where the full path should remain visible.
   */
  variant?: 'inline' | 'block';
  className?: string;
}

/**
 * Renders a filesystem / arXiv / hash-style string in the project's standard
 * monospace style. Centralised so any future overflow tweak (e.g. CJK-aware
 * truncation, copy-button affordance) only changes here.
 */
export default function MonoPath({
  path,
  variant = 'inline',
  className = '',
}: MonoPathProps) {
  const base = 'font-mono select-all';

  if (variant === 'block') {
    return (
      <span
        title={path}
        className={`${base} break-all leading-normal ${className}`}
      >
        {path}
      </span>
    );
  }

  return (
    <span
      title={path}
      className={`${base} block min-w-0 truncate ${className}`}
    >
      {path}
    </span>
  );
}
