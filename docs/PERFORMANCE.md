# Performance

Dataset: seed 20261022, 5000 shipments, 1000 loggers. Node v24.18.1, default flags (no `--max-old-space-size`), win32.

| step | wall time | peak RSS | notes |
|---|---:|---:|---|
| generate (streaming) | 19.1 s | 121 MB | exit 0 |
| validate (streaming readings) | 21.8 s | 464 MB | exit 0 |
| evaluate (ReadingStore) | 21.1 s | 622 MB | 306 shipments/s (evaluation only), load 3992 ms, evaluate 16324 ms |

Evaluation produced 5000 runs, 100592 findings, 1785 engine excursions.

## File sizes (data/generated)

| file | MB |
|---|---:|
| compliance_evidence.csv | 0.00 |
| compliance_finding.csv | 0.00 |
| compliance_run.csv | 0.00 |
| custody_event.csv | 1.89 |
| exception_event.csv | 0.00 |
| excursion_evidence.csv | 0.19 |
| excursion_report.csv | 0.15 |
| ground_truth.csv | 0.31 |
| legacy_report.csv | 0.33 |
| logger.csv | 0.07 |
| logger_assignment.csv | 0.48 |
| logger_calibration.csv | 0.05 |
| lot.csv | 0.00 |
| manifest.json | 0.00 |
| packaging.csv | 0.00 |
| party.csv | 0.00 |
| product.csv | 0.00 |
| route_stop.csv | 2.08 |
| shipment.csv | 0.90 |
| shipment_lot.csv | 0.26 |
| shipment_packaging.csv | 0.33 |
| shipment_status_history.csv | 1.44 |
| temperature_reading.csv | 141.76 |
| threshold_policy.csv | 0.00 |

## File sizes (data/results)

| file | MB |
|---|---:|
| compliance_evidence.csv | 0.23 |
| compliance_finding.csv | 15.06 |
| compliance_run.csv | 1.26 |
| excursion_evidence.csv | 0.25 |
| excursion_report.csv | 0.33 |
| summary.json | 0.00 |

## Database and API (5,000 shipments)

Added by Phase 7 (`npm run db:build`, `npm run bench:api`; `npm run perf` rewrites the top of this file, re-add this section if you re-run it).

| step | result |
|---|---|
| `db:build` | 1,402,309 rows loaded in 34.0 s (41,278 rows/s), indexes + foreign_key_check + workflow seeding + ANALYZE, 39.0 s in total, peak RSS 235 MB |
| database file | 349.9 MB (`data/app.db`, not committed) |
| seeded workflow | 653 of 1,685 engine exceptions progressed (ASSIGNED 175, INVESTIGATING 142, RESOLVED 268, ESCALATED 68), every history row through `applyTransition` |

Response times on a local machine (Node 24, SQLite file DB, the server in the same process as the client):

| endpoint | run 1 (ms) | run 2 (ms) | run 3 (ms) |
|---|---:|---:|---:|
| GET /api/dashboard | 123.6 | 47.8 | 56.9 |
| GET /api/shipments?page=1 | 25.0 | 26.4 | 15.5 |
| GET /api/shipments?status=NON_COMPLIANT&pageSize=200 | 28.2 | 29.1 | 37.7 |
| GET /api/shipments/SHP-2026-001004 (detail) | 21.9 | 14.5 | 13.8 |
| GET /api/shipments/SHP-2026-001004/readings | 13.3 | 15.9 | 17.3 |
| GET /api/shipments/SHP-2026-001004/report (json) | 34.4 | 10.3 | 27.2 |
| GET /api/shipments/SHP-2026-001004/report?format=html | 17.4 | 15.0 | 9.7 |
| GET /api/exceptions?pageSize=50 | 18.2 | 4.2 | 3.5 |

Query plans (`EXPLAIN QUERY PLAN`): the readings window uses `idx_reading_logger_time`; findings use `idx_finding_run`; the exceptions list uses `idx_excursion_source`. The shipments list scans the 5,000 current compliance runs (acceptable at this size). Five indexes were added to `database/schema.sql` for these queries.
