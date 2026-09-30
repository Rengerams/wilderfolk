# Archived scripts

Parked, not deleted. Each file here is either a one-off diagnostic probe or a tool that no longer
runs (the three cycle tools expect a graph shape this tree no longer has). Nothing in `src/`,
`tests/`, `scripts/` or `package.json` referenced them when they were moved.

**Do not add a new probe here.** If a harness cannot answer your question, extend the harness — see
AGENTS.md, "Extend the bot, do not write a new probe". This folder exists so that a future reader
sees *why* an instrument was retired rather than finding a broken file next to working ones.

Their relative imports (`../src/...`, `./...`) are stale: they were written at `scripts/`, and they
now sit one level deeper. Fix the path before reviving one.
