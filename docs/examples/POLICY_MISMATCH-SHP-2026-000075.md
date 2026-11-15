# Compliance report: SHP-2026-000075

**Status: INDETERMINATE**

INDETERMINATE [R-POL-01]: applied policy POL-000008 is wrong (not effective at departure 2026-08-09T09:00:00Z); correct policy is POL-000007 v1; evaluating against it: temperature within limits. (+1 other findings)

- **Run:** RUN-2026-000075
- **As of:** 2026-11-01T00:00:00Z
- **Engine version:** engine-1.0.0
- **Input fingerprint:** 12dc6d0d6215b44fd22dee6850a2604325d0d10b2e9893ffa07cd612c87edcc9

## 2. Context

- **Product:** Frozen Vaccine D (PRD-000004, VACCINE)
- **Origin:** Denver, Nordic Biologics
- **Destination:** Seattle, Central Cold Store
- **Departure (planned / actual):** 2026-08-09T09:00:00Z / 2026-08-09T09:00:00Z
- **Arrival (planned / actual):** 2026-08-10T05:00:00Z / 2026-08-10T05:10:00Z

### Lots

| lot | manufactured | expires | status | units |
| --- | --- | --- | --- | --- |
| LOT-2026-000008 | 2025-11-01 | 2027-05-01 | RELEASED | 545 |

### Packaging

| packaging | type | supported range (C) | qualified hours |
| --- | --- | --- | --- |
| PKG-000002 | Deep-frozen shipper | -30 to -10 | 96 |

### Logger, assignment and calibration

| logger | serial | assignment | window | calibration (on / expires / uncertainty C) |
| --- | --- | --- | --- | --- |
| LGR-000003 | SN-100003-9924 | LOG-SHP-2026-000075-01 | 2026-08-09T08:30:00Z .. 2026-08-10T05:40:00Z | 2026-01-06 / 2027-01-06 / 0.34 |

## 3. Policy

- **Policy used for evaluation:** POL-000007 v1
- **Limits:** -25.00 to -15.00 C
- **Allowed excursion:** 20 min
- **Gap limit:** 20 min
- **Dwell limit:** 120 min
- **Effective:** 2026-01-01T00:00:00Z .. 2026-09-01T00:00:00Z
- **Applied on the shipment:** POL-000008 v2
- **Correct for the product at departure:** POL-000007 v1
- **Applied equals correct:** NO (see R-POL-01)

## 4. Decision trace

| rule | name | result | detail | evidence readings |
| --- | --- | --- | --- | --- |
| R-LOG-01 | Logger exists | PASS | all assigned loggers exist | 0 |
| R-LOG-02 | Logger assignment covers transit | PASS | logger LGR-000003 assignment LOG-SHP-2026-000075-01 covers the whole transit | 0 |
| R-LOG-03 | Calibration valid | PASS | calibration valid for LGR-000003 from departure through arrival | 0 |
| R-LOG-04 | No overlapping assignments | PASS | no overlapping assignments on the assigned logger(s) | 0 |
| R-WIN-01 | Evaluation window | PASS | 122 GOOD reading(s) inside departure..arrival and the assignment window(s); 0 non-GOOD and 0 late-arriving reading(s) excluded | 0 |
| R-LOG-05 | Reading/assignment references agree | PASS | reading assignment references agree with assignment windows | 0 |
| R-GAP-01 | Missing data / gaps | PASS | no missing samples (122 readings, every spacing within 20 min) | 0 |
| R-TEMP-03 | Confirmed excursion vs allowance | PASS | confirmed excursion 0 min within allowed 20 min | 0 |
| R-TEMP-04 | Calibration uncertainty (marginal readings) | PASS | possible excursion 0 min does not change the decision (allowed 20 min) | 0 |
| R-POL-01 | Correct policy applied | INDETERMINATE | applied policy POL-000008 is wrong (not effective at departure 2026-08-09T09:00:00Z); correct policy is POL-000007 v1; evaluating against it: temperature within limits | 0 |
| R-LOT-01 | Lots present and consistent | PASS | 1 lot(s), all of the shipment's product | 0 |
| R-PKG-01 | Packaging qualification | PASS | packaging range and qualified duration cover the policy and planned duration | 0 |
| R-ROUTE-05 | Route evidence present | PASS | 3 actual stop(s) recorded | 0 |
| R-ROUTE-01 | Planned stops reached | PASS | every planned stop was reached | 0 |
| R-ROUTE-02 | No unplanned stops | PASS | no unplanned stops | 0 |
| R-ROUTE-03 | Stop sequence | PASS | actual stop order equals planned order | 0 |
| R-ROUTE-04 | Dwell time | PASS | all dwell times within 120 min | 0 |
| R-CUS-01 | Custody chain continuous | PASS | custody chain continuous over 3 events (PICKUP to DELIVERY) | 0 |
| R-CUS-02 | Custody timestamps | PASS | custody timestamps ordered and recorded after the events | 0 |
| R-ISO-01 | Shipment isolation (legacy reports) | PASS | excursion runs computed per assignment window; 0 legacy report(s) all inside the shipment window | 0 |
| R-SILENT-01 | Legacy PASS vs engine decision | WARNING | legacy report LEG-2026-000075 says PASS but the engine decision is INDETERMINATE | 0 |

## 5. Temperature

- **Min / mean / max:** -21.07 / -19.62 / -18.04 C
- **Readings expected / received:** 122 / 122 (100.0% coverage)
- **Reading classes:** IN 122, OUT 0, MARGINAL 0

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
| 1 | ORIGIN | Denver | 2026-08-09T08:30:00Z | 2026-08-09T09:00:00Z | 2026-08-09T08:42:00Z | 2026-08-09T09:00:00Z | 18 | OK |
| 2 | TRANSIT | Phoenix | 2026-08-09T19:00:00Z | 2026-08-09T20:15:00Z | 2026-08-09T19:06:00Z | 2026-08-09T20:29:00Z | 83 | OK |
| 3 | DESTINATION | Seattle | 2026-08-10T05:00:00Z | - | 2026-08-10T05:10:00Z | - | - | OK |

### Custody chain

| seq | from | to | type | event time | recorded | continuity |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Nordic Biologics (PTY-000001) | CoolRoute (PTY-000006) | PICKUP | 2026-08-09T09:00:00Z | 2026-08-09T09:17:00Z | OK |
| 2 | CoolRoute (PTY-000006) | ArcticFreight (PTY-000005) | HANDOVER | 2026-08-09T19:06:00Z | 2026-08-09T19:17:00Z | OK |
| 3 | ArcticFreight (PTY-000005) | Central Cold Store (PTY-000010) | DELIVERY | 2026-08-10T05:10:00Z | 2026-08-10T05:29:00Z | OK |

## 8. Evidence appendix

All 0 cited readings are listed.

## 9. History

### Earlier runs

(none)

No earlier runs for this shipment.

### Exception history

(none)

No exception history.
