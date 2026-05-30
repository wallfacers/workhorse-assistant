import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Lightweight markdown renderer for chat messages.
 *
 * Adapts data-talk's markdown streaming approach (partial fence stripping,
 * consistent code block layout) to workhorse's design tokens:
 *   - Code blocks: `font-mono`, dark bg, `rounded-lg`
 *   - Inline code: subtle bg, `rounded`
 *   - Links: secondary colour, underline on hover
 *   - Base size: `text-[12.5px]` (matches AgentRail bubble)
 */

/** Strip partial closing fences during streaming to prevent code-block height jitter.
 *  Ported from data-talk's `stripPartialClosingFence`. */
function stripPartialFences(text: string): string {
  // If the text ends with a line containing only backticks (1-2 chars), it's a
  // partial closing fence that would create an extra line in the code block,
  // then vanish when the real ``` arrives → height jitter. Remove it.
  return text.replace(/\n[`]{1,2}\s*$/u, '\n');
}

interface MarkdownContentProps {
  content: string;
  streaming?: boolean;
}

export default function MarkdownContent({ content, streaming = false }: MarkdownContentProps) {
  const processed = streaming ? stripPartialFences(content) : content;

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // --- Code blocks (fenced) ---
        code({ className, children, ...props }) {
          const isBlock = className?.startsWith('language-') || String(children).includes('\n');
          if (isBlock) {
            return (
              <code
                className={`${className ?? ''} block font-mono text-[11.5px] leading-relaxed`}
                {...props}
              >
                {children}
              </code>
            );
          }
          // Inline code
          return (
            <code
              className="bg-gray-100 dark:bg-neutral-800 px-1 py-0.5 rounded text-[11.5px] font-mono text-gray-700 dark:text-gray-300"
              {...props}
            >
              {children}
            </code>
          );
        },
        // --- Pre blocks (code block wrapper) ---
        pre({ children }) {
          return (
            <pre className="my-2 p-3 rounded-lg bg-gray-900 dark:bg-neutral-900 text-gray-100 overflow-x-auto custom-scrollbar text-[11.5px] leading-relaxed">
              {children}
            </pre>
          );
        },
        // --- Paragraphs ---
        p({ children }) {
          return <p className="mb-2 last:mb-0">{children}</p>;
        },
        // --- Links ---
        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#0b6477] dark:text-[#4dd0e1] underline decoration-[#0b6477]/40 dark:decoration-[#4dd0e1]/40 hover:decoration-[#0b6477] dark:hover:decoration-[#4dd0e1] transition-colors"
            >
              {children}
            </a>
          );
        },
        // --- Headings ---
        h1({ children }) { return <h1 className="text-[14px] font-semibold mt-3 mb-1.5">{children}</h1>; },
        h2({ children }) { return <h2 className="text-[13px] font-semibold mt-2.5 mb-1">{children}</h2>; },
        h3({ children }) { return <h3 className="text-[12.5px] font-semibold mt-2 mb-1">{children}</h3>; },
        // --- Lists ---
        ul({ children }) { return <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>; },
        ol({ children }) { return <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>; },
        li({ children }) { return <li className="text-[12.5px]">{children}</li>; },
        // --- Blockquote ---
        blockquote({ children }) {
          return (
            <blockquote className="border-l-2 border-[#024a44]/40 dark:border-[#4dd0e1]/40 pl-3 my-2 text-gray-600 dark:text-gray-400 italic">
              {children}
            </blockquote>
          );
        },
        // --- Table ---
        table({ children }) {
          return (
            <div className="my-2 overflow-x-auto custom-scrollbar">
              <table className="text-[11.5px] border-collapse">{children}</table>
            </div>
          );
        },
        th({ children }) {
          return <th className="border border-outline/50 dark:border-neutral-700 px-2 py-1 bg-surface-muted dark:bg-neutral-800 font-semibold text-left">{children}</th>;
        },
        td({ children }) {
          return <td className="border border-outline/50 dark:border-neutral-700 px-2 py-1">{children}</td>;
        },
        // --- Horizontal rule ---
        hr() { return <hr className="my-3 border-outline/40 dark:border-neutral-700" />; },
        // --- Strong / Em ---
        strong({ children }) { return <strong className="font-semibold">{children}</strong>; },
      }}
    >
      {processed}
    </ReactMarkdown>
  );
}
