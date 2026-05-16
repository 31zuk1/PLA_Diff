#!/usr/bin/env tsx

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  buildDailyIssueSnapshot,
  toSnapshotIndexEntry,
  type DailyIssueSnapshot,
  type SnapshotIndex,
  type SnapshotIndexEntry,
} from "../src/lib/dailySnapshot";
import {
  defaultSnapshotRetentionDays,
  normalizeIssueDate,
  snapshotSchemaVersion,
  type SnapshotRetentionDays,
} from "../src/lib/snapshotConfig";

interface Options {
  dates: string[];
  from?: string;
  to?: string;
  days?: number;
  outDir: string;
  write: boolean;
  force: boolean;
  skipExisting: boolean;
  indexOnly: boolean;
  concurrency: number;
  retentionDays: SnapshotRetentionDays;
  help: boolean;
}

interface BackfillResult {
  issueDate: string;
  status: "built" | "skipped" | "failed";
  path?: string;
  error?: string;
  counts?: DailyIssueSnapshot["counts"];
}

const defaultOutDir = join("public", "archive");

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const outDir = resolve(options.outDir);

  if (options.indexOnly) {
    const index = await rebuildArchiveIndex(outDir, options.write);
    console.log(
      `${options.write ? "Wrote" : "Dry-run rebuilt"} ${index.entries.length} archive index entries in ${relativePath(outDir)}.`,
    );
    return;
  }

  const dates = expandDates(options);

  if (dates.length === 0) {
    throw new Error("No dates requested. Use --date, --from/--to, or --from/--days.");
  }

  console.log(
    [
      `Archive backfill: ${options.write ? "WRITE" : "DRY RUN"}`,
      `dates=${dates[0]}${dates.length > 1 ? `..${dates.at(-1)}` : ""}`,
      `count=${dates.length}`,
      `out=${relativePath(outDir)}`,
      `concurrency=${options.concurrency}`,
    ].join("  "),
  );

  if (!options.write) {
    console.log("Dry-run builds snapshots and reports counts, but does not write JSON files.");
  }

  const results = await runWithConcurrency(dates, options.concurrency, (issueDate) =>
    backfillDate(issueDate, outDir, options),
  );

  printResults(results);

  if (options.write) {
    const index = await rebuildArchiveIndex(outDir, true);
    console.log(`Updated ${relativePath(join(outDir, "index.json"))} with ${index.entries.length} entries.`);
  }

  if (results.some((result) => result.status === "failed")) {
    process.exitCode = 1;
  }
}

function parseArgs(args: string[]): Options {
  const options: Options = {
    dates: [],
    outDir: defaultOutDir,
    write: false,
    force: false,
    skipExisting: false,
    indexOnly: false,
    concurrency: 1,
    retentionDays: defaultSnapshotRetentionDays,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--date") {
      options.dates.push(readDate(args, ++index, arg));
    } else if (arg === "--from") {
      options.from = readDate(args, ++index, arg);
    } else if (arg === "--to") {
      options.to = readDate(args, ++index, arg);
    } else if (arg === "--days") {
      options.days = readPositiveInteger(args, ++index, arg);
    } else if (arg === "--out-dir") {
      options.outDir = readValue(args, ++index, arg);
    } else if (arg === "--write") {
      options.write = true;
    } else if (arg === "--dry-run") {
      options.write = false;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--skip-existing") {
      options.skipExisting = true;
    } else if (arg === "--index-only") {
      options.indexOnly = true;
    } else if (arg === "--concurrency") {
      options.concurrency = readPositiveInteger(args, ++index, arg);
    } else if (arg === "--retention-days") {
      options.retentionDays = readRetentionDays(args, ++index, arg);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.to && options.days) {
    throw new Error("Use either --to or --days, not both.");
  }

  return options;
}

function readValue(args: string[], index: number, flag: string) {
  const value = args[index];

  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}

function readDate(args: string[], index: number, flag: string) {
  const value = readValue(args, index, flag);
  const normalized = normalizeIssueDate(value);

  if (!normalized) {
    throw new Error(`${flag} requires YYYY-MM-DD.`);
  }

  return normalized;
}

function readPositiveInteger(args: string[], index: number, flag: string) {
  const value = Number.parseInt(readValue(args, index, flag), 10);

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${flag} requires a positive integer.`);
  }

  return value;
}

function readRetentionDays(args: string[], index: number, flag: string): SnapshotRetentionDays {
  const value = readValue(args, index, flag);

  if (value === "null" || value === "permanent") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} requires a positive integer, null, or permanent.`);
  }

  return parsed;
}

function expandDates(options: Options) {
  const dates = new Set(options.dates);

  if (options.from) {
    const end = options.to ?? endDateFromDays(options.from, options.days ?? 1);

    for (const date of eachDate(options.from, end)) {
      dates.add(date);
    }
  }

  return [...dates].sort();
}

function endDateFromDays(from: string, days: number) {
  const date = parseUtcDate(from);
  date.setUTCDate(date.getUTCDate() + days - 1);
  return formatUtcDate(date);
}

function* eachDate(from: string, to: string) {
  const cursor = parseUtcDate(from);
  const end = parseUtcDate(to);

  if (cursor > end) {
    throw new Error("--from must be earlier than or equal to --to.");
  }

  while (cursor <= end) {
    yield formatUtcDate(cursor);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

async function backfillDate(
  issueDate: string,
  outDir: string,
  options: Options,
): Promise<BackfillResult> {
  const outputPath = snapshotFilePath(outDir, issueDate);

  if (options.skipExisting && existsSync(outputPath) && !options.force) {
    return {
      issueDate,
      path: outputPath,
      status: "skipped",
    };
  }

  try {
    const snapshot = await buildDailyIssueSnapshot(issueDate, {
      retentionDays: options.retentionDays,
    });

    if (options.write) {
      await writeJson(outputPath, snapshot);
    }

    return {
      issueDate,
      path: outputPath,
      status: "built",
      counts: snapshot.counts,
    };
  } catch (error) {
    return {
      issueDate,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function rebuildArchiveIndex(outDir: string, shouldWrite: boolean): Promise<SnapshotIndex> {
  const snapshots = await readArchiveSnapshots(outDir);
  const entries = snapshots.map(toSnapshotIndexEntry).sort(compareIndexEntries);
  const updatedAt = maxIsoDate(snapshots.map((snapshot) => snapshot.generatedAt)) ?? new Date().toISOString();
  const index: SnapshotIndex = {
    schemaVersion: snapshotSchemaVersion,
    updatedAt,
    retentionDays: defaultSnapshotRetentionDays,
    entries,
  };

  if (shouldWrite) {
    await writeJson(join(outDir, "index.json"), index);
  }

  return index;
}

async function readArchiveSnapshots(outDir: string) {
  const entries = await readdir(outDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && entry.name !== "index.json")
    .map((entry) => join(outDir, entry.name))
    .sort();

  const snapshots: DailyIssueSnapshot[] = [];

  for (const file of files) {
    snapshots.push(JSON.parse(await readFile(file, "utf8")) as DailyIssueSnapshot);
  }

  return snapshots;
}

async function writeJson(filePath: string, value: unknown) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
) {
  const results: R[] = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const item = items[currentIndex];

      if (item !== undefined) {
        results[currentIndex] = await worker(item);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()),
  );

  return results;
}

function printResults(results: BackfillResult[]) {
  const rows = results.map((result) => ({
    date: result.issueDate,
    status: result.status,
    articles: result.counts ? `${result.counts.peopleArticles}+${result.counts.plaArticles}` : "-",
    mached: result.counts ? String(result.counts.matchedGroups) : "-",
    only: result.counts ? `${result.counts.peopleOnlyArticles}+${result.counts.plaOnlyArticles}` : "-",
    path: result.path ? relativePath(result.path) : "-",
    error: result.error ?? "",
  }));

  console.log(formatTable(rows, ["date", "status", "articles", "mached", "only", "path", "error"]));
}

function compareIndexEntries(left: SnapshotIndexEntry, right: SnapshotIndexEntry) {
  return right.issueDate.localeCompare(left.issueDate);
}

function maxIsoDate(values: string[]) {
  return values.filter(Boolean).sort().at(-1);
}

function snapshotFilePath(outDir: string, issueDate: string) {
  return join(outDir, `${issueDate}.json`);
}

function parseUtcDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }

  return date;
}

function formatUtcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function relativePath(filePath: string) {
  const relative = resolve(filePath).replace(`${process.cwd()}/`, "");
  return relative === process.cwd() ? "." : relative;
}

function formatTable(rows: Array<Record<string, string>>, columns: string[]) {
  const widths = Object.fromEntries(
    columns.map((column) => [
      column,
      Math.max(column.length, ...rows.map((row) => String(row[column] ?? "").length)),
    ]),
  );
  const header = columns.map((column) => pad(column, widths[column] ?? column.length)).join("  ");
  const divider = columns.map((column) => "-".repeat(widths[column] ?? column.length)).join("  ");
  const body = rows
    .map((row) => columns.map((column) => pad(String(row[column] ?? ""), widths[column] ?? column.length)).join("  "))
    .join("\n");

  return `${header}\n${divider}\n${body}`;
}

function pad(value: string, width: number) {
  return value + " ".repeat(Math.max(0, width - value.length));
}

function printHelp() {
  console.log(`Usage:
  npm run archive:backfill -- [options]

Options:
  --date YYYY-MM-DD          Build one date. Can be repeated.
  --from YYYY-MM-DD          Start date, inclusive.
  --to YYYY-MM-DD            End date, inclusive.
  --days N                   With --from, build N calendar days.
  --out-dir PATH             Archive directory. Default: ${defaultOutDir}
  --write                    Write snapshots and rebuild index.json.
  --dry-run                  Build and report without writing. Default.
  --skip-existing            Skip dates already present in the archive directory.
  --force                    Rebuild even when --skip-existing would skip.
  --index-only               Rebuild index.json from existing archive JSON files.
  --concurrency N            Concurrent snapshot builds. Default: 1.
  --retention-days N|null    Snapshot retention marker. Default: permanent/null.
  --help                     Show this help.

Examples:
  npm run archive:backfill -- --date 2026-04-22
  npm run archive:backfill -- --from 2026-04-16 --days 7 --write
  npm run archive:backfill -- --index-only --write
`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
