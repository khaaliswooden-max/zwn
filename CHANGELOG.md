# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

- Phase 2A: remaining platform listeners (QAL, Symbion, Relian, PodX, ZUSDC, ZuupHQ)
- Phase 2B: `POST /zwm/ingest` endpoints for remaining platform services
- UI-4: live GraphQL wiring in frontend WorldCanvas (replaces mock data)

---

## [0.3.0] - 2026-04-06

### Added

- `zwm-daily`: Windows PowerShell support — `run-daily.ps1` script + Task Scheduler docs
- `zwm-daily`: daily 10x brief generator using Anthropic Claude API with web search;
  outputs formatted DOCX to `zwm-daily/output/`

### Changed

- Renamed ZWN → ZWM and "Zuup World Network" → "Zuup World Model" across all frontend
  components, page copy, and documentation

---

## [0.2.0] - 2026-04-05

### Added

- `frontend`: 3D Gaussian Splat Nebula renderer (`components/nebula/`) replacing the
  2D force-directed graph; procedural particle system with substrate-colored clusters
- `frontend`: developer portal — API console, SDK download, platform ingest tester
- `frontend`: `/build` page with API Access / Platform Partnership / Institutional
  Access tiers
- `frontend`: `/entities/[id]` entity detail page showing state across all substrates
- `enterprise`: REST API layer on port 3001 (`/enterprise/*` routes)
- `enterprise`: in-memory API key store with `POST /enterprise/api-keys`
- `zuup-zwm-indexer/sdk`: `@zuup/zwm-sdk` TypeScript client SDK (v0.1.0) with
  `getWorldState`, `getCompositeRisk`, `getCausalChain` methods
- Phase 3: Veyra context injection layer — full substrate state injected into each
  Veyra reasoning call via `veyra/service/`
- Phase 2A: Civium → Aureon green-path e2e test passing (`tests/civium-e2e.ts`);
  full causal chain (emission → Neo4j → causal engine → Aureon ingest) validated on devnet

### Fixed

- Eliminated render storm and geometry leaks in Gaussian Splat renderer
- Upgraded React 18 → 19 to resolve `ReactCurrentBatchConfig` crash
- Removed `@react-three/drei` dependency; added error boundary and `transpilePackages`
- Vercel deployment: corrected `outputDirectory`, `buildCommand`, and `rootDirectory`
  config in `vercel.json`
- Root `package.json` now anchors the Vercel build in the monorepo root

---

## [0.1.0] - 2026-04-05

### Added

- `CLAUDE.md`: full ZWM architecture design document — graph schema (10 node types,
  5 edge types), 8 causal propagation rules, Anchor event contracts for all 9 platforms,
  ingest contract, build sequence, and Claude Code session prompts
- `zuup-zwm-indexer/`: complete scaffold — `src/listeners/`, `src/parsers/`,
  `src/writers/`, `src/causal/`, `src/api/`, `src/db/`
- `zuup-zwm-indexer/src/db/init.ts`: Neo4j constraint + index Cypher, run once at startup
- `idl/civium.json`: Civium Anchor IDL copied from platform repo
- Phase 2A: Aureon listener + parser wired into ZWM indexer
- `.gitignore`: excludes all platform repos, `node_modules/`, `dist/`, `.env` files,
  build artifacts, and `zwm-daily` output
