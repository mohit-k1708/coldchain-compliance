# Compliance report: SHP-2026-000037

**Status: INDETERMINATE**

INDETERMINATE [R-TEMP-04]: confirmed excursion 0 min is within allowed 60 min but possible excursion 70 min (marginal readings within calibration uncertainty counted as OUT) exceeds it. (+1 other findings)

- **Run:** RUN-2026-000037
- **As of:** 2026-11-01T00:00:00Z
- **Engine version:** engine-1.0.0
- **Input fingerprint:** 85f9b5b7ec5b38f8f3e30d501a028a02608214163cece7615a74a6c1c5a1fbec

## 2. Context

- **Product:** Insulin C (PRD-000003, INSULIN)
- **Origin:** Chicago, Aurora Labs
- **Destination:** Phoenix, Riverside Cold Storage
- **Departure (planned / actual):** 2026-05-02T17:10:00Z / 2026-05-02T17:20:00Z
- **Arrival (planned / actual):** 2026-05-04T04:10:00Z / 2026-05-04T04:20:00Z

### Lots

| lot | manufactured | expires | status | units |
| --- | --- | --- | --- | --- |
| LOT-2026-000005 | 2025-09-01 | 2027-03-01 | RELEASED | 977 |
| LOT-2026-000006 | 2025-11-01 | 2027-05-01 | RELEASED | 587 |

### Packaging

| packaging | type | supported range (C) | qualified hours |
| --- | --- | --- | --- |
| PKG-000001 | Passive insulated shipper 2-8C | 0 to 10 | 96 |

### Logger, assignment and calibration

| logger | serial | assignment | window | calibration (on / expires / uncertainty C) |
| --- | --- | --- | --- | --- |
| LGR-000001 | SN-100001-3306 | LOG-SHP-2026-000037-01 | 2026-05-02T16:50:00Z .. 2026-05-04T04:50:00Z | 2026-01-08 / 2027-01-08 / 0.31 |

## 3. Policy

- **Policy used for evaluation:** POL-000005 v1
- **Limits:** 2.00 to 8.00 C
- **Allowed excursion:** 60 min
- **Gap limit:** 20 min
- **Dwell limit:** 120 min
- **Effective:** 2026-01-01T00:00:00Z .. 2026-09-01T00:00:00Z
- **Applied on the shipment:** POL-000005 v1
- **Correct for the product at departure:** POL-000005 v1
- **Applied equals correct:** yes

## 4. Decision trace

| rule | name | result | detail | evidence readings |
| --- | --- | --- | --- | --- |
| R-LOG-01 | Logger exists | PASS | all assigned loggers exist | 0 |
| R-LOG-02 | Logger assignment covers transit | PASS | logger LGR-000001 assignment LOG-SHP-2026-000037-01 covers the whole transit | 0 |
| R-LOG-03 | Calibration valid | PASS | calibration valid for LGR-000001 from departure through arrival | 0 |
| R-LOG-04 | No overlapping assignments | PASS | no overlapping assignments on the assigned logger(s) | 0 |
| R-WIN-01 | Evaluation window | PASS | 211 GOOD reading(s) inside departure..arrival and the assignment window(s); 0 non-GOOD and 0 late-arriving reading(s) excluded | 0 |
| R-LOG-05 | Reading/assignment references agree | PASS | reading assignment references agree with assignment windows | 0 |
| R-GAP-01 | Missing data / gaps | PASS | no missing samples (211 readings, every spacing within 20 min) | 0 |
| R-TEMP-03 | Confirmed excursion vs allowance | PASS | confirmed excursion 0 min within allowed 60 min | 0 |
| R-TEMP-04 | Calibration uncertainty (marginal readings) | INDETERMINATE | confirmed excursion 0 min is within allowed 60 min but possible excursion 70 min (marginal readings within calibration uncertainty counted as OUT) exceeds it | 7 |
| R-POL-01 | Correct policy applied | PASS | applied policy POL-000005 v1 is the one effective at departure | 0 |
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
| R-SILENT-01 | Legacy PASS vs engine decision | WARNING | legacy report LEG-2026-000037 says PASS but the engine decision is INDETERMINATE | 0 |

## 5. Temperature

- **Min / mean / max:** 3.20 / 4.99 / 7.89 C
- **Readings expected / received:** 211 / 211 (100.0% coverage)
- **Reading classes:** IN 204, OUT 0, MARGINAL 7

### Excursions

(none)

No confirmed out-of-range readings.

Confirmed out-of-range: 0 = 0 min <= 60 min allowed

Possible out-of-range (marginal readings counted as out): 70 min > 60 min allowed

Only 10-minute samples exist. Excursion start and end are therefore inferred by sample-and-hold (start = first out-of-range sample; end = the next in-range sample, or last out-of-range sample + sampling interval, capped at arrival); the exact physical times are unknown.

## 6. Data gaps

Total missing samples: 0; gap limit 20 min. During a gap nothing is known about the product temperature; gap time is never counted as in range.

## 7. Route and custody

### Route

| # | type | location | planned arrival | planned departure | actual arrival | actual departure | dwell min | flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | ORIGIN | Chicago | 2026-05-02T16:40:00Z | 2026-05-02T17:10:00Z | 2026-05-02T16:53:00Z | 2026-05-02T17:20:00Z | 27 | OK |
| 2 | TRANSIT | Tampa | 2026-05-03T04:50:00Z | 2026-05-03T06:02:00Z | 2026-05-03T05:02:00Z | 2026-05-03T06:13:00Z | 71 | OK |
| 3 | TRANSIT | Reno | 2026-05-03T16:30:00Z | 2026-05-03T17:29:00Z | 2026-05-03T16:32:00Z | 2026-05-03T17:43:00Z | 71 | OK |
| 4 | DESTINATION | Phoenix | 2026-05-04T04:10:00Z | - | 2026-05-04T04:20:00Z | - | - | OK |

### Custody chain

| seq | from | to | type | event time | recorded | continuity |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Aurora Labs (PTY-000003) | ArcticFreight (PTY-000005) | PICKUP | 2026-05-02T17:20:00Z | 2026-05-02T17:36:00Z | OK |
| 2 | ArcticFreight (PTY-000005) | ChillTrans (PTY-000008) | HANDOVER | 2026-05-03T05:02:00Z | 2026-05-03T05:11:00Z | OK |
| 3 | ChillTrans (PTY-000008) | PolarExpress (PTY-000007) | HANDOVER | 2026-05-03T16:32:00Z | 2026-05-03T16:58:00Z | OK |
| 4 | PolarExpress (PTY-000007) | Riverside Cold Storage (PTY-000014) | DELIVERY | 2026-05-04T04:20:00Z | 2026-05-04T04:33:00Z | OK |

## 8. Evidence appendix

| reading | recorded at | temperature C | uncertainty C | class |
| --- | --- | --- | --- | --- |
| TEMP-LGR-000001-20260503T115000Z | 2026-05-03T11:50:00Z | 7.83 | 0.31 | MARGINAL |
| TEMP-LGR-000001-20260503T120000Z | 2026-05-03T12:00:00Z | 7.89 | 0.31 | MARGINAL |
| TEMP-LGR-000001-20260503T121000Z | 2026-05-03T12:10:00Z | 7.86 | 0.31 | MARGINAL |
| TEMP-LGR-000001-20260503T122000Z | 2026-05-03T12:20:00Z | 7.84 | 0.31 | MARGINAL |
| TEMP-LGR-000001-20260503T123000Z | 2026-05-03T12:30:00Z | 7.80 | 0.31 | MARGINAL |
| TEMP-LGR-000001-20260503T124000Z | 2026-05-03T12:40:00Z | 7.87 | 0.31 | MARGINAL |
| TEMP-LGR-000001-20260503T125000Z | 2026-05-03T12:50:00Z | 7.84 | 0.31 | MARGINAL |

All 7 cited readings are listed.

## 9. History

### Earlier runs

(none)

No earlier runs for this shipment.

### Exception history

(none)

No exception history.
