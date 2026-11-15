# Compliance report: SHP-2026-000004

**Status: INDETERMINATE**

INDETERMINATE [R-CUS-01]: custody gap: event 2 has a null party; break: event 2 hands to null but event 3 is from PTY-000007. (+1 other findings)

- **Run:** RUN-2026-000004
- **As of:** 2026-11-01T00:00:00Z
- **Engine version:** engine-1.0.0
- **Input fingerprint:** d2dcc59c8be9ca22a221a55f4c174f0ec75c2495d370708e63d0e14eda2abb76

## 2. Context

- **Product:** Frozen Vaccine D (PRD-000004, VACCINE)
- **Origin:** Memphis, Nordic Biologics
- **Destination:** Denver, Northgate Warehouse
- **Departure (planned / actual):** 2026-01-26T05:40:00Z / 2026-01-26T05:40:00Z
- **Arrival (planned / actual):** 2026-01-27T16:40:00Z / 2026-01-27T17:00:00Z

### Lots

| lot | manufactured | expires | status | units |
| --- | --- | --- | --- | --- |
| LOT-2026-000007 | 2025-09-01 | 2027-03-01 | RELEASED | 907 |
| LOT-2026-000008 | 2025-11-01 | 2027-05-01 | RELEASED | 493 |

### Packaging

| packaging | type | supported range (C) | qualified hours |
| --- | --- | --- | --- |
| PKG-000002 | Deep-frozen shipper | -30 to -10 | 96 |

### Logger, assignment and calibration

| logger | serial | assignment | window | calibration (on / expires / uncertainty C) |
| --- | --- | --- | --- | --- |
| LGR-000004 | SN-100004-7258 | LOG-SHP-2026-000004-01 | 2026-01-26T05:10:00Z .. 2026-01-27T17:30:00Z | 2026-01-14 / 2027-01-14 / 0.39 |

## 3. Policy

- **Policy used for evaluation:** POL-000007 v1
- **Limits:** -25.00 to -15.00 C
- **Allowed excursion:** 20 min
- **Gap limit:** 20 min
- **Dwell limit:** 120 min
- **Effective:** 2026-01-01T00:00:00Z .. 2026-09-01T00:00:00Z
- **Applied on the shipment:** POL-000007 v1
- **Correct for the product at departure:** POL-000007 v1
- **Applied equals correct:** yes

## 4. Decision trace

| rule | name | result | detail | evidence readings |
| --- | --- | --- | --- | --- |
| R-LOG-01 | Logger exists | PASS | all assigned loggers exist | 0 |
| R-LOG-02 | Logger assignment covers transit | PASS | logger LGR-000004 assignment LOG-SHP-2026-000004-01 covers the whole transit | 0 |
| R-LOG-03 | Calibration valid | PASS | calibration valid for LGR-000004 from departure through arrival | 0 |
| R-LOG-04 | No overlapping assignments | PASS | no overlapping assignments on the assigned logger(s) | 0 |
| R-WIN-01 | Evaluation window | PASS | 213 GOOD reading(s) inside departure..arrival and the assignment window(s); 0 non-GOOD and 0 late-arriving reading(s) excluded | 0 |
| R-LOG-05 | Reading/assignment references agree | PASS | reading assignment references agree with assignment windows | 0 |
| R-GAP-01 | Missing data / gaps | PASS | no missing samples (213 readings, every spacing within 20 min) | 0 |
| R-TEMP-03 | Confirmed excursion vs allowance | PASS | confirmed excursion 0 min within allowed 20 min | 0 |
| R-TEMP-04 | Calibration uncertainty (marginal readings) | PASS | possible excursion 0 min does not change the decision (allowed 20 min) | 0 |
| R-POL-01 | Correct policy applied | PASS | applied policy POL-000007 v1 is the one effective at departure | 0 |
| R-LOT-01 | Lots present and consistent | PASS | 2 lot(s), all of the shipment's product | 0 |
| R-PKG-01 | Packaging qualification | PASS | packaging range and qualified duration cover the policy and planned duration | 0 |
| R-ROUTE-05 | Route evidence present | PASS | 3 actual stop(s) recorded | 0 |
| R-ROUTE-01 | Planned stops reached | PASS | every planned stop was reached | 0 |
| R-ROUTE-02 | No unplanned stops | PASS | no unplanned stops | 0 |
| R-ROUTE-03 | Stop sequence | PASS | actual stop order equals planned order | 0 |
| R-ROUTE-04 | Dwell time | PASS | all dwell times within 120 min | 0 |
| R-CUS-01 | Custody chain continuous | INDETERMINATE | custody gap: event 2 has a null party; break: event 2 hands to null but event 3 is from PTY-000007 | 0 |
| R-CUS-02 | Custody timestamps | PASS | custody timestamps ordered and recorded after the events | 0 |
| R-ISO-01 | Shipment isolation (legacy reports) | PASS | excursion runs computed per assignment window; 0 legacy report(s) all inside the shipment window | 0 |
| R-SILENT-01 | Legacy PASS vs engine decision | WARNING | legacy report LEG-2026-000004 says PASS but the engine decision is INDETERMINATE | 0 |

## 5. Temperature

- **Min / mean / max:** -21.36 / -19.46 / -17.95 C
- **Readings expected / received:** 213 / 213 (100.0% coverage)
- **Reading classes:** IN 213, OUT 0, MARGINAL 0

### Excursions

(none)

No confirmed out-of-range readings.

Confirmed out-of-range: 0 = 0 min <= 20 min allowed

Only 10-minute samples exist. Excursion start and end are therefore inferred by sample-and-hold (start = first out-of-range sample; end = the next in-range sample, or last out-of-range sample + sampling interval, capped at arrival); the exact physical times are unknown.

## 6. Data gaps

Total missing samples: 0; gap limit 20 min. During a gap nothing is known about the product temperature; gap time is never counted as in range.

## 7. Route and custody

### Route

| # | type | location | planned arrival | planned departure | actual arrival | actual departure | dwell min | flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | ORIGIN | Memphis | 2026-01-26T05:10:00Z | 2026-01-26T05:40:00Z | 2026-01-26T05:16:00Z | 2026-01-26T05:40:00Z | 24 | OK |
| 2 | TRANSIT | Atlanta | 2026-01-26T23:10:00Z | 2026-01-27T00:13:00Z | 2026-01-26T23:12:00Z | 2026-01-27T00:14:00Z | 62 | OK |
| 3 | DESTINATION | Denver | 2026-01-27T16:40:00Z | - | 2026-01-27T17:00:00Z | - | - | OK |

### Custody chain

| seq | from | to | type | event time | recorded | continuity |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Nordic Biologics (PTY-000001) | ChillTrans (PTY-000008) | PICKUP | 2026-01-26T05:40:00Z | 2026-01-26T05:55:00Z | OK |
| 2 | ChillTrans (PTY-000008) | (null) | HANDOVER | 2026-01-26T23:12:00Z | 2026-01-26T23:22:00Z | NULL PARTY |
| 3 | PolarExpress (PTY-000007) | Northgate Warehouse (PTY-000013) | DELIVERY | 2026-01-27T17:00:00Z | 2026-01-27T17:30:00Z | BREAK: previous event handed to (null) |

## 8. Evidence appendix

All 0 cited readings are listed.

## 9. History

### Earlier runs

(none)

No earlier runs for this shipment.

### Exception history

(none)

No exception history.
