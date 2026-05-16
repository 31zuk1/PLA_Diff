#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_INPUT = path.join("public", "archive");
const DEFAULT_LARGE_GROUP_THRESHOLD = 6;

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const inputPaths = options.paths.length > 0 ? options.paths : [DEFAULT_INPUT];
  const files = collectJsonFiles(inputPaths);
  const snapshots = files
    .map(readSnapshotFile)
    .filter(Boolean)
    .filter((snapshot) => isInRequestedWindow(snapshot.issueDate, options))
    .sort((left, right) => left.issueDate.localeCompare(right.issueDate));

  if (snapshots.length === 0) {
    console.error("No snapshot-like JSON files matched the requested input/date filters.");
    process.exitCode = 1;
    return;
  }

  const reports = snapshots.map((snapshot) => buildSnapshotReport(snapshot, options.threshold));

  if (options.json) {
    console.log(JSON.stringify(reports, null, 2));
    return;
  }

  printReports(reports);
}

function parseArgs(args) {
  const options = {
    paths: [],
    date: undefined,
    from: undefined,
    to: undefined,
    days: undefined,
    threshold: DEFAULT_LARGE_GROUP_THRESHOLD,
    json: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--date") {
      options.date = readValue(args, ++index, arg);
    } else if (arg === "--from") {
      options.from = readValue(args, ++index, arg);
    } else if (arg === "--to") {
      options.to = readValue(args, ++index, arg);
    } else if (arg === "--days") {
      options.days = readPositiveInteger(readValue(args, ++index, arg), arg);
    } else if (arg === "--threshold") {
      options.threshold = readPositiveInteger(readValue(args, ++index, arg), arg);
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      options.paths.push(arg);
    }
  }

  if (options.date) {
    options.from = options.date;
    options.to = options.date;
  }

  if (options.days !== undefined && options.days < 1) {
    throw new Error("--days must be 1 or greater.");
  }

  return options;
}

function readValue(args, index, flag) {
  const value = args[index];

  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}

function readPositiveInteger(value, flag) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} requires a positive integer.`);
  }

  return parsed;
}

function collectJsonFiles(inputPaths) {
  const files = [];

  for (const inputPath of inputPaths) {
    const absolutePath = path.resolve(inputPath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Input path does not exist: ${inputPath}`);
    }

    const stat = fs.statSync(absolutePath);

    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(absolutePath)) {
        if (entry.endsWith(".json")) {
          files.push(path.join(absolutePath, entry));
        }
      }
    } else if (stat.isFile() && absolutePath.endsWith(".json")) {
      files.push(absolutePath);
    }
  }

  return files.filter((file) => path.basename(file) !== "index.json");
}

function readSnapshotFile(file) {
  const raw = fs.readFileSync(file, "utf8");
  const data = JSON.parse(raw);
  const snapshot = normalizeSnapshot(data, file);

  if (!snapshot) {
    return undefined;
  }

  return snapshot;
}

function normalizeSnapshot(data, file) {
  const matchGroups = asArray(
    data.matchGroups || data.groups || data.result?.matchGroups || data.snapshot?.matchGroups,
  );
  const issueDate =
    data.issueDate ||
    data.date ||
    data.result?.issueDate ||
    data.snapshot?.issueDate ||
    inferDateFromFilename(file);

  if (!issueDate || matchGroups.length === 0) {
    return undefined;
  }

  const peopleIssue = data.peopleIssue || data.result?.peopleIssue || data.snapshot?.peopleIssue;
  const plaIssue = data.plaIssue || data.result?.plaIssue || data.snapshot?.plaIssue;
  const counts = data.counts || data.result?.counts || data.snapshot?.counts || {};

  return {
    file,
    issueDate,
    generatedAt: data.generatedAt || data.result?.generatedAt || data.snapshot?.generatedAt,
    judge: data.judge || data.result?.judge || data.snapshot?.judge,
    peopleIssue,
    plaIssue,
    matchGroups,
    counts,
  };
}

function inferDateFromFilename(file) {
  const match = path.basename(file).match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : undefined;
}

function isInRequestedWindow(issueDate, options) {
  const from = options.from;
  const to = calculateEndDate(options.from, options.to, options.days);

  if (from && issueDate < from) {
    return false;
  }

  if (to && issueDate > to) {
    return false;
  }

  return true;
}

function calculateEndDate(from, to, days) {
  if (to) {
    return to;
  }

  if (!from || !days) {
    return undefined;
  }

  const start = new Date(`${from}T00:00:00Z`);

  if (Number.isNaN(start.getTime())) {
    throw new Error(`Invalid --from date: ${from}`);
  }

  start.setUTCDate(start.getUTCDate() + days - 1);
  return start.toISOString().slice(0, 10);
}

function buildSnapshotReport(snapshot, threshold) {
  const peopleArticleCount =
    numberOrUndefined(snapshot.counts.peopleArticles) ?? countIssueArticles(snapshot.peopleIssue);
  const plaArticleCount =
    numberOrUndefined(snapshot.counts.plaArticles) ?? countIssueArticles(snapshot.plaIssue);
  const matchedGroups = snapshot.matchGroups.filter((group) => normalizeMatchType(group) === "matched");
  const peopleOnlyGroups = snapshot.matchGroups.filter(
    (group) => normalizeMatchType(group) === "people_only",
  );
  const plaOnlyGroups = snapshot.matchGroups.filter((group) => normalizeMatchType(group) === "pla_only");
  const matchedGroupReports = matchedGroups.map(buildGroupReport);
  const maxMatchedGroupSize = maxOrZero(matchedGroupReports.map((group) => group.totalArticles));
  const suspiciousGroups = matchedGroupReports
    .filter(
      (group) =>
        group.totalArticles >= threshold ||
        group.peopleArticles >= threshold ||
        group.plaArticles >= threshold,
    )
    .sort((left, right) => right.totalArticles - left.totalArticles);

  return {
    issueDate: snapshot.issueDate,
    file: path.relative(process.cwd(), snapshot.file),
    generatedAt: snapshot.generatedAt,
    judgeEnabled: snapshot.judge?.enabled,
    judgeModel: snapshot.judge?.model,
    peopleArticles: peopleArticleCount,
    plaArticles: plaArticleCount,
    totalArticles: peopleArticleCount + plaArticleCount,
    matchedGroups: matchedGroups.length,
    maxMatchedGroupSize,
    matchedPeopleArticles:
      numberOrUndefined(snapshot.counts.matchedPeopleArticles) ??
      sum(matchedGroupReports.map((group) => group.peopleArticles)),
    matchedPlaArticles:
      numberOrUndefined(snapshot.counts.matchedPlaArticles) ??
      sum(matchedGroupReports.map((group) => group.plaArticles)),
    peopleOnlyArticles:
      numberOrUndefined(snapshot.counts.peopleOnlyArticles) ??
      sum(peopleOnlyGroups.map((group) => articleCount(group, "people"))),
    plaOnlyArticles:
      numberOrUndefined(snapshot.counts.plaOnlyArticles) ??
      sum(plaOnlyGroups.map((group) => articleCount(group, "pla"))),
    peopleOnlyGroups: peopleOnlyGroups.length,
    plaOnlyGroups: plaOnlyGroups.length,
    suspiciousGroups,
  };
}

function buildGroupReport(group) {
  const peopleArticles = articleCount(group, "people");
  const plaArticles = articleCount(group, "pla");

  return {
    id: String(group.id || "(no-id)"),
    confidence: numberOrUndefined(group.confidence),
    peopleArticles,
    plaArticles,
    totalArticles: peopleArticles + plaArticles,
    reason: truncateText(String(group.reason || ""), 120),
    peopleTitles: articleTitles(group, "people").slice(0, 4),
    plaTitles: articleTitles(group, "pla").slice(0, 4),
  };
}

function normalizeMatchType(group) {
  const matchType = group.matchType;

  if (matchType === "matched") {
    return "matched";
  }

  if (matchType === "people_only" || matchType === "pla_only") {
    return matchType;
  }

  if (asArray(group.peopleArticles).length > 0 && asArray(group.plaArticles).length > 0) {
    return "matched";
  }

  if (asArray(group.peopleArticleIds).length > 0 && asArray(group.plaArticleIds).length > 0) {
    return "matched";
  }

  if (asArray(group.peopleArticles).length > 0 || asArray(group.peopleArticleIds).length > 0) {
    return "people_only";
  }

  if (asArray(group.plaArticles).length > 0 || asArray(group.plaArticleIds).length > 0) {
    return "pla_only";
  }

  return String(matchType || "unknown");
}

function countIssueArticles(issue) {
  return asArray(issue?.pages).reduce((total, page) => total + asArray(page.articles).length, 0);
}

function articleCount(group, side) {
  if (side === "people") {
    return asArray(group.peopleArticles).length || asArray(group.peopleArticleIds).length;
  }

  return asArray(group.plaArticles).length || asArray(group.plaArticleIds).length;
}

function articleTitles(group, side) {
  const articles = side === "people" ? asArray(group.peopleArticles) : asArray(group.plaArticles);

  return articles
    .map((article) => article.title || article.headline || article.id)
    .filter(Boolean)
    .map(String);
}

function printReports(reports) {
  const rows = reports.map((report) => ({
    date: report.issueDate,
    articles: `${report.peopleArticles}+${report.plaArticles}=${report.totalArticles}`,
    mached: String(report.matchedGroups),
    maxGroup: String(report.maxMatchedGroupSize),
    matchedArticles: `${report.matchedPeopleArticles}+${report.matchedPlaArticles}`,
    only: `${report.peopleOnlyArticles}+${report.plaOnlyArticles}`,
    suspicious: report.suspiciousGroups.length ? String(report.suspiciousGroups.length) : "-",
  }));

  console.log("");
  console.log("MATCH diagnostics");
  console.log(formatTable(rows, ["date", "articles", "mached", "maxGroup", "matchedArticles", "only", "suspicious"]));
  console.log("");
  console.log("Legend: articles/only/matchedArticles are PeopleDaily+PLADaily counts. suspicious uses matched group size threshold.");

  const suspiciousReports = reports.filter((report) => report.suspiciousGroups.length > 0);

  if (suspiciousReports.length === 0) {
    console.log("Suspicious giant groups: none");
    return;
  }

  console.log("");
  console.log("Suspicious giant groups");

  for (const report of suspiciousReports) {
    console.log(`\n${report.issueDate}`);

    for (const group of report.suspiciousGroups) {
      const confidence =
        group.confidence === undefined ? "n/a" : `${Math.round(group.confidence * 100)}%`;
      console.log(
        `- ${group.id}: total=${group.totalArticles}, people=${group.peopleArticles}, pla=${group.plaArticles}, confidence=${confidence}`,
      );

      if (group.peopleTitles.length > 0) {
        console.log(`  People: ${group.peopleTitles.join(" / ")}`);
      }

      if (group.plaTitles.length > 0) {
        console.log(`  PLA: ${group.plaTitles.join(" / ")}`);
      }

      if (group.reason) {
        console.log(`  reason: ${group.reason}`);
      }
    }
  }
}

function formatTable(rows, columns) {
  const widths = {};

  for (const column of columns) {
    widths[column] = Math.max(
      column.length,
      ...rows.map((row) => String(row[column] ?? "").length),
    );
  }

  const header = columns.map((column) => pad(String(column), widths[column])).join("  ");
  const divider = columns.map((column) => "-".repeat(widths[column])).join("  ");
  const body = rows
    .map((row) => columns.map((column) => pad(String(row[column] ?? ""), widths[column])).join("  "))
    .join("\n");

  return `${header}\n${divider}\n${body}`;
}

function pad(value, width) {
  return value + " ".repeat(Math.max(0, width - value.length));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function numberOrUndefined(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function maxOrZero(values) {
  return values.length ? Math.max(...values) : 0;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function truncateText(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function printHelp() {
  console.log(`Usage:
  node scripts/diagnose-match-groups.mjs [paths...] [options]

Inputs:
  paths                 Snapshot JSON files or directories. Default: public/archive

Options:
  --date YYYY-MM-DD     Inspect one issue date.
  --from YYYY-MM-DD     Start date, inclusive.
  --to YYYY-MM-DD       End date, inclusive.
  --days N              With --from, inspect N calendar days.
  --threshold N         Flag matched groups with at least N total/side articles. Default: ${DEFAULT_LARGE_GROUP_THRESHOLD}
  --json                Print machine-readable JSON.
  --help                Show this help.

Examples:
  node scripts/diagnose-match-groups.mjs --date 2026-04-22
  node scripts/diagnose-match-groups.mjs --from 2026-04-22 --days 7
  node scripts/diagnose-match-groups.mjs public/archive --from 2026-04-16 --days 31
`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
