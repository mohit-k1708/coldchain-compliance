# Compliance report: SHP-2026-000023

**Status: COMPLIANT**

COMPLIANT [ALL_RULES_PASS]: all 19 checks passed (policy POL-000009 v1, 15.00-25.00 C). (+1 other findings)

- **Run:** RUN-2026-000023
- **As of:** 2026-11-01T00:00:00Z
- **Engine version:** engine-1.0.0
- **Input fingerprint:** 3675598d5b314d3479a0d3e185990196e7d4202239704a61474f74b893a2fbbd

## 2. Context

- **Product:** Ambient Product E (PRD-000005, OTHER)
- **Origin:** Atlanta, Helix Pharma
- **Destination:** Dallas, Central Cold Store
- **Departure (planned / actual):** 2026-04-11T21:00:00Z / 2026-04-11T21:10:00Z
- **Arrival (planned / actual):** 2026-04-12T14:00:00Z / 2026-04-12T14:10:00Z

### Lots

| lot | manufactured | expires | status | units |
| --- | --- | --- | --- | --- |
| LOT-2026-000009 | 2025-09-01 | 2027-03-01 | RELEASED | 431 |
| LOT-2026-000010 | 2025-11-01 | 2027-05-01 | RELEASED | 215 |

### Packaging

| packaging | type | supported range (C) | qualified hours |
| --- | --- | --- | --- |
| PKG-000003 | Ambient shipper 15-25C | 10 to 30 | 48 |

### Logger, assignment and calibration

| logger | serial | assignment | window | calibration (on / expires / uncertainty C) |
| --- | --- | --- | --- | --- |
| LGR-000005 | SN-100005-8713 | LOG-SHP-2026-000023-01 | 2026-04-11T20:40:00Z .. 2026-04-12T14:10:00Z | 2026-01-09 / 2027-01-09 / 0.22 |

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
| R-LOG-02 | Logger assignment covers transit | PASS | logger LGR-000005 assignment LOG-SHP-2026-000023-01 covers the whole transit | 0 |
| R-LOG-03 | Calibration valid | PASS | calibration valid for LGR-000005 from departure through arrival | 0 |
| R-LOG-04 | No overlapping assignments | PASS | no overlapping assignments on the assigned logger(s) | 0 |
| R-WIN-01 | Evaluation window | PASS | 103 GOOD reading(s) inside departure..arrival and the assignment window(s); 0 non-GOOD and 0 late-arriving reading(s) excluded | 0 |
| R-LOG-05 | Reading/assignment references agree | PASS | reading assignment references agree with assignment windows | 0 |
| R-GAP-01 | Missing data / gaps | PASS | no missing samples (103 readings, every spacing within 20 min) | 0 |
| R-TEMP-03 | Confirmed excursion vs allowance | PASS | confirmed excursion 20 min within allowed 120 min | 3 |
| R-TEMP-04 | Calibration uncertainty (marginal readings) | PASS | possible excursion 20 min does not change the decision (allowed 120 min) | 0 |
| R-POL-01 | Correct policy applied | PASS | applied policy POL-000009 v1 is the one effective at departure | 0 |
| R-LOT-01 | Lots present and consistent | PASS | 2 lot(s), all of the shipment's product | 0 |
| R-PKG-01 | Packaging qualification | PASS | packaging range and qualified duration cover the policy and planned duration | 0 |
| R-ROUTE-05 | Route evidence present | PASS | 4 actual stop(s) recorded | 0 |
| R-ROUTE-01 | Planned stops reached | PASS | every planned stop was reached | 0 |
| R-ROUTE-02 | No unplanned stops | PASS | no unplanned stops | 0 |
| R-ROUTE-03 | Stop sequence | PASS | actual stop order equals planned order | 0 |
| R-ROUTE-04 | Dwell time | PASS | all dwell times within 120 min | 0 |
| R-CUS-01 | Custody chain continuous | PASS | custody chain continuous over 4 events (PICKUP to DELIVERY) | 0 |
| R-CUS-02 | Custody timestamps | PASS | custody timestamps ordered and recorded after the events | 0 |
| R-ISO-01 | Shipment isolation (legacy reports) | WARNING | legacy report(s) EXCR-2026-000221 (CROSS_SHIPMENT_REPORT 2026-04-12T13:50:00Z..2026-04-12T16:10:00Z) extend outside this shipment's window; runs are computed per assignment window, so they are not attributed to this shipment | 0 |

## 5. Temperature

- **Min / mean / max:** 17.95 / 19.98 / 29.52 C
- **Readings expected / received:** 103 / 103 (100.0% coverage)
- **Reading classes:** IN 100, OUT 3, MARGINAL 0

### Excursions

| start | end | minutes | peak C | OUT readings | first reading | last reading |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-04-12T13:50:00Z | 2026-04-12T14:10:00Z | 20 | 29.52 | 3 | TEMP-LGR-000005-20260412T135000Z | TEMP-LGR-000005-20260412T141000Z |

Confirmed out-of-range: 20 = 20 min <= 120 min allowed

Only 10-minute samples exist. Excursion start and end are therefore inferred by sample-and-hold (start = first out-of-range sample; end = the next in-range sample, or last out-of-range sample + sampling interval, capped at arrival); the exact physical times are unknown.

## 6. Data gaps

Total missing samples: 0; gap limit 20 min. During a gap nothing is known about the product temperature; gap time is never counted as in range.

## 7. Route and custody

### Route

| # | type | location | planned arrival | planned departure | actual arrival | actual departure | dwell min | flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | ORIGIN | Atlanta | 2026-04-11T20:30:00Z | 2026-04-11T21:00:00Z | 2026-04-11T20:31:00Z | 2026-04-11T21:10:00Z | 39 | OK |
| 2 | TRANSIT | Chicago | 2026-04-12T02:40:00Z | 2026-04-12T03:53:00Z | 2026-04-12T02:45:00Z | 2026-04-12T03:57:00Z | 72 | OK |
| 3 | TRANSIT | Memphis | 2026-04-12T08:20:00Z | 2026-04-12T08:57:00Z | 2026-04-12T08:35:00Z | 2026-04-12T08:59:00Z | 24 | OK |
| 4 | DESTINATION | Dallas | 2026-04-12T14:00:00Z | - | 2026-04-12T14:10:00Z | - | - | OK |

### Custody chain

| seq | from | to | type | event time | recorded | continuity |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Helix Pharma (PTY-000002) | CoolRoute (PTY-000006) | PICKUP | 2026-04-11T21:10:00Z | 2026-04-11T21:20:00Z | OK |
| 2 | CoolRoute (PTY-000006) | PolarExpress (PTY-000007) | HANDOVER | 2026-04-12T02:45:00Z | 2026-04-12T02:59:00Z | OK |
| 3 | PolarExpress (PTY-000007) | IceWay Cargo (PTY-000009) | HANDOVER | 2026-04-12T08:35:00Z | 2026-04-12T08:59:00Z | OK |
| 4 | IceWay Cargo (PTY-000009) | Central Cold Store (PTY-000010) | DELIVERY | 2026-04-12T14:10:00Z | 2026-04-12T14:13:00Z | OK |

## 8. Evidence appendix

| reading | recorded at | temperature C | uncertainty C | class |
| --- | --- | --- | --- | --- |
| TEMP-LGR-000005-20260412T135000Z | 2026-04-12T13:50:00Z | 27.12 | 0.22 | OUT |
| TEMP-LGR-000005-20260412T140000Z | 2026-04-12T14:00:00Z | 27.32 | 0.22 | OUT |
| TEMP-LGR-000005-20260412T141000Z | 2026-04-12T14:10:00Z | 29.52 | 0.22 | OUT |

All 3 cited readings are listed.

## 9. History

### Earlier runs

(none)

No earlier runs for this shipment.

### Exception history

(none)

No exception history.
