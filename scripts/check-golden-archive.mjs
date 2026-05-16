#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_ARCHIVE_DIR = path.join("public", "archive");
const GLOBAL_MAX_MATCHED_GROUP_TOTAL = 4;
const GLOBAL_MAX_MATCHED_SIDE_TOTAL = 2;

const globalForbiddenMatchedPairs = [
  {
    label: "generic image-only card",
    peopleAny: ["图片报道"],
    plaAny: ["图片"],
  },
];

const goldenDates = [
  {
    date: "2026-04-17",
    groups: [
      {
        label: "Correct performance view learning education",
        people: ["树立和践行正确政绩观"],
        pla: ["以坚强党性涵养正确政绩观"],
      },
    ],
  },
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
    date: "2026-04-23",
    groups: [
      {
        label: "Volunteer remains return",
        people: ["第十三批在韩中国人民志愿军烈士遗骸回国"],
        pla: ["第十三批在韩中国人民志愿军烈士遗骸回国"],
      },
    ],
  },
  {
    date: "2026-05-01",
    groups: [
      {
        label: "Basic research foundation",
        people: ["以更大力度更实举措加强基础研究"],
        pla: ["以更大力度更实举措加强基础研究"],
      },
      {
        label: "May Day editorial",
        people: ["在新征程上团结奋斗不懈奋斗"],
        pla: ["在新征程上团结奋斗不懈奋斗"],
      },
      {
        label: "Most beautiful workers release",
        people: ["联合发布2026年“最美职工”"],
        pla: ["中央宣传部、全国总工会联合发布2026年“最美职工”"],
      },
    ],
  },
  {
    date: "2026-05-03",
    forbiddenPairs: [
      {
        label: "generic strong-country/struggle overlap",
        peopleAny: ["怀爱国之心", "以不懈奋斗书写青春华章"],
        plaAny: ["科技强国努力奋斗", "强国强军靠奋斗", "强国强军的时代洪流"],
      },
    ],
  },
  {
    date: "2026-05-05",
    groups: [
      {
        label: "Major country benefits the world",
        people: ["大国之大利天下"],
        pla: ["大国之大利天下"],
      },
      {
        label: "May Fourth theme league day",
        people: ["各地广泛开展五四主题团日活动"],
        pla: ["五四主题团日活动"],
      },
    ],
  },
  {
    date: "2026-05-10",
    groups: [
      {
        label: "AI ethics review pilot",
        people: ["人工智能科技伦理审查与服务先导计划启动"],
        pla: ["工信部启动人工智能科技伦理审查与服务先导计划"],
      },
      {
        label: "Shipbuilding industry statistics",
        people: ["我国造船完工量同比增46%"],
        pla: ["一季度我国造船三大指标全面增长"],
      },
    ],
  },
  {
    date: "2026-05-13",
    groups: [
      {
        label: "Disaster prevention week",
        people: ["全国防灾减灾日暨防灾减灾宣传周主场活动举行"],
        pla: ["2026年全国防灾减灾日暨防灾减灾宣传周主场活动举行"],
      },
    ],
  },
  {
    date: "2026-05-14",
    forbiddenPairs: [
      {
        label: "US-China people exchange vs China-Latin America community",
        peopleAny: ["推动中美两国民间交往走深走实"],
        plaAny: ["中国将不断推动共建中拉命运共同体五大工程走深走实"],
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
  const articleGroups = new Map();

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

    for (const side of ["people", "pla"]) {
      for (const article of articles(group, side)) {
        const articleId = articleKey(article);

        if (!articleId) {
          continue;
        }

        const key = `${side}:${articleId}`;
        const groups = articleGroups.get(key) ?? {
          side,
          articleId,
          title: stringOrUndefined(article.title || article.headline) ?? "(untitled)",
          groupIds: [],
        };
        groups.groupIds.push(group.id);
        articleGroups.set(key, groups);
      }
    }
  }

  const countedMatchedGroups = numberOrUndefined(snapshot.counts?.matchedGroups);

  if (countedMatchedGroups !== undefined && countedMatchedGroups !== matchedGroups.length) {
    failures.push(
      `${snapshot.issueDate}: counts.matchedGroups=${countedMatchedGroups}, actual=${matchedGroups.length}.`,
    );
  }

  for (const article of articleGroups.values()) {
    const uniqueGroupIds = [...new Set(article.groupIds)];

    if (uniqueGroupIds.length > 1) {
      failures.push(
        `${snapshot.issueDate}: ${article.side} article ${article.articleId} is reused across matched groups ${uniqueGroupIds.join(
          ", ",
        )} (${article.title}). Merge or choose the strongest relation.`,
      );
    }
  }

  checkForbiddenPairs(snapshot, globalForbiddenMatchedPairs, failures);
}

function checkGoldenDate(snapshot, expectation, failures) {
  const matchedGroups = matched(snapshot);
  const maxGroupTotal = Math.max(
    0,
    ...matchedGroups.map((group) => articles(group, "people").length + articles(group, "pla").length),
  );

  if (expectation.matchedGroups !== undefined && matchedGroups.length !== expectation.matchedGroups) {
    failures.push(
      `${expectation.date}: expected ${expectation.matchedGroups} matched groups, got ${matchedGroups.length}.`,
    );
  }

  if (expectation.maxGroupTotal !== undefined && maxGroupTotal > expectation.maxGroupTotal) {
    failures.push(
      `${expectation.date}: expected max matched group size <= ${expectation.maxGroupTotal}, got ${maxGroupTotal}.`,
    );
  }

  for (const expectedGroup of expectation.groups ?? []) {
    if (!findGroup(matchedGroups, expectedGroup)) {
      failures.push(
        `${expectation.date}: missing golden group "${expectedGroup.label}" (people: ${expectedGroup.people.join(
          " / ",
        )}; 81cn: ${expectedGroup.pla.join(" / ")}).`,
      );
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

  checkForbiddenPairs(snapshot, expectation.forbiddenPairs ?? [], failures);
}

function findGroup(groups, expectedGroup) {
  return groups.find((group) =>
    expectedGroup.people.every((term) => titles(group, "people").some((title) => title.includes(term))) &&
    expectedGroup.pla.every((term) => titles(group, "pla").some((title) => title.includes(term))),
  );
}

function checkForbiddenPairs(snapshot, forbiddenPairs, failures) {
  if (forbiddenPairs.length === 0) {
    return;
  }

  const matchedGroups = matched(snapshot);

  for (const forbiddenPair of forbiddenPairs) {
    const forbiddenGroup = matchedGroups.find(
      (group) =>
        hasAnyTitle(group, "people", forbiddenPair.peopleAny) && hasAnyTitle(group, "pla", forbiddenPair.plaAny),
    );

    if (forbiddenGroup) {
      failures.push(
        `${snapshot.issueDate}: forbidden match "${forbiddenPair.label}" appears in group ${
          forbiddenGroup.id
        } (${describeGroupTitles(forbiddenGroup)}).`,
      );
    }
  }
}

function hasAnyTitle(group, side, terms) {
  return terms.some((term) => titles(group, side).some((title) => title.includes(term)));
}

function describeGroupTitles(group) {
  const peopleTitles = titles(group, "people").join(" | ") || "no People's articles";
  const plaTitles = titles(group, "pla").join(" | ") || "no 81cn articles";
  return `People: ${peopleTitles}; 81cn: ${plaTitles}`;
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

function articleKey(article) {
  return (
    stringOrUndefined(article.id) ??
    stringOrUndefined(article.sourceArticleId) ??
    stringOrUndefined(article.extraction?.sourceArticleId) ??
    [
      article.source ?? "article",
      article.issueDate ?? article.date ?? "unknown",
      article.pageNumber ?? article.page ?? "x",
      article.title ?? article.headline ?? "(untitled)",
    ].join(":")
  );
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function numberOrUndefined(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringOrUndefined(value) {
  return typeof value === "string" && value.trim() ? value : undefined;
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
