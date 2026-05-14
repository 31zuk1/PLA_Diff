# Article Comparison PoC Review Notes

## Current Repo Baseline

- Framework: Next.js App Router under `src/app`.
- Routes:
  - `/` from `src/app/page.tsx`
  - `/topics/[id]` from `src/app/topics/[id]/page.tsx`
  - global not-found page from `src/app/not-found.tsx`
- Data is currently local mock data in `src/data/mockData.ts`, accessed through `src/lib/data.ts`.
- TypeScript is strict (`strict: true`, `allowJs: false`, `noEmit: true`).
- Lint command is `eslint . --max-warnings=0`.
- Build command is `next build`.
- Public UI currently avoids full article bodies and shows metadata, short excerpts, evidence snippets, and outbound source links.

## Review Checklist For Article-Based PoC

- Keep the PoC framed as an article-level exploration without replacing the product's topic-cluster-first model.
- Preserve N-to-M relationships. Do not force a single People Daily article to map to exactly one PLA Daily article.
- Make match type explicit, especially when a match is based on date proximity, shared slogans, same policy phrase, or weak evidence.
- Keep lexical similarity separate from narrative similarity. Shared official slogans must not be treated as sufficient proof of topic match.
- Show uncertainty and confidence for scraper success, parsing quality, match quality, and narrative extraction.
- Tie every generated narrative claim to a short evidence snippet or mark it as unsupported / needs review.
- Ensure all required dimensions remain visible: core frame, main actors, beneficiaries, threat/problem definition, proposed solution, authority source, action verbs, lexical contrast, and omissions/silence map.
- Avoid showing full article text in UI, logs intended for demo, static fixtures, or generated pages.
- Do not put fetched article bodies into client bundles or mock files if they are only needed for extraction.
- Use explicit TypeScript types for fetched records, normalized article metadata, extraction results, failures, and fallback states.
- Keep server-only scraping/parsing code out of client components.
- Keep components small: parsing, normalization, matching, and presentation should not collapse into route components.
- Add realistic degraded states: no match, one-sided source, scraper unavailable, parse incomplete, PDF fallback required, source URL missing.
- Do not add heavy scraping, PDF, or NLP dependencies without a clear reason and README note.
- Update README if the PoC adds a scraper pipeline, new data model fields, environment variables, or new commands.

## Source-Specific Review Risks

### 人民日報 HTML

- HTML layout and class names may vary by year, page, or article type; parser must not rely on one brittle selector only.
- Encoding and punctuation normalization can damage Chinese text if handled casually.
- Page metadata such as issue date, edition/page number, column, author, and canonical URL should be extracted separately from body text.
- Shared boilerplate, navigation, related links, and copyright footers must not enter excerpts or narrative evidence.
- The parser should cap snippets and record extraction confidence when expected fields are missing.

### 解放軍報 JSON

- JSON shape may change, omit fields, or nest article content differently between endpoints.
- Treat endpoint status, empty arrays, malformed JSON, and partial records as first-class failure states.
- Verify source identity and canonical URL; do not assume every JSON record belongs to 解放軍報 without checking metadata.
- Normalize dates, page numbers, and article IDs consistently with People Daily records.
- Preserve raw fetch/parsing errors for developer review without exposing large copyrighted text in the UI.

### PDF Fallback

- PDF extraction can reorder columns, merge captions, drop headers, or corrupt Chinese text.
- OCR or text-layer quality should produce a parse-quality score or review flag.
- Page number and article boundary detection are high-risk; require evidence that snippets came from the intended article.
- PDF fallback should be visibly labeled as lower confidence than structured HTML/JSON extraction.
- Avoid storing or displaying complete PDF text; keep only metadata and short evidence snippets required for analysis.

## Copyright, Attribution, And Display Review

- UI should state that it displays metadata, short excerpts/snippets, and outbound links, not full source reproduction.
- Every article card or snippet should retain source name, issue date, page/edition if available, title, and source URL.
- Evidence snippets should be short, claim-specific, and not aggregated into a reconstructable full article.
- Do not provide a "read full text" panel, hidden full body in page source, or downloadable scraped corpus.
- Logs and fixtures committed to the repo should avoid full copyrighted article bodies.
- Network/cache design should distinguish internal transient extraction text from public display data.

## Network And Failure Behavior

- Fetch operations need timeouts, retry limits, and per-source error reporting.
- Failed People Daily, failed PLA Daily, and failed PDF fallback should be distinguishable in UI/review data.
- Partial success should still render available metadata and explicitly mark missing dimensions as unknown.
- The PoC should be deterministic enough for review: fixtures or mocked responses should exist for tests/demos.
- Avoid build-time hard failures caused by live network fetches unless explicitly intended; prefer runtime/server action or fixture-backed demo behavior.
- External source failures should not break `next build`.

## Smoke Test Procedure After Implementation

These checks should avoid depending on exact internal type names, route names, or file names. Review from the user-visible behavior first, then inspect implementation only when the UI suggests a problem.

1. Start the app locally.

```bash
npm run dev
```

2. Open the localhost URL printed by Next.js, usually `http://localhost:3000`.

3. Confirm the main view still presents PeoplePLA Diff as a comparison/research tool, not a full-text news reader.

4. Check article/source loading states:
   - There is a visible distinction between 人民日報 and 解放軍報 records.
   - Each article-like item shows source name, title, issue date, page/edition when available, and outbound source link.
   - Parsed/fetched records show a status such as ready, partial, fallback, failed, or needs review.
   - Confidence or uncertainty is visible for matching/extraction, not only hidden in data.

5. Check comparison UI:
   - Match type is visible for article or cluster matches.
   - N-to-M matches are possible in the display; the UI does not imply one article must equal one opposing article.
   - Required comparison dimensions remain visible: core frame, actors, beneficiaries, problem/threat, solution, authority, action verbs, lexical contrast, and silence/omission map.
   - Evidence snippets are attached to claims or unsupported claims are marked for review.

6. Check full-text avoidance:
   - No page displays a full article body or long scrollable article transcript.
   - Browser "View Source" / inspector does not reveal full article text embedded in client-rendered data.
   - Evidence snippets are short and claim-specific.
   - There is no "download corpus", "copy full text", or hidden full-text panel.
   - Logs or debug panels exposed in the browser do not print complete scraped HTML, JSON content bodies, or PDF text.

7. Check network failure behavior without relying on exact implementation names:
   - Use the app's fixture/offline/error mode if provided, or temporarily block network access in browser devtools.
   - People Daily failure, PLA Daily failure, and PDF fallback failure are distinguishable in the UI.
   - Partial success still renders available source metadata and marks missing data as unknown/failed.
   - The page does not crash to an unhandled exception when one source times out or returns malformed data.
   - Retry/fallback messaging is concise and does not expose raw copyrighted article bodies.

8. Check PDF fallback labeling:
   - PDF-derived records are clearly labeled as fallback/lower confidence.
   - Extracted snippets do not show obvious column-order corruption, merged captions, or unrelated boilerplate.
   - Page/edition attribution is present or explicitly marked unknown.

9. Run a 1-4 page-count sanity check:
   - Filter, search, or visually scan records for page numbers 1, 2, 3, and 4.
   - Counts for front-page/early-page articles should be plausible for the selected date range and source.
   - Page 1 items should not all vanish because a parser only handled inner pages.
   - Page 1-4 totals should not be inflated by navigation links, repeated PDF headers, duplicate JSON rows, or related-article lists.
   - If the UI has source/date totals, compare total article count against the sum of visible page buckets or source buckets.

10. Final local checks:

```bash
npm run lint
npm run build
```

## Commands To Run After Implementation

```bash
npm run lint
npm run build
```
