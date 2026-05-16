#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_ARCHIVE_DIR = path.join("public", "archive");
const GLOBAL_MAX_MATCHED_GROUP_TOTAL = 4;
const GLOBAL_MAX_MATCHED_SIDE_TOTAL = 2;

const goldenDates = [
  {
    date: "2026-04-22",
    matchedGroups: 6,
    maxGroupTotal: 3,
    groups: [
      {
        label: "Mozambique presidential meeting",
        people: ["习近平同莫桑比克总统查波会谈"],
        pla: ["习近平同莫桑比克总统查波会谈"],
      },
      {
        label: "Laos special envoy meeting",
        people: ["习近平会见老挝人民革命党中央总书记"],
        pla: ["习近平会见老挝人民革命党中央总书记"],
      },
      {
        label: "China-Mozambique joint statement",
        people: ["中华人民共和国和莫桑比克共和国关于构建新时代中莫命运共同体的联合声明"],
        pla: ["中华人民共和国和莫桑比克共和国关于构建新时代中莫命运共同体的联合声明"],
      },
      {
        label: "Ambassador appointment",
        people: ["国家主席习近平任免驻外大使"],
        pla: ["国家主席习近平任免驻外大使"],
      },
      {
        label: "Industrial economy release",
        people: ["工业经济向新向好稳中有进"],
        pla: ["向新向好 稳中有进"],
      },
      {
        label: "Yasukuni Shrine criticism",
        people: ["靖国神社献祭品"],
        pla: ["靖国神社"],
      },
    ],
  },
  {
    date: "2026-05-15",
    matchedGroups: 5,
    maxGroupTotal: 2,
    groups: [
      {
        label: "Trump meeting",
        people: ["习近平同美国总统特朗普会谈"],
        pla: ["习近平同美国总统特朗普会谈"],
      },
      {
        label: "Trump Temple of Heaven visit",
        people: ["习近平同美国总统特朗普参观天坛"],
        pla: ["习近平同美国总统特朗普参观天坛"],
      },
      {
        label: "Trump welcome banquet",
        people: ["习近平为美国总统特朗普举行欢迎宴会"],
        pla: ["习近平为美国总统特朗普举行欢迎宴会"],
      },
    ],
  },
  {
    date: "2026-05-16",
    matchedGroups: 5,
    maxGroupTotal: 4,
    forbiddenMatchedTitleTerms: ["短讯"],
    groups: [
      {
        label: "Trump Zhongnanhai meeting",
        people: ["习近平同美国总统特朗普在中南海小范围会晤"],
        pla: ["习近平同美国总统特朗普在中南海小范围会晤"],
      },
      {
        label: "Real economy duplicate bundle",
        people: ["做强做优做大实体经济"],
        pla: ["做强做优做大实体经济"],
      },
      {
        label: "Strategic stability duplicate bundle",
        people: ["构建“中美建设性战略稳定关系”"],
        pla: ["构建“中美建设性战略稳定关系”"],
      },
    ],
  },
];

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const archiveDir = path.resolve(options.archiveDir);
  const failures = [];
  const snapshots = readSnapshots(archiveDir);

  if (snapshots.length === 0) {
    failures.push(`No snapshot JSON files found in ${options.archiveDir}.`);
  }

  for (const snapshot of snapshots) {
    checkGlobalInvariants(snapshot, failures);
  }

  for (const expectation of goldenDates) {
    const snapshot = snapshots.find((candidate) => candidate.issueDate === expectation.date);

    if (!snapshot) {
      failures.push(`${expectation.date}: missing golden snapshot.`);
      continue;
    }

    checkGoldenDate(snapshot, expectation, failures);
  }

  if (failures.length > 0) {
    console.error("Golden archive check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Golden archive check passed: ${snapshots.length} snapshots, ${goldenDates.length} golden dates.`,
  );
}

function parseArgs(args) {
  const options = {
    archiveDir: DEFAULT_ARCHIVE_DIR,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--archive-dir") {
      options.archiveDir = readValue(args, ++index, arg);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
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

function readSnapshots(archiveDir) {
  return fs
    .readdirSync(archiveDir)
    .filter((entry) => entry.endsWith(".json") && entry !== "index.json")
    .sort()
    .map((entry) => {
      const snapshot = JSON.parse(fs.readFileSync(path.join(archiveDir, entry), "utf8"));
      return {
        ...snapshot,
        issueDate: snapshot.issueDate || entry.replace(".json", ""),
      };
    });
}

function checkGlobalInvariants(snapshot, failures) {
  const matchedGroups = matched(snapshot);

  for (const group of matchedGroups) {
    const total = articles(group, "people").length + articles(group, "pla").length;
    const people = articles(group, "people").length;
    const pla = articles(group, "pla").length;

    if (total > GLOBAL_MAX_MATCHED_GROUP_TOTAL) {
      failures.push(`${snapshot.issueDate}: matched group ${group.id} has ${total} articles.`);
    }

    if (people > GLOBAL_MAX_MATCHED_SIDE_TOTAL || pla > GLOBAL_MAX_MATCHED_SIDE_TOTAL) {
      failures.push(`${snapshot.issueDate}: matched group ${group.id} has side counts ${people}+${pla}.`);
    }
  }

  const countedMatchedGroups = numberOrUndefined(snapshot.counts?.matchedGroups);

  if (countedMatchedGroups !== undefined && countedMatchedGroups !== matchedGroups.length) {
    failures.push(
      `${snapshot.issueDate}: counts.matchedGroups=${countedMatchedGroups}, actual=${matchedGroups.length}.`,
    );
  }
}

function checkGoldenDate(snapshot, expectation, failures) {
  const matchedGroups = matched(snapshot);
  const maxGroupTotal = Math.max(
    0,
    ...matchedGroups.map((group) => articles(group, "people").length + articles(group, "pla").length),
  );

  if (matchedGroups.length !== expectation.matchedGroups) {
    failures.push(
      `${expectation.date}: expected ${expectation.matchedGroups} matched groups, got ${matchedGroups.length}.`,
    );
  }

  if (maxGroupTotal > expectation.maxGroupTotal) {
    failures.push(
      `${expectation.date}: expected max matched group size <= ${expectation.maxGroupTotal}, got ${maxGroupTotal}.`,
    );
  }

  for (const expectedGroup of expectation.groups) {
    if (!findGroup(matchedGroups, expectedGroup)) {
      failures.push(`${expectation.date}: missing golden group "${expectedGroup.label}".`);
    }
  }

  for (const forbiddenTerm of expectation.forbiddenMatchedTitleTerms ?? []) {
    const forbiddenGroup = matchedGroups.find((group) =>
      titles(group, "people").concat(titles(group, "pla")).some((title) => title.includes(forbiddenTerm)),
    );

    if (forbiddenGroup) {
      failures.push(`${expectation.date}: forbidden term "${forbiddenTerm}" appears in matched group ${forbiddenGroup.id}.`);
    }
  }
}

function findGroup(groups, expectedGroup) {
  return groups.find((group) =>
    expectedGroup.people.every((term) => titles(group, "people").some((title) => title.includes(term))) &&
    expectedGroup.pla.every((term) => titles(group, "pla").some((title) => title.includes(term))),
  );
}

function matched(snapshot) {
  return asArray(snapshot.matchGroups).filter((group) => group.matchType === "matched");
}

function titles(group, side) {
  return articles(group, side)
    .map((article) => article.title || article.headline || article.id)
    .filter(Boolean)
    .map(String);
}

function articles(group, side) {
  return side === "people" ? asArray(group.peopleArticles) : asArray(group.plaArticles);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function numberOrUndefined(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function printHelp() {
  console.log(`Usage:
  node scripts/check-golden-archive.mjs [options]

Options:
  --archive-dir PATH    Archive directory. Default: ${DEFAULT_ARCHIVE_DIR}
  --help                Show this help.
`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
