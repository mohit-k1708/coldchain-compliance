# CLAUDE.md - coldchain-compliance (read this first, keep it short)

## Goal
Prove temperature-sensitive shipments stayed within product + route requirements, and manage deviations.
Deterministic prototype: seeded synthetic data generator -> compliance engine -> traceable reports -> exception workflow -> metrics vs separate ground truth. Time-boxed hackathon: correctness over polish.

## Source of truth (read only the section you need, never the whole file twice)
- `docs/BUSINESS-RULES.md` - IDs, enums, rules R-*, assumptions A-*, ground-truth mapping
- `docs/DATA-DICTIONARY.md` - every field, type, validation
- `database/schema.sql` - DDL. If code and docs disagree, docs win; fix the code or raise it.
Do not invent requirements. If a rule is missing, add it to BUSINESS-RULES.md as a new A-xx assumption first.

## Stack
Node.js (ESM), no framework until Phase 7. Generator + engine are plain functions with no DB dependency.
Tests: `node --test`. DB: schema must work in Postgres AND SQLite (`node:sqlite`). Add a dependency only with a one-line reason.
Seed: 20261022. Never use Math.random() for business data; use the seeded PRNG in `generator/prng.js`.

## Hard rules
- Engine NEVER reads ground_truth.* . Ground truth is written by the injector from what it injected, not by engine code.
- Excursions are computed per assignment window, never per logger stream (R-ISO-01).
- Missing data is never assumed in range. No evidence of failure != compliance.
- Statuses are only COMPLIANT / NON_COMPLIANT / INDETERMINATE. No history overwrites; append runs/events.
- Parameterized SQL only; secrets in env vars.

## Token-saving working style (important)
- Reply terse: no preamble, no recap, no file dumps. Final reply <= 5 lines: what changed, test result, next risk.
- Read only files named in the task. No repo-wide exploration. Do not re-read files you just wrote.
- Use Edit for changes, not full rewrites. Do not reformat untouched code.
- Run only the tests for the current phase. On failure show the last 20 lines, not the whole log.
- Do not explain code unless asked. The user explains it back in their own words; answer questions briefly.
- One phase per session. Commit at the end with a clear message, then stop.

## Commands
`npm test` | `npm run generate -- --seed=20261022 --shipments=N` | `npm run validate`

## Definition of done (every phase)
Tests for the phase pass, files match the dictionary, one commit made, <=5-line summary given.
