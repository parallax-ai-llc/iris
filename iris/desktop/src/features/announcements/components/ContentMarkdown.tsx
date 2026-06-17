/**
 * ContentMarkdown - Markdown renderer for announcements
 * Uses react-markdown with remark-gfm for GitHub Flavored Markdown
 */

import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { cn } from '@/shared/lib/utils';

interface ContentMarkdownProps {
  content: string;
  className?: string;
}

export const ContentMarkdown = memo(function ContentMarkdown({
  content,
  className,
}: ContentMarkdownProps) {
  return (
    <div className={cn('prose prose-invert prose-sm max-w-none', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
        // Headings
        h1: ({ children }) => (
          <h1 className="text-xl font-bold text-white mb-3 mt-4">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-lg font-semibold text-white mb-2 mt-3">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-base font-semibold text-white mb-2 mt-3">
            {children}
          </h3>
        ),
        // Paragraphs
        p: ({ children }) => (
          <p className="text-zinc-300 mb-3 leading-relaxed">{children}</p>
        ),
        // Links
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 underline"
          >
            {children}
          </a>
        ),
        // Lists
        ul: ({ children }) => (
          <ul className="list-disc list-inside text-zinc-300 mb-3 space-y-1">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside text-zinc-300 mb-3 space-y-1">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="text-zinc-300">{children}</li>,
        // Code
        code: ({ className, children }) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code className="bg-zinc-800 text-zinc-200 px-1.5 py-0.5 rounded text-sm">
                {children}
              </code>
            );
          }
          return (
            <code className="block bg-zinc-800 text-zinc-200 p-3 rounded-lg text-sm overflow-x-auto">
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="bg-zinc-800 rounded-lg overflow-x-auto mb-3">
            {children}
          </pre>
        ),
        // Blockquote
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-zinc-600 pl-4 italic text-zinc-400 mb-3">
            {children}
          </blockquote>
        ),
        // Table
        table: ({ children }) => (
          <div className="overflow-x-auto mb-3">
            <table className="min-w-full divide-y divide-zinc-700">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-zinc-800">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="px-3 py-2 text-left text-xs font-medium text-zinc-300 uppercase tracking-wider">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-2 text-sm text-zinc-300">{children}</td>
        ),
        // Horizontal rule
        hr: () => <hr className="border-zinc-700 my-4" />,
        // Strong and emphasis
        strong: ({ children }) => (
          <strong className="font-semibold text-white">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic text-zinc-300">{children}</em>
        ),
        // Images
        img: ({ src, alt }) => (
          <img
            src={src}
            alt={alt || ''}
            className="rounded-lg max-w-full h-auto my-3"
          />
        ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

export default ContentMarkdown;
