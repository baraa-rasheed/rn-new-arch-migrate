# Ecosystem: codebase scan/map/index tools for AI agents

Researched 2026-10-26. The goal is to stop agents from grepping blind. We **orchestrate** these tools; we don't fork them. This sits next to Repomix (packing) and Aider-style repo maps.
Our pipeline stages: **scan → map → detect → migrate → AI → verify**.
"verify" in the License column means the license isn't confirmed yet. Check it before vendoring.

| Tool | What it does | CLI / MCP | License | Stage fit | Decision |
|---|---|---|---|---|---|
| **Graphify** (Graphify-Labs/graphify) | Builds a tree-sitter AST knowledge graph (~40 languages) and writes `graph.json`, `GRAPH_REPORT.md` and `graph.html`. Every edge is tagged EXTRACTED / INFERRED / AMBIGUOUS. Commands: `query`, `path`, `explain`, `prs`. | `graphify` CLI (`uv tool install graphifyy`) + `graphify-mcp` | Apache-2.0 | map | **Wrap**: run `graphify extract . --code-only` and feed `graph.json` into map/AI context |
| **ripwire** (redhat-et/ripwire) | C++23 binary that gives a ranked call-graph map (`ripwire .`, `--for`, `--callers`). Also reports blast radius, tests-to-run and quality deltas on edits. | CLI-first + optional MCP | verify | map + **verify** | **Wrap**: map before migrate, blast radius/tests after |
| **Vesalius** (haplollc/Vesalius, @JC_builds) | Local SQLite code graph with 5 MCP tools (usages, feature_map, outline, architecture, dependency_cycles) and CLI commands (impact, unused, hotspots). Author reports about 51% fewer tokens on Claude Code. | brew CLI + MCP + Mac app | verify | map | **Skip for now**: macOS/Swift-centric. Optional only for iOS native modules |
| **Serena** (oraios/serena) | MCP toolkit backed by LSP for semantic symbol find, references and symbol-level edits. Works with TS/JS. | MCP server (`uvx`) | MIT | AI + migrate | **Integrate as recommended MCP**: lets the agent edit by symbol, not by text |
| **ast-grep** | Structural search/rewrite on tree-sitter with YAML rules. Covers TS/TSX/Kotlin/Swift/ObjC. | `sg` CLI | MIT | detect + migrate | **Integrate (core)**: codemod rules for old-arch → new-arch (NativeModules, requireNativeComponent, bridge APIs) |
| **Semgrep** (CE) | Pattern and dataflow rules with SARIF output. | `semgrep` CLI | LGPL-2.1 (engine); rules have their own licenses | detect + verify | **Wrap**: optional rule pack and CI SARIF. ast-grep stays the primary engine |
| **RTK** (rtk-ai/rtk) | Rust proxy that compresses shell output (git, tests, tsc, grep, ast-grep) by 60–90%, using hooks for Claude Code/Cursor/Codex. | `rtk` CLI | verify (MIT reported) | AI (context hygiene) | **Recommend, don't bundle**: document `rtk init` in agent setup |
| **Headroom** (headroomlabs-ai/headroom) | Context-compression layer/proxy for agent traffic. Its AGENTS.md also uses RTK. | proxy/lib | verify | AI | **Skip/optional**: overlaps with RTK. Re-evaluate later |
| **Continue indexing** | IDE codebase index (embeddings + tree-sitter chunking, `@codebase`). | IDE ext; no standalone CLI | Apache-2.0 | (map) | **Skip**: tied to the IDE. Borrow the chunking idea only |
| **Sourcegraph Cody patterns** | Combines precise SCIP indexes, search and context ranking. | `scip-typescript` CLI, `src` CLI | scip-typescript Apache-2.0; Cody/Sourcegraph partly proprietary | map | **Borrow the pattern**: optional `scip-typescript index` for precise refs. Skip Cody itself |
| **universal-ctags** | Symbol tag index for many languages, including ObjC/Swift/Kotlin. | `ctags` | GPL-2.0 (run it as an external binary; don't vendor it) | scan/map | **Wrap**: cheap fallback symbol list, Aider-style |
| **tree-sitter CLI** | Parse/query grammars. Aider's repo map is built on tree-sitter tags. | `tree-sitter` | MIT | map | **Integrate indirectly** through ast-grep/Graphify. Use the CLI directly only for custom tag queries |
| **Repomix** (already used) | Packs the repo into one AI-friendly file, with `--compress` (tree-sitter). | CLI + MCP | MIT | AI | Keep |
| **Aider repo map** (already used) | PageRank-ranked tree-sitter symbol map. | inside aider | Apache-2.0 | map | Keep (pattern) |

## Expo / React Native-specific tools
- **`npx expo-doctor`** (MIT, Expo): checks dependencies and config against the SDK. Stage: **scan/verify**. **Integrate (core).**
- **`npx expo install --check` / `--fix`**: aligns versions to the SDK. Stage: **migrate**. **Integrate.**
- **React Native Directory** (`reactnative.directory`, API + `newArchitecture` flag; MIT data repo): checks each package's new-arch support. Stage: **detect**. **Integrate**; this feeds `package-replacements.md`.
- **`@react-native-community/cli` doctor + upgrade-helper** (rn-diff-purge, MIT): diffs native templates between RN versions. Stage: **migrate**. **Wrap.**
- **Codegen** (`react-native codegen`) and the RN "Interop Layer" check: verifies TurboModule/Fabric specs. Stage: **verify**. **Wrap.**
- **Knip** (ISC): finds unused deps/files before migrating. Stage: **scan**. Optional.

## Callstack
- **agent-skills** (`callstackincubator/agent-skills`, MIT, ~1.2k★): skills `react-native-best-practices` (perf/bundle/Hermes/TurboModules; synced to the 2026 optimization guide), `upgrading-react-native`, `react-native-brownfield-migration`, `github`, `github-actions`. Install: `npx skills add callstackincubator/agent-skills` or Claude `/plugin marketplace add callstackincubator/agent-skills`. Stage: **AI/plan**. **Integrate (reference):** our SKILL.md defers to them for upgrade pitfalls and perf fixes; scan detects a local install.
- **React Native Testing Library** (`@testing-library/react-native`, MIT): test runner helpers. Stage: **verify**. Old name `react-native-testing-library` is flagged.
- **Reassure** (MIT): perf regression tests on RNTL. Stage: **verify**. Detected, recommended.
- **Re.Pack** (`@callstack/repack`, MIT): webpack/Rspack bundler. Stage: **scan**. Flagged: Expo uses Metro.
- **Haul** (archived): legacy bundler. Flagged for removal.
- **agent-device** (Callstack incubator): device automation for agents; candidate for verify on simulators. Not integrated yet.
- **react-native-bundle-visualizer** is *not* Callstack (IjzerenHein, MIT); wired as optional adapter (`--format json`, `RN_MIGRATE_RNBV=1`).

## Top 5 to add next (ranked)
1. **ast-grep**: deterministic detect and codemods for bridge → TurboModule/Fabric patterns. Highest leverage.
2. **expo-doctor + React Native Directory API**: RN-specific scan/detect of new-arch readiness.
3. **Graphify**: an Apache-2.0 graph map (`graph.json`) for the agent and the web UI, which replaces blind grep.
4. **ripwire**: blast radius and tests-to-run in the **verify** stage. Confirm the license first.
5. **Serena (MCP)**: symbol-level edits during the AI-assisted migrate step. Pair it with **RTK** in the docs for token hygiene.

## Architecture note: positioning as a "combo of GitHub repos"
rn-new-arch-migrate should be a thin, opinionated **orchestrator**. It should not reimplement indexers. Each stage calls best-of-breed upstream CLIs through small adapters in `scripts/`/`stages/`: expo-doctor, RN Directory, ctags/Repomix/Graphify/ripwire for scan/map, ast-grep (+ optional Semgrep) for detect/migrate, Serena/Aider-style maps plus RTK-compressed output for the AI step, and codegen/expo-doctor/ripwire blast-radius for verify. Each adapter normalizes the tool's output into our `schemas/` JSON (findings, symbols, edges, risks). That way any tool can be swapped or skipped when it isn't installed. Dependencies are invoked as external binaries, not vendored, so license obligations stay clean (GPL ctags, LGPL Semgrep). We credit each upstream repo in the README. Our own value is the RN new-arch knowledge: the rules, the replacement table, the stage contracts and the verification gates.
