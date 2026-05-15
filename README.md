# PeoplePLA Diff

PeoplePLA Diff is a research-oriented MVP for comparing how **人民日報** and **解放軍報** select, place, and narrate related China-facing topics.

The app now has an article-first proof of concept for daily issue review. A scheduled snapshot job fetches the first four pages of both papers, builds article match groups, and keeps topic clusters as the later interpretive layer. One People’s Daily article may match multiple PLA Daily articles, one PLA Daily article may belong to a broader topic cluster, and unmatched articles remain analytically meaningful.

## Concept

Core research question:

> How does an official party-state narrative in 人民日報 get reframed, militarized, narrowed, expanded, or operationalized in 解放軍報?

The current PoC focuses on:

- daily 1-4 page issue comparison
- People’s Daily HTML extraction and PLA Daily JSON extraction
- anchor-based candidate generation plus optional OpenAI adjudication for `MACHED`
- N-to-M `MACHED` topic groups built from accepted article-pair components
- three public comparison labels: `MACHED`, `People's only`, and `81cn only`
- filtering by label and relevance/page-order sorting
- a collapsible per-date article graph that treats same-day articles as nodes and expands `MACHED` groups into lightweight review links
- page/PDF/image source links for audit
- short excerpts only, with outbound article links
- daily cached snapshots, capped to a short rolling archive

The UI intentionally avoids reproducing full article bodies. Fetched full text is used only server-side during the scheduled snapshot job for extraction and lightweight matching; the browser receives saved short excerpts and metadata. Public page views do not trigger scraping or OpenAI calls.

## Data Model

TypeScript types live in `src/types`, with UI-facing comparison view types in `src/components/IssueComparisonTypes.tsx`.

Main entities:

- `NewspaperIssue`: a fetched issue for one source and date
- `NewspaperPage`: source, date, page number/name, PDF/image links, layout regions, and articles
- `ScrapedArticle`: article metadata, short excerpt, source URL, extraction status, and server-side analysis text
- `LayoutRegion`: paper-map coordinates from HTML image maps or PLA JSON `point` data
- `ExtractionInfo`: parser status, source URL, warnings, errors, and timing
- `ArticleMatchGroup`: N-to-M comparison group produced by rule-based matching
- `Article`: source metadata, page information, short excerpt, keywords, entities, and narrative profile
- `Entity`: extracted person, organization, place, policy, military unit, slogan, or other named item
- `NarrativeProfile`: core frame, actors, beneficiaries, problem terms, solution terms, authority sources, action verbs, and optional tone
- `TopicCluster`: cluster label, date range, match type, confidence, related article IDs, common ground, narrative delta, and evidence
- `NarrativeDelta`: frame, actor, goal, threat/problem, solution, authority, lexical contrast, and silence map
- `EvidenceSnippet`: short cited snippet connected to a typed supporting claim such as `frame_shift`, `actor_shift`, `goal_shift`, or `authority_shift`

The live PoC uses:

- `src/lib/scrapers/peopleDaily.ts` for 人民日報 HTML
- `src/lib/scrapers/plaDaily.ts` for 解放軍報 `index.json`
- `src/lib/matching.ts` for lightweight candidate scoring and concrete event/policy anchor extraction
- `src/lib/llmMatching.ts` for high-precision anchor candidate adjudication and N-to-M group construction
- `src/lib/issueGraph.ts` to derive display-safe graph nodes and MACHED group review links from saved snapshots
- `src/lib/issueComparison.ts` to strip server-only analysis text before rendering
- `src/lib/dailySnapshot.ts` to build one display-safe daily snapshot
- `src/lib/snapshotStorage.ts` to read/write the rolling snapshot archive
- `src/app/api/cron/daily-issue/route.ts` as the protected Vercel Cron endpoint

Older topic-cluster mock data still lives in `src/data/mockData.ts`.

## Current MVP Limitations

- No full crawler or editorial review queue
- Snapshot persistence uses Vercel Blob in production and local files in development
- Optional OpenAI adjudication only; without `OPENAI_API_KEY`, matching falls back to stricter local heuristics
- No public full article-body storage or mirroring
- No embedding index
- No human review workflow yet
- Source extraction depends on current public electronic edition structures
- Narrative dimensions are scaffolded for review, not yet automatically extracted
- `MACHED` precision is intentionally favored over recall; weak shared-word overlaps remain in `People's only` / `81cn only`
- Group counts and article counts differ: one `MACHED` topic group may contain several People’s Daily articles and several PLA Daily articles.
- The public page only shows already-generated snapshots. Run the cron endpoint to create or refresh a date.

## Future Pipeline Plan

1. Fetch issue pages by date, source, and page.
2. Extract metadata, layout coordinates, source links, and short public excerpts.
3. Keep full fetched text server-side only for matching and extraction.
4. Generate candidate matches by date, title overlap, text shingles, page prominence, and policy/military bridge terms.
5. Add entity, slogan, policy, organization, and military-unit extraction.
6. Compute embedding similarity for candidate expansion and clustering support.
7. Use LLM reranking to assign match types and reject weak candidates.
8. Build many-to-many topic clusters from reviewed article match groups.
9. Extract structured narratives into JSON using the `NarrativeProfile` and `NarrativeDelta` schema.
10. Attach evidence snippets to typed analytical claims for human audit.
11. Add a human review queue for match approval, evidence review, and claim editing.
12. Publish public comparison pages with metadata, excerpts, claims, and outbound links only.

## Local Development

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Run checks:

```bash
npm run lint
npm run build
```

## Snapshot Updates

The public page reads saved snapshots from the rolling archive. It does not scrape sources or call OpenAI during normal viewing.

Local development uses `.cache/peoplepla-diff` when `BLOB_READ_WRITE_TOKEN` is not set:

```bash
curl http://localhost:3000/api/cron/daily-issue?date=2026-05-14
```

If `CRON_SECRET` is set locally, include it:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/cron/daily-issue?date=2026-05-14"
```

Production uses Vercel Cron. The included `vercel.json` runs `/api/cron/daily-issue` once per day at `02:00 UTC`, which is `11:00 JST` / `10:00 China time`. Hobby plans may invoke within the specified hour.

Recommended Vercel environment variables:

- `CRON_SECRET`: random secret for the cron endpoint
- `BLOB_READ_WRITE_TOKEN`: provided by Vercel Blob
- `OPENAI_API_KEY`: optional, used only by the snapshot job
- `OPENAI_MODEL`: optional, defaults to `gpt-4o-mini`
- `ENABLE_LLM_JUDGE`: optional; set `false` to force local heuristics
- `SNAPSHOT_RETENTION_DAYS`: optional; defaults to `14`
- `PLA_DIFF_STORAGE=file`: optional local/debug override to avoid Blob even when a token is present
