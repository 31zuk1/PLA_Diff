# AGENTS.md

## Project identity

This repository builds PeoplePLA Diff, a research-oriented web app for comparing narrative framing between 人民日報 and 解放軍報.

The product is not a generic news site, not a full-text mirror, and not a simple article similarity demo.

The current PoC starts from issue pages and article match groups, then uses topic clusters as the interpretive layer.

Article pairs are useful for discovery and review, but the product should still avoid implying that every comparison is a simple one-to-one article diff.

## Core design rules

- Prefer article-first acquisition and review, then topic-level interpretation.
- Support N-to-M article relationships.
- Every narrative claim should ideally be tied to evidence snippets.
- Distinguish lexical similarity from narrative similarity.
- Do not overtrust shared Chinese official slogans as proof of topic match.
- Make match type explicit.
- Show uncertainty and confidence.
- Avoid UI patterns that imply full-text reproduction of source articles.

## Required analysis dimensions

Each comparison should make these differences visible:

- core frame
- main actors
- beneficiaries
- threat or problem definition
- proposed solution
- authority source
- action verbs
- lexical contrast
- omissions / silence map

## Engineering preferences

- Use TypeScript strictly.
- Keep components small and readable.
- Prefer explicit data types over loosely shaped objects.
- Keep mock data realistic and useful for demonstration.
- Do not add heavy dependencies without a clear reason.
- Run lint/build after meaningful changes.
- Update README when changing architecture or data model.
