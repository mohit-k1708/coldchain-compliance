# Compliance report: SHP-2026-000048

**Status: INDETERMINATE**

INDETERMINATE [R-GAP-01]: 1 data gap(s) longer than 20 min (largest 50 min, 4 missing samples); gap time is not assumed in range. (+1 other findings)

- **Run:** RUN-2026-000048
- **As of:** 2026-11-01T00:00:00Z
- **Engine version:** engine-1.0.0
- **Input fingerprint:** 92cf8cb91822dde9542e28e384a5b61ddea2ca101c5bbeecbd580c2e77af1ed8

## 2. Context

- **Product:** Frozen Vaccine D (PRD-000004, VACCINE)
- **Origin:** Atlanta, Nordic Biologics
- **Destination:** Columbus, Metro Pharma Hub
- **Departure (planned / actual):** 2026-05-05T03:40:00Z / 2026-05-05T03:40:00Z
- **Arrival (planned / actual):** 2026-05-06T18:50:00Z / 2026-05-06T19:00:00Z

### Lots

| lot | manufactured | expires | status | units |
| --- | --- | --- | --- | --- |
| LOT-2026-000007 | 2025-09-01 | 2027-03-01 | RELEASED | 608 |
| LOT-2026-000008 | 2025-11-01 | 2027-05-01 | RELEASED | 987 |

### Packaging

| packaging | type | supported range (C) | qualified hours |
| --- | --- | --- | --- |
| PKG-000002 | Deep-frozen shipper | -30 to -10 | 96 |

### Logger, assignment and calibration

| logger | serial | assignment | window | calibration (on / expires / uncertainty C) |
| --- | --- | --- | --- | --- |
| LGR-000012 | SN-100012-5662 | LOG-SHP-2026-000048-01 | 2026-05-05T03:10:00Z .. 2026-05-06T19:30:00Z | 2026-01-06 / 2027-01-06 / 0.43 |

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
| R-LOG-02 | Logger assignment covers transit | PASS | logger LGR-000012 assignment LOG-SHP-2026-000048-01 covers the whole transit | 0 |
| R-LOG-03 | Calibration valid | PASS | calibration valid for LGR-000012 from departure through arrival | 0 |
| R-LOG-04 | No overlapping assignments | PASS | no overlapping assignments on the assigned logger(s) | 0 |
| R-WIN-01 | Evaluation window | PASS | 233 GOOD reading(s) inside departure..arrival and the assignment window(s); 0 non-GOOD and 0 late-arriving reading(s) excluded | 0 |
| R-LOG-05 | Reading/assignment references agree | PASS | reading assignment references agree with assignment windows | 0 |
| R-GAP-01 | Missing data / gaps | INDETERMINATE | 1 data gap(s) longer than 20 min (largest 50 min, 4 missing samples); gap time is not assumed in range | 2 |
| R-TEMP-03 | Confirmed excursion vs allowance | PASS | confirmed excursion 0 min within allowed 20 min | 0 |
| R-TEMP-04 | Calibration uncertainty (marginal readings) | PASS | possible excursion 0 min does not change the decision (allowed 20 min) | 0 |
| R-POL-01 | Correct policy applied | PASS | applied policy POL-000007 v1 is the one effective at departure | 0 |
| R-LOT-01 | Lots present and consistent | PASS | 2 lot(s), all of the shipment's product | 0 |
| R-PKG-01 | Packaging qualification | PASS | packaging range and qualified duration cover the policy and planned duration | 0 |
| R-ROUTE-05 | Route evidence present | PASS | 4 actual stop(s) recorded | 0 |
| R-ROUTE-01 | Planned stops reached | PASS | every planned stop was reached | 0 |
| R-ROUTE-02 | No unplanned stops | PASS | no unplanned stops | 0 |
| R-ROUTE-03 | Stop sequence | PASS | actual stop order equals planned order | 0 |
| R-ROUTE-04 | Dwell time | PASS | all dwell times within 120 min | 0 |
| R-CUS-01 | Custody chain continuous | PASS | custody chain continuous over 4 events (PICKUP to DELIVERY) | 0 |
| R-CUS-02 | Custody timestamps | PASS | custody timestamps ordered and recorded after the events | 0 |
| R-ISO-01 | Shipment isolation (legacy reports) | PASS | excursion runs computed per assignment window; 0 legacy report(s) all inside the shipment window | 0 |
| R-SILENT-01 | Legacy PASS vs engine decision | WARNING | legacy report LEG-2026-000048 says PASS but the engine decision is INDETERMINATE | 0 |

## 5. Temperature

- **Min / mean / max:** -21.35 / -19.59 / -17.00 C
- **Readings expected / received:** 237 / 233 (98.3% coverage)
- **Reading classes:** IN 233, OUT 0, MARGINAL 0

### Excursions

(none)

No confirmed out-of-range readings.

Confirmed out-of-range: 0 = 0 min <= 20 min allowed

Only 10-minute samples exist. Excursion start and end are therefore inferred by sample-and-hold (start = first out-of-range sample; end = the next in-range sample, or last out-of-range sample + sampling interval, capped at arrival); the exact physical times are unknown.

## 6. Data gaps

| from | to | minutes | missing samples |
| --- | --- | --- | --- |
| 2026-05-05T05:10:00Z | 2026-05-05T06:00:00Z | 50 | 4 |

Total missing samples: 4; gap limit 20 min. During a gap nothing is known about the product temperature; gap time is never counted as in range.

## 7. Route and custody

### Route

| # | type | location | planned arrival | planned departure | actual arrival | actual departure | dwell min | flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | ORIGIN | Atlanta | 2026-05-05T03:10:00Z | 2026-05-05T03:40:00Z | 2026-05-05T03:12:00Z | 2026-05-05T03:40:00Z | 28 | OK |
| 2 | TRANSIT | Chicago | 2026-05-05T16:43:00Z | 2026-05-05T18:03:00Z | 2026-05-05T16:50:00Z | 2026-05-05T18:15:00Z | 85 | OK |
| 3 | TRANSIT | Reno | 2026-05-06T05:47:00Z | 2026-05-06T06:39:00Z | 2026-05-06T06:00:00Z | 2026-05-06T06:42:00Z | 42 | OK |
| 4 | DESTINATION | Columbus | 2026-05-06T18:50:00Z | - | 2026-05-06T19:00:00Z | - | - | OK |

### Custody chain

| seq | from | to | type | event time | recorded | continuity |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Nordic Biologics (PTY-000001) | ArcticFreight (PTY-000005) | PICKUP | 2026-05-05T03:40:00Z | 2026-05-05T03:54:00Z | OK |
| 2 | ArcticFreight (PTY-000005) | FrostLine Logistics (PTY-000004) | HANDOVER | 2026-05-05T16:50:00Z | 2026-05-05T16:55:00Z | OK |
| 3 | FrostLine Logistics (PTY-000004) | IceWay Cargo (PTY-000009) | HANDOVER | 2026-05-06T06:00:00Z | 2026-05-06T06:13:00Z | OK |
| 4 | IceWay Cargo (PTY-000009) | Metro Pharma Hub (PTY-000012) | DELIVERY | 2026-05-06T19:00:00Z | 2026-05-06T19:04:00Z | OK |

## 8. Evidence appendix

| reading | recorded at | temperature C | uncertainty C | class |
| --- | --- | --- | --- | --- |
| TEMP-LGR-000012-20260505T051000Z | 2026-05-05T05:10:00Z | -18.77 | 0.43 | IN |
| TEMP-LGR-000012-20260505T060000Z | 2026-05-05T06:00:00Z | -18.03 | 0.43 | IN |

All 2 cited readings are listed.

## 9. History

### Earlier runs

(none)

No earlier runs for this shipment.

### Exception history

(none)

No exception history.
