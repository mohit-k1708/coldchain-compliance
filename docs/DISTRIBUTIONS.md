# Distributions

Computed from `data/generated` (5000 shipments, 1000 loggers).

## Shipments per product

| product | shipments |
|---|---:|
| Vaccine A | 1038 |
| Biologic B | 1007 |
| Insulin C | 1004 |
| Frozen Vaccine D | 964 |
| Ambient Product E | 987 |

## Shipment duration (hours, actual departure to arrival)

min / mean / max: 12 / 39.76 / 73.83

| bin | count |
|---|---:|
| 12-18 h | 560 |
| 18-24 h | 572 |
| 24-30 h | 553 |
| 30-36 h | 546 |
| 36-42 h | 565 |
| 42-48 h | 528 |
| 48-54 h | 457 |
| 54-60 h | 411 |
| 60-66 h | 414 |
| 66-72 h | 369 |
| 72-78 h | 25 |
| >= 78 h | 0 |

## Arrival delay vs plan (minutes)

min / mean / max: 0 / 21.25 / 240

| bin | count |
|---|---:|
| 0-10 min | 996 |
| 10-30 min | 2775 |
| 30-60 min | 806 |
| 60-120 min | 294 |
| 120-240 min | 119 |
| >= 240 min | 10 |

## Readings per shipment (min / mean / max)

72 / 238.90 / 444 (shipments with an assignment: 4942)

## Temperature per product (all readings of assigned shipments)

| product | readings | mean C | sd C |
|---|---:|---:|---:|
| Vaccine A | 257825 | 5.01 | 0.61 |
| Biologic B | 248692 | 5.00 | 0.63 |
| Insulin C | 251852 | 5.00 | 0.65 |
| Frozen Vaccine D | 247820 | -20.00 | 0.97 |
| Ambient Product E | 174479 | 20.00 | 1.19 |

## Shipments per logger (min / mean / max over loggers with assignments)

3 / 5.08 / 41; loggers with no assignment: 28

## Legacy excursion reports

Total: 835

| issue_type | count |
|---|---:|
| CROSS_SHIPMENT_REPORT | 25 |
| TEMP_HIGH | 405 |
| TEMP_LOW | 405 |

Duration (minutes):

| bin | count |
|---|---:|
| 0-10 | 0 |
| 10-20 | 133 |
| 20-30 | 131 |
| 30-60 | 292 |
| 60-120 | 218 |
| >= 120 | 61 |

## Engine excursion reports (data/results)

Total: 1785

| issue_type | count |
|---|---:|
| CALIBRATION_INVALID | 50 |
| CALIBRATION_MARGINAL | 100 |
| CROSS_SHIPMENT_REPORT | 25 |
| CUSTODY_GAP | 100 |
| LOGGER_NOT_ASSIGNED | 100 |
| MISSING_DATA | 350 |
| POLICY_MISMATCH | 100 |
| ROUTE_DEVIATION | 100 |
| TEMP_HIGH | 429 |
| TEMP_LOW | 431 |

## Data gaps (spacing above the policy gap limit)

Shipments with at least one gap: 250; total gaps: 250

## Stop dwell time (minutes)

min / mean / max: 5 / 48.79 / 208

| bin | count |
|---|---:|
| 0-15 | 67 |
| 15-30 | 3970 |
| 30-45 | 3161 |
| 45-60 | 1283 |
| 60-90 | 2590 |
| 90-120 | 1379 |
| >= 120 | 40 |

## Label counts vs configured mix

| label | configured % | expected (N x %) | actual |
|---|---:|---:|---:|
| NONE | 68 | 3400.00 | 3400 |
| BOUNDARY_AT_LIMIT | 2 | 100.00 | 100 |
| EXCURSION_WITHIN_ALLOWANCE | 5 | 250.00 | 250 |
| TEMPERATURE_EXCURSION | 8 | 400.00 | 400 |
| CALIBRATION_MARGINAL | 2 | 100.00 | 100 |
| MISSING_DATA | 3 | 150.00 | 150 |
| MISSING_DATA_SILENTLY_PASSED | 2 | 100.00 | 100 |
| LOGGER_NOT_ASSIGNED | 2 | 100.00 | 100 |
| CALIBRATION_EXPIRED | 1 | 50.00 | 50 |
| POLICY_MISMATCH | 2 | 100.00 | 100 |
| CUSTODY_GAP | 2 | 100.00 | 100 |
| CROSS_SHIPMENT_EXCURSION | 1 | 50.00 | 50 |
| ROUTE_DEVIATION | 2 | 100.00 | 100 |

Counts use largest-remainder rounding; with at least 100 shipments every non-NONE label has at least 2, and CROSS_SHIPMENT_EXCURSION is always an even number (pairs). The difference is taken from NONE.
