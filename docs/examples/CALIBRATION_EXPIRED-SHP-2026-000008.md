# Compliance report: SHP-2026-000008

**Status: INDETERMINATE**

INDETERMINATE [R-LOG-03]: logger LGR-000019 has no calibration valid from departure through arrival. (+2 other findings)

- **Run:** RUN-2026-000008
- **As of:** 2026-11-01T00:00:00Z
- **Engine version:** engine-1.0.0
- **Input fingerprint:** e2d9ac6f69a719dbf2c5afe44228e955f358645c097fa7a252b970bed3a1e098

## 2. Context

- **Product:** Vaccine A (PRD-000001, VACCINE)
- **Origin:** Memphis, Nordic Biologics
- **Destination:** Denver, Northgate Warehouse
- **Departure (planned / actual):** 2026-08-19T18:20:00Z / 2026-08-19T18:20:00Z
- **Arrival (planned / actual):** 2026-08-20T23:50:00Z / 2026-08-20T23:50:00Z

### Lots

| lot | manufactured | expires | status | units |
| --- | --- | --- | --- | --- |
| LOT-2026-000001 | 2025-09-01 | 2027-03-01 | RELEASED | 499 |
| LOT-2026-000002 | 2025-11-01 | 2027-05-01 | RELEASED | 795 |

### Packaging

| packaging | type | supported range (C) | qualified hours |
| --- | --- | --- | --- |
| PKG-000001 | Passive insulated shipper 2-8C | 0 to 10 | 96 |

### Logger, assignment and calibration

| logger | serial | assignment | window | calibration (on / expires / uncertainty C) |
| --- | --- | --- | --- | --- |
| LGR-000019 | SN-100019-9927 | LOG-SHP-2026-000008-01 | 2026-08-19T17:50:00Z .. 2026-08-21T00:20:00Z | 2025-02-01 / 2026-02-01 / 0.36 |

## 3. Policy

- **Policy used for evaluation:** POL-000001 v1
- **Limits:** 2.00 to 8.00 C
- **Allowed excursion:** 30 min
- **Gap limit:** 20 min
- **Dwell limit:** 120 min
- **Effective:** 2026-01-01T00:00:00Z .. 2026-09-01T00:00:00Z
- **Applied on the shipment:** POL-000001 v1
- **Correct for the product at departure:** POL-000001 v1
- **Applied equals correct:** yes

## 4. Decision trace

| rule | name | result | detail | evidence readings |
| --- | --- | --- | --- | --- |
| R-LOG-01 | Logger exists | PASS | all assigned loggers exist | 0 |
| R-LOG-02 | Logger assignment covers transit | PASS | logger LGR-000019 assignment LOG-SHP-2026-000008-01 covers the whole transit | 0 |
| R-LOG-03 | Calibration valid | INDETERMINATE | logger LGR-000019 has no calibration valid from departure through arrival | 0 |
| R-LOG-04 | No overlapping assignments | PASS | no overlapping assignments on the assigned logger(s) | 0 |
| R-WIN-01 | Evaluation window | PASS | 178 GOOD reading(s) inside departure..arrival and the assignment window(s); 0 non-GOOD and 0 late-arriving reading(s) excluded | 0 |
| R-LOG-05 | Reading/assignment references agree | PASS | reading assignment references agree with assignment windows | 0 |
| R-TEMP-00 | Readings trusted (evidence gate) | INDETERMINATE | NOT_EVALUATED: readings untrusted because R-LOG-03 (logger LGR-000019 has no calibration valid from departure through arrival) | 0 |
| R-POL-01 | Correct policy applied | PASS | applied policy POL-000001 v1 is the one effective at departure | 0 |
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
| R-SILENT-01 | Legacy PASS vs engine decision | WARNING | legacy report LEG-2026-000008 says PASS but the engine decision is INDETERMINATE | 0 |

## 5. Temperature

Temperature was not evaluated. NOT_EVALUATED: readings untrusted because R-LOG-03 (logger LGR-000019 has no calibration valid from departure through arrival)

Only 10-minute samples exist. Excursion start and end are therefore inferred by sample-and-hold (start = first out-of-range sample; end = the next in-range sample, or last out-of-range sample + sampling interval, capped at arrival); the exact physical times are unknown.

## 6. Data gaps

Not evaluated (readings untrusted).

## 7. Route and custody

### Route

| # | type | location | planned arrival | planned departure | actual arrival | actual departure | dwell min | flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | ORIGIN | Memphis | 2026-08-19T17:50:00Z | 2026-08-19T18:20:00Z | 2026-08-19T18:03:00Z | 2026-08-19T18:20:00Z | 17 | OK |
| 2 | TRANSIT | Phoenix | 2026-08-20T09:05:00Z | 2026-08-20T09:36:00Z | 2026-08-20T09:18:00Z | 2026-08-20T09:40:00Z | 22 | OK |
| 3 | DESTINATION | Denver | 2026-08-20T23:50:00Z | - | 2026-08-20T23:50:00Z | - | - | OK |

### Custody chain

| seq | from | to | type | event time | recorded | continuity |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Nordic Biologics (PTY-000001) | IceWay Cargo (PTY-000009) | PICKUP | 2026-08-19T18:20:00Z | 2026-08-19T18:21:00Z | OK |
| 2 | IceWay Cargo (PTY-000009) | PolarExpress (PTY-000007) | HANDOVER | 2026-08-20T09:18:00Z | 2026-08-20T09:18:00Z | OK |
| 3 | PolarExpress (PTY-000007) | Northgate Warehouse (PTY-000013) | DELIVERY | 2026-08-20T23:50:00Z | 2026-08-20T23:51:00Z | OK |

## 8. Evidence appendix

All 0 cited readings are listed.

## 9. History

### Earlier runs

(none)

No earlier runs for this shipment.

### Exception history

(none)

No exception history.
