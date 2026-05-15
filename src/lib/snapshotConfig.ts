export const snapshotSchemaVersion = 1;
export const snapshotArchivePrefix = "archive";
export const snapshotIndexPath = `${snapshotArchivePrefix}/index.json`;
export const defaultSnapshotRetentionDays = 31;
export const frontPageNumbers = [1, 2, 3, 4] as const;

export function normalizeIssueDate(value: string | undefined | null) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  return undefined;
}

export function snapshotPathForDate(issueDate: string) {
  return `${snapshotArchivePrefix}/${issueDate}.json`;
}

export function issueDateInChinaTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Shanghai",
    year: "numeric",
  }).formatToParts(now);

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value;

  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function snapshotRetentionDays() {
  const value = Number.parseInt(process.env.SNAPSHOT_RETENTION_DAYS ?? "", 10);

  if (Number.isFinite(value) && value > 0) {
    return value;
  }

  return defaultSnapshotRetentionDays;
}
