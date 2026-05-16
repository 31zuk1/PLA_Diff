import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DailyIssueSnapshot, SnapshotIndex, SnapshotIndexEntry } from "./dailySnapshot";
import { emptySnapshotIndex, toSnapshotIndexEntry } from "./dailySnapshot";
import {
  snapshotIndexPath,
  snapshotPathForDate,
  snapshotRetentionDays,
  type SnapshotRetentionDays,
  snapshotSchemaVersion,
} from "./snapshotConfig";

type BlobSdk = typeof import("@vercel/blob");

const localSnapshotRoot = join(process.cwd(), ".cache", "peoplepla-diff");
const staticSnapshotRoot = join(process.cwd(), "public");
let blobReadsUnavailable = false;

export async function readSnapshotIndex(): Promise<SnapshotIndex> {
  return readStoredSnapshotIndex(snapshotRetentionDays());
}

export async function readDailyIssueSnapshot(issueDate: string) {
  return readJson<DailyIssueSnapshot>(snapshotPathForDate(issueDate));
}

export async function writeDailyIssueSnapshot(
  snapshot: DailyIssueSnapshot,
): Promise<SnapshotIndex> {
  const retentionDays = snapshot.retentionDays;
  const entry = toSnapshotIndexEntry(snapshot);
  await writeJson(entry.path, snapshot);

  const previousIndex = await readStoredSnapshotIndex(retentionDays);
  const nextIndex = upsertSnapshotIndexEntry(previousIndex, entry, retentionDays, snapshot.generatedAt);

  await writeJson(snapshotIndexPath, nextIndex);

  return nextIndex;
}

export function storageDriverLabel() {
  const primaryDriver = shouldUseBlobStorage() ? "vercel-blob" : "local-file";
  return shouldUseStaticArchiveFallback() ? `${primaryDriver}+static` : primaryDriver;
}

async function readJson<T>(pathname: string): Promise<T | undefined> {
  if (shouldUseBlobStorage()) {
    const blobJson = await readBlobJson<T>(pathname);

    if (blobJson) {
      return blobJson;
    }

    return readStaticJson<T>(pathname);
  }

  const localJson = await readLocalJson<T>(pathname);

  if (localJson) {
    return localJson;
  }

  return readStaticJson<T>(pathname);
}

async function writeJson(pathname: string, value: unknown) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;

  if (shouldUseBlobStorage()) {
    const { put } = await loadBlobSdk();
    await put(pathname, serialized, {
      access: blobAccessType(),
      allowOverwrite: true,
      cacheControlMaxAge: 60,
      contentType: "application/json; charset=utf-8",
    });
    return;
  }

  const filePath = localPath(pathname);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, serialized, "utf8");
}

async function readBlobJson<T>(pathname: string): Promise<T | undefined> {
  if (blobReadsUnavailable) {
    return undefined;
  }

  try {
    const { get } = await loadBlobSdk();
    const result = await get(pathname, {
      access: blobAccessType(),
      useCache: false,
    });

    if (!result || !result.stream) {
      return undefined;
    }

    const text = await new Response(result.stream).text();

    return JSON.parse(text) as T;
  } catch (error) {
    if (isUnavailableBlobStoreRead(error)) {
      blobReadsUnavailable = true;
      return undefined;
    }

    if (isMissingBlobRead(error)) {
      return undefined;
    }

    throw error;
  }
}

async function readStoredSnapshotIndex(
  retentionDays: SnapshotRetentionDays,
): Promise<SnapshotIndex> {
  const index = mergeSnapshotIndexes(await readSnapshotIndexJsonSources(), retentionDays);

  if (!index) {
    return emptySnapshotIndex(retentionDays);
  }

  return index;
}

async function readSnapshotIndexJsonSources(): Promise<SnapshotIndex[]> {
  const indexes: SnapshotIndex[] = [];

  if (shouldUseBlobStorage()) {
    const blobJson = await readBlobSnapshotIndexJson();

    if (blobJson) {
      indexes.push(blobJson);
    }

    const localJson = await readLocalJson<SnapshotIndex>(snapshotIndexPath);

    if (localJson) {
      indexes.push(localJson);
    }

    const staticJson = await readStaticJson<SnapshotIndex>(snapshotIndexPath);

    if (staticJson) {
      indexes.push(staticJson);
    }

    return indexes;
  }

  const localJson = await readLocalJson<SnapshotIndex>(snapshotIndexPath);

  if (localJson) {
    indexes.push(localJson);
  }

  const staticJson = await readStaticJson<SnapshotIndex>(snapshotIndexPath);

  if (staticJson) {
    indexes.push(staticJson);
  }

  return indexes;
}

async function readBlobSnapshotIndexJson(): Promise<SnapshotIndex | undefined> {
  return readBlobJson<SnapshotIndex>(snapshotIndexPath);
}

function mergeSnapshotIndexes(
  indexes: SnapshotIndex[],
  retentionDays: SnapshotRetentionDays,
): SnapshotIndex | undefined {
  if (indexes.length === 0) {
    return undefined;
  }

  const entriesByDate = new Map<string, SnapshotIndexEntry>();

  for (const index of indexes) {
    for (const entry of index.entries) {
      const existing = entriesByDate.get(entry.issueDate);

      if (!existing || shouldPreferIndexEntry(entry, existing)) {
        entriesByDate.set(entry.issueDate, entry);
      }
    }
  }

  return {
    schemaVersion: snapshotSchemaVersion,
    updatedAt: latestTimestamp(indexes.map((index) => index.updatedAt)),
    retentionDays,
    entries: applyRetentionLimit([...entriesByDate.values()].sort(compareIndexEntries), retentionDays),
  };
}

function shouldPreferIndexEntry(candidate: SnapshotIndexEntry, existing: SnapshotIndexEntry) {
  if (!existing.graphMetrics && candidate.graphMetrics) {
    return true;
  }

  return candidate.generatedAt.localeCompare(existing.generatedAt) > 0;
}

function latestTimestamp(values: string[]) {
  return values.reduce(
    (latest, value) => (value.localeCompare(latest) > 0 ? value : latest),
    new Date(0).toISOString(),
  );
}

function upsertSnapshotIndexEntry(
  previousIndex: SnapshotIndex,
  entry: SnapshotIndexEntry,
  retentionDays: SnapshotRetentionDays,
  updatedAt: string,
): SnapshotIndex {
  const entries = [entry, ...previousIndex.entries.filter((candidate) => candidate.issueDate !== entry.issueDate)]
    .sort(compareIndexEntries);

  return {
    schemaVersion: snapshotSchemaVersion,
    updatedAt,
    retentionDays,
    entries: applyRetentionLimit(entries, retentionDays),
  };
}

async function readLocalJson<T>(pathname: string): Promise<T | undefined> {
  try {
    const text = await readFile(localPath(pathname), "utf8");
    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

async function readStaticJson<T>(pathname: string): Promise<T | undefined> {
  if (!shouldUseStaticArchiveFallback()) {
    return undefined;
  }

  const fileJson = await readStaticFileJson<T>(pathname);

  if (fileJson) {
    return fileJson;
  }

  return readStaticUrlJson<T>(pathname);
}

async function readStaticFileJson<T>(pathname: string): Promise<T | undefined> {
  try {
    const text = await readFile(staticPath(pathname), "utf8");
    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

async function readStaticUrlJson<T>(pathname: string): Promise<T | undefined> {
  const origin = staticArchiveOrigin();

  if (!origin) {
    return undefined;
  }

  const response = await fetch(`${origin}/${pathname}`, { cache: "no-store" });

  if (!response.ok) {
    return undefined;
  }

  return JSON.parse(await response.text()) as T;
}

async function loadBlobSdk(): Promise<BlobSdk> {
  return import("@vercel/blob");
}

function shouldUseBlobStorage() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN) && process.env.PLA_DIFF_STORAGE !== "file";
}

function shouldUseStaticArchiveFallback() {
  return process.env.PLA_DIFF_STATIC_ARCHIVE !== "false";
}

function blobAccessType(): "public" | "private" {
  return process.env.PLA_DIFF_BLOB_ACCESS === "private" ? "private" : "public";
}

function localPath(pathname: string) {
  return join(localSnapshotRoot, ...pathname.split("/"));
}

function staticPath(pathname: string) {
  return join(staticSnapshotRoot, ...pathname.split("/"));
}

function staticArchiveOrigin() {
  const explicitOrigin =
    process.env.PLA_DIFF_STATIC_ARCHIVE_ORIGIN ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL;

  if (explicitOrigin) {
    return normalizeOrigin(explicitOrigin);
  }

  if (process.env.VERCEL_URL) {
    return normalizeOrigin(process.env.VERCEL_URL);
  }

  return undefined;
}

function normalizeOrigin(value: string) {
  const withProtocol = /^https?:\/\//.test(value) ? value : `https://${value}`;
  return withProtocol.replace(/\/$/, "");
}

function compareIndexEntries(left: { issueDate: string }, right: { issueDate: string }) {
  return right.issueDate.localeCompare(left.issueDate);
}

function applyRetentionLimit<T>(items: T[], retentionDays: SnapshotRetentionDays) {
  return retentionDays === null ? items : items.slice(0, retentionDays);
}

function isMissingBlobRead(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("400 bad request") ||
    message.includes("404 not found") ||
    error.name === "BlobNotFoundError"
  );
}

function isUnavailableBlobStoreRead(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("403") ||
    message.includes("blocked") ||
    message.includes("suspended") ||
    error.name === "BlobAccessError" ||
    error.name === "BlobStoreNotFoundError" ||
    error.name === "BlobStoreSuspendedError"
  );
}
