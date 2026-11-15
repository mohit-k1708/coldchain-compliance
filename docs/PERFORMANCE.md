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
