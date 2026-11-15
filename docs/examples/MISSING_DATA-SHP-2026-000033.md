# Compliance report: SHP-2026-000033

**Status: INDETERMINATE**

INDETERMINATE [R-GAP-01]: 1 data gap(s) longer than 20 min (largest 130 min, 12 missing samples); gap time is not assumed in range.

- **Run:** RUN-2026-000033
- **As of:** 2026-11-01T00:00:00Z
- **Engine version:** engine-1.0.0
- **Input fingerprint:** 078b57912276a0ac5858260e78de59539583643bf03c54880dc3f9ddaf5e5987

## 2. Context

- **Product:** Ambient Product E (PRD-000005, OTHER)
- **Origin:** Dallas, Helix Pharma
- **Destination:** Seattle, Riverside Cold Storage
- **Departure (planned / actual):** 2026-03-11T11:20:00Z / 2026-03-11T11:30:00Z
- **Arrival (planned / actual):** 2026-03-12T16:10:00Z / 2026-03-12T16:40:00Z

### Lots

| lot | manufactured | expires | status | units |
| --- | --- | --- | --- | --- |
| LOT-2026-000009 | 2025-09-01 | 2027-03-01 | RELEASED | 521 |
| LOT-2026-000010 | 2025-11-01 | 2027-05-01 | RELEASED | 399 |

### Packaging

| packaging | type | supported range (C) | qualified hours |
| --- | --- | --- | --- |
| PKG-000003 | Ambient shipper 15-25C | 10 to 30 | 48 |

### Logger, assignment and calibration

| logger | serial | assignment | window | calibration (on / expires / uncertainty C) |
| --- | --- | --- | --- | --- |
| LGR-000015 | SN-100015-1197 | LOG-SHP-2026-000033-01 | 2026-03-11T11:00:00Z .. 2026-03-12T17:10:00Z | 2026-01-13 / 2027-01-13 / 0.28 |

## 3. Policy

- **Policy used for evaluation:** POL-000009 v1
- **Limits:** 15.00 to 25.00 C
- **Allowed excursion:** 120 min
- **Gap limit:** 20 min
- **Dwell limit:** 120 min
- **Effective:** 2026-01-01T00:00:00Z .. 2026-09-01T00:00:00Z
- **Applied on the shipment:** POL-000009 v1
- **Correct for the product at departure:** POL-000009 v1
- **Applied equals correct:** yes

## 4. Decision trace

| rule | name | result | detail | evidence readings |
| --- | --- | --- | --- | --- |
| R-LOG-01 | Logger exists | PASS | all assigned loggers exist | 0 |
| R-LOG-02 | Logger assignment covers transit | PASS | logger LGR-000015 assignment LOG-SHP-2026-000033-01 covers the whole transit | 0 |
| R-LOG-03 | Calibration valid | PASS | calibration valid for LGR-000015 from departure through arrival | 0 |
| R-LOG-04 | No overlapping assignments | PASS | no overlapping assignments on the assigned logger(s) | 0 |
| R-WIN-01 | Evaluation window | PASS | 164 GOOD reading(s) inside departure..arrival and the assignment window(s); 0 non-GOOD and 0 late-arriving reading(s) excluded | 0 |
| R-LOG-05 | Reading/assignment references agree | PASS | reading assignment references agree with assignment windows | 0 |
| R-GAP-01 | Missing data / gaps | INDETERMINATE | 1 data gap(s) longer than 20 min (largest 130 min, 12 missing samples); gap time is not assumed in range | 2 |
| R-TEMP-03 | Confirmed excursion vs allowance | PASS | confirmed excursion 0 min within allowed 120 min | 0 |
| R-TEMP-04 | Calibration uncertainty (marginal readings) | PASS | possible excursion 0 min does not change the decision (allowed 120 min) | 0 |
| R-POL-01 | Correct policy applied | PASS | applied policy POL-000009 v1 is the one effective at departure | 0 |
| R-LOT-01 | Lots present and consistent | PASS | 2 lot(s), all of the shipment's product | 0 |
| R-PKG-01 | Packaging qualification | PASS | packaging range and qualified duration cover the policy and planned duration | 0 |
| R-ROUTE-05 | Route evidence present | PASS | 3 actual stop(s) recorded | 0 |
| R-ROUTE-01 | Planned stops reached | PASS | every planned stop was reached | 0 |
| R-ROUTE-02 | No unplanned stops | PASS | no unplanned stops | 0 |
| R-ROUTE-03 | Stop sequence | PASS | actual stop order equals planned order | 0 |
| R-ROUTE-04 | Dwell time | PASS | all dwell times within 120 min | 0 |
| R-CUS-01 | Custody chain continuous | PASS | custody chain continuous over 3 events (PICKUP to DELIVERY) | 0 |
| R-CUS-02 | Custody timestamps | PASS | custody timestamps ordered and recorded after the events | 0 |
| R-ISO-01 | Shipment isolation (legacy reports) | PASS | excursion runs computed per assignment window; 0 legacy report(s) all inside the shipment window | 0 |

## 5. Temperature

- **Min / mean / max:** 18.14 / 20.03 / 21.48 C
- **Readings expected / received:** 176 / 164 (93.2% coverage)
- **Reading classes:** IN 164, OUT 0, MARGINAL 0

### Excursions

(none)

No confirmed out-of-range readings.

Confirmed out-of-range: 0 = 0 min <= 120 min allowed

Only 10-minute samples exist. Excursion start and end are therefore inferred by sample-and-hold (start = first out-of-range sample; end = the next in-range sample, or last out-of-range sample + sampling interval, capped at arrival); the exact physical times are unknown.

## 6. Data gaps

| from | to | minutes | missing samples |
| --- | --- | --- | --- |
| 2026-03-12T01:10:00Z | 2026-03-12T03:20:00Z | 130 | 12 |

Total missing samples: 12; gap limit 20 min. During a gap nothing is known about the product temperature; gap time is never counted as in range.

## 7. Route and custody

### Route

| # | type | location | planned arrival | planned departure | actual arrival | actual departure | dwell min | flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | ORIGIN | Dallas | 2026-03-11T10:50:00Z | 2026-03-11T11:20:00Z | 2026-03-11T11:02:00Z | 2026-03-11T11:30:00Z | 28 | OK |
| 2 | TRANSIT | Reno | 2026-03-12T01:45:00Z | 2026-03-12T02:26:00Z | 2026-03-12T01:54:00Z | 2026-03-12T02:31:00Z | 37 | OK |
| 3 | DESTINATION | Seattle | 2026-03-12T16:10:00Z | - | 2026-03-12T16:40:00Z | - | - | OK |

### Custody chain

| seq | from | to | type | event time | recorded | continuity |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Helix Pharma (PTY-000002) | IceWay Cargo (PTY-000009) | PICKUP | 2026-03-11T11:30:00Z | 2026-03-11T11:44:00Z | OK |
| 2 | IceWay Cargo (PTY-000009) | PolarExpress (PTY-000007) | HANDOVER | 2026-03-12T01:54:00Z | 2026-03-12T02:14:00Z | OK |
| 3 | PolarExpress (PTY-000007) | Riverside Cold Storage (PTY-000014) | DELIVERY | 2026-03-12T16:40:00Z | 2026-03-12T16:42:00Z | OK |

## 8. Evidence appendix

| reading | recorded at | temperature C | uncertainty C | class |
| --- | --- | --- | --- | --- |
| TEMP-LGR-000015-20260312T011000Z | 2026-03-12T01:10:00Z | 19.53 | 0.28 | IN |
| TEMP-LGR-000015-20260312T032000Z | 2026-03-12T03:20:00Z | 20.98 | 0.28 | IN |

All 2 cited readings are listed.

## 9. History

### Earlier runs

(none)

No earlier runs for this shipment.

### Exception history

(none)

No exception history.
