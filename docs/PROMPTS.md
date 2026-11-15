# Claude Code prompts (paste one per fresh session; run /clear between phases)

Tips: use Sonnet for building, plan mode (Shift+Tab) only for Phases 2 and 4, keep CLAUDE.md under ~60 lines, never paste logs longer than 20 lines.

---

## Phase 0 - Setup

```
Phase 0. Read CLAUDE.md only.
In this folder: git init if missing; create .gitignore (node_modules, .env, *.log, data/generated/); package.json
(name coldchain-compliance, "type":"module", scripts: test="node --test", generate, validate as placeholders that print "not implemented");
empty folders with .gitkeep: generator engine database tests data docs; README.md stub (<=10 lines: purpose + how to run, TBD sections).
Do not install dependencies. Do not touch docs/ or CLAUDE.md. Check `node -v` and report it.
Commit: "chore: project skeleton". Reply <=5 lines.
```

---

## Phase 1 - Schema

```
Phase 1. Read CLAUDE.md, docs/DATA-DICTIONARY.md, and sections 1-2 of docs/BUSINESS-RULES.md.
Write database/schema.sql implementing every table in the dictionary (10 entities + supporting tables):
PKs, FKs, NOT NULL, CHECK constraints for enums and ranges (min<=max, end>=start, durations>=0), UNIQUE(logger_id, recorded_at),
indexes on temperature_reading(logger_id, recorded_at), logger_assignment(logger_id, assigned_from), custody_event(shipment_id), route_stop(shipment_id), excursion_report(shipment_id).
Portable DDL: TEXT/INTEGER/NUMERIC/BOOLEAN/TIMESTAMPTZ, no CREATE TYPE, no extensions, no exclusion constraints.
Do NOT add a DB constraint for overlapping logger assignments or reading->assignment consistency (validator handles those so anomalies stay representable).
No ground-truth tables in the schema.
Test: tests/db/schema.test.js using node:test + node:sqlite (PRAGMA foreign_keys=ON). Assert: schema loads; orphan FK rejected;
min>max rejected; bad enum rejected; duplicate (logger_id, recorded_at) rejected; valid minimal chain inserts
(party, product, lot, policy, shipment, shipment_lot, logger, assignment, reading). If node:sqlite is unavailable (node < 22.13), use better-sqlite3 and say why.
Run `node --test tests/db`. Fix until green. Note any dictionary/schema mismatch you found. Commit "feat: schema + constraint tests". Reply <=5 lines.
```

---

Next prompts (Phase 2 onward) are written after the previous phase finishes, so they match what actually got built.
