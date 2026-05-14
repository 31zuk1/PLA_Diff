import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DailyIssueSnapshot, SnapshotIndex } from "./dailySnapshot";
import { emptySnapshotIndex, toSnapshotIndexEntry } from "./dailySnapshot";
import {
  snapshotIndexPath,
  snapshotPathForDate,
  snapshotRetentionDays,
} from "./snapshotConfig";

type BlobSdk = typeof import("@vercel/blob");

const localSnapshotRoot = join(process.cwd(), ".cache", "peoplepla-diff");

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
  const previousIndex = await readSnapshotIndex();
  const entry = toSnapshotIndexEntry(snapshot);
  const entries = [entry, ...previousIndex.entries.filter((candidate) => candidate.issueDate !== snapshot.issueDate)]
    .sort(compareIndexEntries)
    .slice(0, retentionDays);
  const retainedPaths = new Set(entries.map((candidate) => candidate.path));
  const obsoletePaths = previousIndex.entries
    .filter((candidate) => !retainedPaths.has(candidate.path))
    .map((candidate) => candidate.path);
  const nextIndex: SnapshotIndex = {
    schemaVersion: snapshot.schemaVersion,
    updatedAt: snapshot.generatedAt,
    retentionDays,
    entries,
  };

  await writeJson(entry.path, snapshot);
  await writeJson(snapshotIndexPath, nextIndex);
  await deleteJsonFiles(obsoletePaths);

  return nextIndex;
}

export function storageDriverLabel() {
  return shouldUseBlobStorage() ? "vercel-blob" : "local-file";
}

async function readJson<T>(pathname: string): Promise<T | undefined> {
  if (shouldUseBlobStorage()) {
    return readBlobJson<T>(pathname);
  }

  return readLocalJson<T>(pathname);
}

async function writeJson(pathname: string, value: unknown) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;

  if (shouldUseBlobStorage()) {
    const { put } = await loadBlobSdk();
    await put(pathname, serialized, {
      access: "public",
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

async function deleteJsonFiles(pathnames: string[]) {
  if (pathnames.length === 0) {
    return;
  }

  if (shouldUseBlobStorage()) {
    const { del } = await loadBlobSdk();
    await del(pathnames);
    return;
  }

  await Promise.all(
    pathnames.map(async (pathname) => {
      await rm(localPath(pathname), { force: true });
    }),
  );
}

async function readBlobJson<T>(pathname: string): Promise<T | undefined> {
  try {
    const { list } = await loadBlobSdk();
    const { blobs } = await list({ limit: 1, prefix: pathname });
    const blob = blobs.find((candidate) => candidate.pathname === pathname);

    if (!blob) {
      return undefined;
    }

    const response = await fetch(blob.url, { cache: "no-store" });

    if (!response.ok) {
      return undefined;
    }

    const text = await response.text();

    return JSON.parse(text) as T;
  } catch (error) {
    if (isMissingBlobRead(error)) {
      return undefined;
    }

    throw error;
  }
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

async function loadBlobSdk(): Promise<BlobSdk> {
  return import("@vercel/blob");
}

function shouldUseBlobStorage() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN) && process.env.PLA_DIFF_STORAGE !== "file";
}

function localPath(pathname: string) {
  return join(localSnapshotRoot, ...pathname.split("/"));
}

function compareIndexEntries(left: { issueDate: string }, right: { issueDate: string }) {
  return right.issueDate.localeCompare(left.issueDate);
}

function isMissingBlobRead(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("400 Bad Request") ||
    error.message.includes("404 Not Found") ||
    error.name === "BlobNotFoundError"
  );
}
