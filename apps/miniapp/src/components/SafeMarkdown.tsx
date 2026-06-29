import ReactMarkdown from 'react-markdown';

export function SafeMarkdown({ children }: { children: string }) {
  return (
    <div className="nm-prose">
      {/* react-markdown безопасен по умолчанию: raw HTML в источнике экранируется */}
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}
