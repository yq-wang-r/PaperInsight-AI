import React from 'react';
import katex from 'katex';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = "" }) => {
  // Regex to split text into tokens:
  // 1. Block Math: $$...$$
  // 2. Inline Math: $...$ (assumes no newlines inside inline math for robustness)
  // 3. Bold: **...**
  // 4. Link: [...](...)
  const regex = /(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\*\*.*?\*\*|\[.*?\]\(.*?\))/g;

  const parts = content.split(regex).filter(p => p);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        // Block Math
        if (part.startsWith('$$') && part.endsWith('$$')) {
          try {
             const html = katex.renderToString(part.slice(2, -2), { displayMode: true, throwOnError: false });
             return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
          } catch { return <span key={i}>{part}</span>; }
        }
        // Inline Math
        else if (part.startsWith('$') && part.endsWith('$')) {
           try {
             const html = katex.renderToString(part.slice(1, -1), { displayMode: false, throwOnError: false });
             return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
          } catch { return <span key={i}>{part}</span>; }
        }
        // Bold
        else if (part.startsWith('**') && part.endsWith('**')) {
           return <strong key={i} className="font-bold text-slate-900">{part.slice(2, -2)}</strong>;
        }
        // Link
        else if (part.startsWith('[') && part.includes('](') && part.endsWith(')')) {
           const match = part.match(/^\[(.*?)\]\((.*?)\)$/);
           if (match) {
             return <a key={i} href={match[2]} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{match[1]}</a>;
           }
           return <span key={i}>{part}</span>;
        }
        // Plain Text
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
};

export default MarkdownRenderer;