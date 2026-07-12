import ReactMarkdown, { type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import { type FC, memo, useState, useEffect, useRef } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SyntaxHighlighter } from "./shiki-highlighter";

interface MarkdownTextProps {
  children: string;
  components?: import("react-markdown").Components;
  /** Extra remark plugins, appended after the always-on `remark-gfm`. */
  remarkPlugins?: Options["remarkPlugins"];
}

const MarkdownTextImpl: FC<MarkdownTextProps> = ({
  children,
  components,
  remarkPlugins,
}) => {
  const mergedComponents = { ...defaultComponents, ...components };

  return (
    <div className="aui-md min-w-0 flex flex-col gap-2 break-words [overflow-wrap:anywhere]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, ...(remarkPlugins ?? [])]}
        components={mergedComponents}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
};

export const MarkdownText = memo(MarkdownTextImpl);

const CodeHeader: FC<{ language?: string; code: string }> = ({
  language,
  code,
}) => {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  const onCopy = () => {
    if (!code || isCopied) return;
    copyToClipboard(code);
  };

  return (
    <div className="aui-code-header-root mt-4 flex items-center justify-between gap-4 rounded-t-md dark:bg-muted-foreground/15 px-4 py-2 font-semibold text-foreground text-sm bg-muted-foreground/20">
      <span className="aui-code-header-language lowercase [&>span]:text-xs">
        {language}
      </span>
      <button
        onClick={onCopy}
        className="p-1 hover:bg-text/10 rounded transition"
        type="button"
        aria-label="Copy code"
      >
        {!isCopied && <CopyIcon className="w-3 h-3" />}
        {isCopied && <CheckIcon className="w-3 h-3 text-green-500" />}
      </button>
    </div>
  );
};

const useCopyToClipboard = ({
  copiedDuration = 3000,
}: {
  copiedDuration?: number;
} = {}) => {
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const copyToClipboard = (value: string) => {
    if (!value) return;

    // Clear any existing timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    navigator.clipboard.writeText(value).then(() => {
      setIsCopied(true);
      timerRef.current = setTimeout(() => {
        setIsCopied(false);
        timerRef.current = null;
      }, copiedDuration);
    });
  };

  return { isCopied, copyToClipboard };
};

const defaultComponents = {
  h1: ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1
      className={cn(
        "aui-md-h1 mb-8 scroll-m-20 font-extrabold text-3xl tracking-tight last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h2: ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2
      className={cn(
        "aui-md-h2 mt-6 mb-3 scroll-m-20 font-semibold text-2xl tracking-tight first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h3: ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3
      className={cn(
        "aui-md-h3 mt-4 mb-2 scroll-m-20 font-semibold text-xl tracking-tight first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h4: ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h4
      className={cn(
        "aui-md-h4 mt-4 mb-2 scroll-m-20 font-semibold tracking-tight first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h5: ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h5
      className={cn(
        "aui-md-h5 my-2 font-semibold text-lg first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h6: ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h6
      className={cn(
        "aui-md-h6 my-2 font-semibold first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  p: ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p
      className={cn("aui-md-p leading-5 first:mt-0 last:mb-0", className)}
      {...props}
    />
  ),
  br: (props: React.HTMLAttributes<HTMLBRElement>) => (
    <span className="aui-md-br h-0 -my-5 block" {...props} />
  ),
  a: ({
    className,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      className={cn(
        "aui-md-a font-medium underline underline-offset-4",
        className,
      )}
      {...props}
      target="_blank"
      rel="noopener noreferrer"
    />
  ),
  blockquote: ({
    className,
    ...props
  }: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      className={cn("aui-md-blockquote border-l-2 pl-6 italic my-2", className)}
      {...props}
    />
  ),
  ul: ({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
    <ul
      className={cn(
        "aui-md-ul mb-2 ml-6 list-disc [&>li]:mt-1 flex flex-col",
        className,
      )}
      {...props}
    />
  ),
  ol: ({ className, ...props }: React.OlHTMLAttributes<HTMLOListElement>) => (
    <ol
      className={cn(
        "aui-md-ol my-2 ml-6 list-decimal [&>li]:mt-1 flex flex-col",
        className,
      )}
      {...props}
    />
  ),
  li: ({ className, ...props }: React.LiHTMLAttributes<HTMLLIElement>) => (
    <li className={cn("aui-md-li", className)} {...props} />
  ),
  hr: ({ className, ...props }: React.HTMLAttributes<HTMLHRElement>) => (
    <hr className={cn("aui-md-hr my-4 border-b", className)} {...props} />
  ),
  table: ({
    className,
    ...props
  }: React.TableHTMLAttributes<HTMLTableElement>) => (
    <div className="w-full flex flex-1 overflow-auto">
      <table
        className={cn(
          "aui-md-table my-3 w-full border-separate border-spacing-0 overflow-auto",
          className,
        )}
        {...props}
      />
    </div>
  ),
  th: ({
    className,
    ...props
  }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
    <th
      className={cn(
        "aui-md-th bg-text/10 px-4 py-2 text-left font-bold first:rounded-tl-md last:rounded-tr-md [[align=center]]:text-center [[align=right]]:text-right",
        className,
      )}
      {...props}
    />
  ),
  td: ({
    className,
    ...props
  }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
    <td
      className={cn(
        "aui-md-td border-b border-l border-text/10 px-4 py-2 text-left last:border-r [[align=center]]:text-center [[align=right]]:text-right",
        className,
      )}
      {...props}
    />
  ),
  tr: ({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
    <tr
      className={cn(
        "aui-md-tr m-0 border-b p-0 first:border-t [&:last-child>td:first-child]:rounded-bl-lg [&:last-child>td:last-child]:rounded-br-lg",
        className,
      )}
      {...props}
    />
  ),
  sup: ({ className, ...props }: React.HTMLAttributes<HTMLElement>) => (
    <sup
      className={cn("aui-md-sup [&>a]:text-xs [&>a]:no-underline", className)}
      {...props}
    />
  ),
  pre: ({ className, ...props }: React.HTMLAttributes<HTMLPreElement>) => (
    <pre
      className={cn("aui-md-pre max-w-full overflow-x-auto", className)}
      {...props}
    />
  ),
  code: ({
    className,
    children,
    ...props
  }: React.HTMLAttributes<HTMLElement>) => {
    const match = /language-(\w+)/.exec(className || "");
    const language = match ? match[1] : "";
    const code = String(children).replace(/\n$/, "");

    if (language) {
      return (
        <div className="my-4">
          <CodeHeader language={language} code={code} />
          <SyntaxHighlighter
            code={code}
            language={language}
            className="rounded-t-none!"
          />
        </div>
      );
    }

    return (
      <code
        className={cn(
          "aui-md-inline-code rounded border bg-muted font-semibold px-1",
          className,
        )}
        {...props}
      >
        {children}
      </code>
    );
  },
};
