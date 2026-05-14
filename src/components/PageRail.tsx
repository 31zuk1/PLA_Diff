import { formatDate, sourceLabels } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ExtractionStatusLine, ExtractionStatusPill } from "./IssueExtractionStatus";
import type {
  ArticleComparisonSource,
  ExtractionSummary,
  NewspaperPage,
} from "./IssueComparisonTypes";

export function PageRail({
  pages,
  activePageNumber,
  title,
  source,
  issueDate,
  extraction,
  pdfUrl,
  pageImageUrl,
}: {
  pages: NewspaperPage[];
  activePageNumber?: number;
  title?: string;
  source?: ArticleComparisonSource;
  issueDate?: string;
  extraction?: ExtractionSummary;
  pdfUrl?: string;
  pageImageUrl?: string;
}) {
  const railSource = source ?? pages[0]?.source;
  const railIssueDate = issueDate ?? pages[0]?.issueDate;
  const pageSlots = [1, 2, 3, 4].map((pageNumber) => {
    const page = pages.find((candidate) => candidate.pageNumber === pageNumber);
    return { pageNumber, page };
  });
  const isIssueEmpty = pages.length === 0 || pages.every((page) => page.articles.length === 0);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-md border bg-white dark:bg-stone-950",
        extraction?.status === "failed" ? "border-rose-300 dark:border-rose-800" : "border-stone-200 dark:border-stone-800",
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-stone-200 bg-stone-100/70 px-3 py-2 dark:border-stone-800 dark:bg-stone-900/80">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Page rail</p>
          {title ? <h3 className="mt-0.5 text-sm font-semibold text-stone-950 dark:text-stone-50">{title}</h3> : null}
        </div>
        {railIssueDate ? (
          <span className="shrink-0 text-[11px] font-semibold text-stone-500 dark:text-stone-400">
            {formatDate(railIssueDate)}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 px-3 py-2 dark:border-stone-800">
        {railSource ? (
          <span className="rounded-sm border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] font-semibold text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
            {sourceLabels[railSource]}
          </span>
        ) : null}
        <ExtractionStatusPill
          extraction={extraction}
          fallbackStatus={isIssueEmpty ? "empty" : undefined}
        />
        <AssetLinks pdfUrl={pdfUrl} pageImageUrl={pageImageUrl} />
      </div>
      {extraction ? (
        <div className="border-b border-stone-200 px-3 py-2 dark:border-stone-800">
          <ExtractionStatusLine extraction={extraction} />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-px bg-stone-200 dark:bg-stone-800 sm:grid-cols-4">
        {pageSlots.map(({ pageNumber, page }) => (
          <PageRailItem
            key={pageNumber}
            pageNumber={pageNumber}
            page={page}
            isActive={activePageNumber === pageNumber}
          />
        ))}
      </div>
    </section>
  );
}

function PageRailItem({
  pageNumber,
  page,
  isActive,
}: {
  pageNumber: number;
  page?: NewspaperPage;
  isActive: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 border-l-2 px-3 py-2",
        isActive ? "border-stone-900 bg-stone-50 dark:border-teal-400 dark:bg-stone-900" : "border-transparent bg-white dark:bg-stone-950",
        !page && "text-stone-400 dark:text-stone-600",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-stone-950 dark:text-stone-50">{pageNumber}面</p>
          <p className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">
            {page ? page.pageName ?? sourceLabels[page.source] : "未取得"}
          </p>
        </div>
        <span className="text-[11px] font-semibold text-stone-600 dark:text-stone-300">
          {page?.articles.length ?? 0}本
        </span>
      </div>

      {page && page.articles.length > 0 ? (
        <ol className="mt-2 space-y-1">
          {page.articles.slice(0, 2).map((article) => (
            <li key={article.id} className="truncate text-[11px] text-stone-600 dark:text-stone-300">
              {article.title}
            </li>
          ))}
          {page.articles.length > 2 ? (
            <li className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">
              +{page.articles.length - 2}本
            </li>
          ) : null}
        </ol>
      ) : null}

      {page ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ExtractionStatusPill
            extraction={page.extraction}
            fallbackStatus={page.articles.length === 0 ? "empty" : undefined}
          />
          <AssetLinks pdfUrl={page.pdfUrl} pageImageUrl={page.pageImageUrl} />
        </div>
      ) : null}
    </div>
  );
}

function AssetLinks({ pdfUrl, pageImageUrl }: { pdfUrl?: string; pageImageUrl?: string }) {
  if (!pdfUrl && !pageImageUrl) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {pdfUrl ? <AssetLink href={pdfUrl}>PDF</AssetLink> : null}
      {pageImageUrl ? <AssetLink href={pageImageUrl}>紙面画像</AssetLink> : null}
    </div>
  );
}

function AssetLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-sm border border-stone-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-stone-700 underline decoration-stone-300 underline-offset-4 hover:border-stone-400 hover:decoration-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:decoration-stone-600"
    >
      {children}
    </a>
  );
}
