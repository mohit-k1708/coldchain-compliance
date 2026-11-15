# Performance

Generated from `docs/perf-results.json` by `scripts/perfDoc.js`. Each measuring script (`npm run perf`, `npm run db:build`, `npm run bench:api`) writes only its own section, so re-running one never erases the others.

## Pipeline (generate, validate, evaluate)

Dataset: seed 20261022, 5,000 shipments, 1,000 loggers. Node v24.18.1, default flags (no `--max-old-space-size`), win32. Measured 2026-11-15.

| step | wall time | peak RSS | notes |
|---|---:|---:|---|
| generate (streaming) | 20.8 s | 125 MB | exit 0 |
| validate (streaming readings) | 16.1 s | 466 MB | exit 0 |
| evaluate (ReadingStore) | 21.4 s | 618 MB | 306 shipments/s (evaluation only), load 4288 ms, evaluate 16346 ms |

Evaluation produced 5000 runs, 100292 findings, 1685 engine excursions.

### File sizes (data/generated)

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

### File sizes (data/results)

| file | MB |
|---|---:|
| compliance_evidence.csv | 0.23 |
| compliance_finding.csv | 14.17 |
| compliance_run.csv | 1.32 |
| excursion_evidence.csv | 0.24 |
| excursion_report.csv | 0.31 |
| summary.json | 0.00 |

## Database build

Measured 2026-11-15.

| step | result |
|---|---|
| `db:build` | 1,402,309 rows loaded in 61.1 s (22,961 rows/s), indexes + foreign_key_check + workflow seeding + ANALYZE, 66.1 s in total, peak RSS 237 MB |
| database file | 349.9 MB (`data/app.db`, git-ignored) |
| seeded workflow | 653 of 1685 engine exceptions progressed (ASSIGNED 175, INVESTIGATING 142, RESOLVED 268, ESCALATED 68), every history row through applyTransition |

## API response times

Measured 2026-11-15, 3 runs each, local machine, SQLite file DB, server and client in the same process.

| endpoint | run 1 (ms) | run 2 (ms) | run 3 (ms) |
|---|---:|---:|---:|
| GET /api/dashboard | 232.5 | 105.9 | 76.9 |
| GET /api/shipments?page=1 | 46 | 29.4 | 33.3 |
| GET /api/shipments?status=NON_COMPLIANT&pageSize=200 | 68.1 | 78.4 | 77.5 |
| GET /api/shipments/SHP-2026-001004 | 33.8 | 16.8 | 59.4 |
| GET /api/shipments/SHP-2026-001004/readings | 7.2 | 15 | 10.5 |
| GET /api/shipments/SHP-2026-001004/report (json) | 42.1 | 14.6 | 17.1 |
| GET /api/shipments/SHP-2026-001004/report?format=html | 20.8 | 12.3 | 15.9 |
| GET /api/exceptions?pageSize=50 | 13.5 | 3.9 | 13.2 |

### Query plans (`EXPLAIN QUERY PLAN`)

- **shipments list**: `SCAN r`; `SEARCH s USING INDEX sqlite_autoindex_shipment_1 (shipment_id=?)`; `SEARCH p USING COVERING INDEX sqlite_autoindex_product_1 (product_id=?)`; `USE TEMP B-TREE FOR ORDER BY`
- **readings window**: `SEARCH temperature_reading USING INDEX idx_reading_logger_time (logger_id=? AND recorded_at>? AND recorded_at<?)`
- **dashboard top reasons**: `SCAN compliance_run`; `USE TEMP B-TREE FOR GROUP BY`
- **findings of a run**: `SEARCH compliance_finding USING INDEX idx_finding_run (compliance_run_id=?)`
- **exceptions list**: `SEARCH excursion_report USING INDEX idx_excursion_source (source=? AND status=?)`; `USE TEMP B-TREE FOR ORDER BY`
