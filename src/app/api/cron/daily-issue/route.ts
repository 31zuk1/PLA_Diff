import { NextRequest } from "next/server";
import { buildDailyIssueSnapshot } from "@/lib/dailySnapshot";
import {
  issueDateInChinaTime,
  normalizeIssueDate,
  snapshotRetentionDays,
} from "@/lib/snapshotConfig";
import { storageDriverLabel, writeDailyIssueSnapshot } from "@/lib/snapshotStorage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const issueDate =
    normalizeIssueDate(request.nextUrl.searchParams.get("date")) ?? issueDateInChinaTime();
  const retentionDays = snapshotRetentionDays();
  const snapshot = await buildDailyIssueSnapshot(issueDate, { retentionDays });
  const index = await writeDailyIssueSnapshot(snapshot);

  return Response.json({
    ok: true,
    issueDate,
    generatedAt: snapshot.generatedAt,
    storage: storageDriverLabel(),
    counts: snapshot.counts,
    retainedDates: index.entries.map((entry) => entry.issueDate),
  });
}

function isAuthorizedCronRequest(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  return request.headers.get("authorization") === `Bearer ${secret}`;
}
