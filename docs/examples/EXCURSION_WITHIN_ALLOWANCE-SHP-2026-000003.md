# Compliance report: SHP-2026-000003

**Status: COMPLIANT**

COMPLIANT [ALL_RULES_PASS]: all 20 checks passed (policy POL-000003 v1, 2.00-8.00 C).

- **Run:** RUN-2026-000003
- **As of:** 2026-11-01T00:00:00Z
- **Engine version:** engine-1.0.0
- **Input fingerprint:** 0d85fa32862a1fd4156571c1904a8afd74e7ed8694f01efa3fb7a0b8012573ce

## 2. Context

- **Product:** Biologic B (PRD-000002, BIOLOGIC)
- **Origin:** Columbus, Helix Pharma
- **Destination:** Memphis, Harbor Depot
- **Departure (planned / actual):** 2026-02-20T15:50:00Z / 2026-02-20T16:00:00Z
- **Arrival (planned / actual):** 2026-02-22T15:10:00Z / 2026-02-22T18:00:00Z

### Lots

| lot | manufactured | expires | status | units |
| --- | --- | --- | --- | --- |
| LOT-2026-000003 | 2025-09-01 | 2027-03-01 | RELEASED | 385 |
| LOT-2026-000004 | 2025-11-01 | 2027-05-01 | RELEASED | 160 |

### Packaging

| packaging | type | supported range (C) | qualified hours |
| --- | --- | --- | --- |
| PKG-000001 | Passive insulated shipper 2-8C | 0 to 10 | 96 |

### Logger, assignment and calibration

| logger | serial | assignment | window | calibration (on / expires / uncertainty C) |
| --- | --- | --- | --- | --- |
| LGR-000003 | SN-100003-9924 | LOG-SHP-2026-000003-01 | 2026-02-20T15:30:00Z .. 2026-02-22T18:30:00Z | 2026-01-06 / 2027-01-06 / 0.34 |

## 3. Policy

- **Policy used for evaluation:** POL-000003 v1
- **Limits:** 2.00 to 8.00 C
- **Allowed excursion:** 45 min
- **Gap limit:** 20 min
- **Dwell limit:** 120 min
- **Effective:** 2026-01-01T00:00:00Z .. 2026-09-01T00:00:00Z
- **Applied on the shipment:** POL-000003 v1
- **Correct for the product at departure:** POL-000003 v1
- **Applied equals correct:** yes

## 4. Decision trace

| rule | name | result | detail | evidence readings |
| --- | --- | --- | --- | --- |
| R-LOG-01 | Logger exists | PASS | all assigned loggers exist | 0 |
| R-LOG-02 | Logger assignment covers transit | PASS | logger LGR-000003 assignment LOG-SHP-2026-000003-01 covers the whole transit | 0 |
| R-LOG-03 | Calibration valid | PASS | calibration valid for LGR-000003 from departure through arrival | 0 |
| R-LOG-04 | No overlapping assignments | PASS | no overlapping assignments on the assigned logger(s) | 0 |
| R-WIN-01 | Evaluation window | PASS | 301 GOOD reading(s) inside departure..arrival and the assignment window(s); 0 non-GOOD and 0 late-arriving reading(s) excluded | 0 |
| R-LOG-05 | Reading/assignment references agree | PASS | reading assignment references agree with assignment windows | 0 |
| R-GAP-01 | Missing data / gaps | PASS | no missing samples (301 readings, every spacing within 20 min) | 0 |
| R-TEMP-03 | Confirmed excursion vs allowance | PASS | confirmed excursion 10 min within allowed 45 min | 1 |
| R-TEMP-04 | Calibration uncertainty (marginal readings) | PASS | possible excursion 10 min does not change the decision (allowed 45 min) | 0 |
| R-POL-01 | Correct policy applied | PASS | applied policy POL-000003 v1 is the one effective at departure | 0 |
| R-LOT-01 | Lots present and consistent | PASS | 2 lot(s), all of the shipment's product | 0 |
| R-PKG-01 | Packaging qualification | PASS | packaging range and qualified duration cover the policy and planned duration | 0 |
| R-ROUTE-05 | Route evidence present | PASS | 3 actual stop(s) recorded | 0 |
| R-ROUTE-01 | Planned stops reached | PASS | every planned stop was reached | 0 |
| R-ROUTE-02 | No unplanned stops | PASS | no unplanned stops | 0 |
| R-ROUTE-03 | Stop sequence | PASS | actual stop order equals planned order | 0 |
| R-ROUTE-04 | Dwell time | PASS | all dwell times within 120 min | 0 |
| R-CUS-01 | Custody chain continuous | PASS | custody chain continuous over 3 events (PICKUP to DELIVERY) | 0 |
| R-CUS-02 | Custody timestamps | PASS | custody timestamps ordered and recorded after the events | 0 |
| R-ISO-01 | Shipment isolation (legacy reports) | PASS | excursion runs computed per assignment window; 1 legacy report(s) all inside the shipment window | 0 |

## 5. Temperature

- **Min / mean / max:** 3.20 / 5.05 / 9.44 C
- **Readings expected / received:** 301 / 301 (100.0% coverage)
- **Reading classes:** IN 300, OUT 1, MARGINAL 0

### Excursions

| start | end | minutes | peak C | OUT readings | first reading | last reading |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-02-22T14:20:00Z | 2026-02-22T14:30:00Z | 10 | 9.44 | 1 | TEMP-LGR-000003-20260222T142000Z | TEMP-LGR-000003-20260222T142000Z |

Confirmed out-of-range: 10 = 10 min <= 45 min allowed

Only 10-minute samples exist. Excursion start and end are therefore inferred by sample-and-hold (start = first out-of-range sample; end = the next in-range sample, or last out-of-range sample + sampling interval, capped at arrival); the exact physical times are unknown.

## 6. Data gaps

Total missing samples: 0; gap limit 20 min. During a gap nothing is known about the product temperature; gap time is never counted as in range.

## 7. Route and custody

### Route

| # | type | location | planned arrival | planned departure | actual arrival | actual departure | dwell min | flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | ORIGIN | Columbus | 2026-02-20T15:20:00Z | 2026-02-20T15:50:00Z | 2026-02-20T15:27:00Z | 2026-02-20T16:00:00Z | 33 | OK |
| 2 | TRANSIT | Reno | 2026-02-21T15:30:00Z | 2026-02-21T17:12:00Z | 2026-02-21T15:36:00Z | 2026-02-21T17:12:00Z | 96 | OK |
| 3 | DESTINATION | Memphis | 2026-02-22T15:10:00Z | - | 2026-02-22T18:00:00Z | - | - | OK |

### Custody chain

| seq | from | to | type | event time | recorded | continuity |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Helix Pharma (PTY-000002) | ChillTrans (PTY-000008) | PICKUP | 2026-02-20T16:00:00Z | 2026-02-20T16:03:00Z | OK |
| 2 | ChillTrans (PTY-000008) | FrostLine Logistics (PTY-000004) | HANDOVER | 2026-02-21T15:36:00Z | 2026-02-21T16:03:00Z | OK |
| 3 | FrostLine Logistics (PTY-000004) | Harbor Depot (PTY-000011) | DELIVERY | 2026-02-22T18:00:00Z | 2026-02-22T18:21:00Z | OK |

## 8. Evidence appendix

| reading | recorded at | temperature C | uncertainty C | class |
| --- | --- | --- | --- | --- |
| TEMP-LGR-000003-20260222T142000Z | 2026-02-22T14:20:00Z | 9.44 | 0.34 | OUT |

All 1 cited readings are listed.

## 9. History

### Earlier runs

(none)

No earlier runs for this shipment.

### Exception history

(none)

No exception history.
