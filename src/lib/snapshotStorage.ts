import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DailyIssueSnapshot, SnapshotIndex } from "./dailySnapshot";
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
  const index = await readJson<SnapshotIndex>(snapshotIndexPath);

  if (!index) {
    return emptySnapshotIndex(snapshotRetentionDays());
  }

  return {
    ...index,
    entries: [...index.entries].sort(compareIndexEntries),
  };
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

  if (shouldUseBlobStorage()) {
    const nextIndex = await buildBlobSnapshotIndex(entry, retentionDays, snapshot.generatedAt);

    await writeJson(snapshotIndexPath, nextIndex);

    return nextIndex;
  }

  const previousIndex = await readSnapshotIndex();
  const entries = [entry, ...previousIndex.entries.filter((candidate) => candidate.issueDate !== snapshot.issueDate)]
    .sort(compareIndexEntries);
  const nextIndex: SnapshotIndex = {
    schemaVersion: snapshot.schemaVersion,
    updatedAt: snapshot.generatedAt,
    retentionDays,
    entries: applyRetentionLimit(entries, retentionDays),
  };

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

async function buildBlobSnapshotIndex(
  currentEntry: ReturnType<typeof toSnapshotIndexEntry>,
  retentionDays: SnapshotRetentionDays,
  updatedAt: string,
): Promise<SnapshotIndex> {
  const { list } = await loadBlobSdk();
  const { blobs } = await list({ limit: 1000, prefix: "archive/" });
  const snapshotBlobs = applyRetentionLimit(
    blobs
      .filter((blob) => /^\d{4}-\d{2}-\d{2}\.json$/.test(blob.pathname.replace("archive/", "")))
      .sort((left, right) => right.pathname.localeCompare(left.pathname)),
    retentionDays,
  );
  const entries = (
    await Promise.all(
      snapshotBlobs.map(async (blob) => {
        if (blob.pathname === currentEntry.path) {
          return currentEntry;
        }

        const snapshot = await readBlobJson<DailyIssueSnapshot>(blob.pathname);
        return snapshot ? toSnapshotIndexEntry(snapshot) : undefined;
      }),
    )
  )
    .filter((entry): entry is ReturnType<typeof toSnapshotIndexEntry> => Boolean(entry))
    .sort(compareIndexEntries);

  return {
    schemaVersion: snapshotSchemaVersion,
    updatedAt,
    retentionDays,
    entries,
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
