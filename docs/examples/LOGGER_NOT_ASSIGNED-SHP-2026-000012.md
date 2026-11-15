# Compliance report: SHP-2026-000012

**Status: INDETERMINATE**

INDETERMINATE [R-LOG-02]: no logger assignment exists for this shipment; readings are not trusted. (+2 other findings)

- **Run:** RUN-2026-000012
- **As of:** 2026-11-01T00:00:00Z
- **Engine version:** engine-1.0.0
- **Input fingerprint:** 1fe2659d36496943e8da763ab3e0a3e6a5f193512d94678ef6d665af1ff29da7

## 2. Context

- **Product:** Insulin C (PRD-000003, INSULIN)
- **Origin:** Chicago, Aurora Labs
- **Destination:** Tampa, Northgate Warehouse
- **Departure (planned / actual):** 2026-01-28T14:00:00Z / 2026-01-28T14:00:00Z
- **Arrival (planned / actual):** 2026-01-29T20:50:00Z / 2026-01-29T21:10:00Z

### Lots

| lot | manufactured | expires | status | units |
| --- | --- | --- | --- | --- |
| LOT-2026-000005 | 2025-09-01 | 2027-03-01 | RELEASED | 984 |
| LOT-2026-000006 | 2025-11-01 | 2027-05-01 | RELEASED | 205 |

### Packaging

| packaging | type | supported range (C) | qualified hours |
| --- | --- | --- | --- |
| PKG-000001 | Passive insulated shipper 2-8C | 0 to 10 | 96 |

### Logger, assignment and calibration

(none)

No logger assignment exists for this shipment.

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
| R-LOG-02 | Logger assignment covers transit | INDETERMINATE | no logger assignment exists for this shipment; readings are not trusted | 0 |
| R-LOG-04 | No overlapping assignments | PASS | no overlapping assignments on the assigned logger(s) | 0 |
| R-WIN-01 | Evaluation window | PASS | 0 GOOD reading(s) inside departure..arrival and the assignment window(s); 0 non-GOOD and 0 late-arriving reading(s) excluded | 0 |
| R-LOG-05 | Reading/assignment references agree | PASS | reading assignment references agree with assignment windows | 0 |
| R-TEMP-00 | Readings trusted (evidence gate) | INDETERMINATE | NOT_EVALUATED: readings untrusted because R-LOG-02 (no logger assignment exists for this shipment; readings are not trusted) | 0 |
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
| R-SILENT-01 | Legacy PASS vs engine decision | WARNING | legacy report LEG-2026-000012 says PASS but the engine decision is INDETERMINATE | 0 |

## 5. Temperature

Temperature was not evaluated. NOT_EVALUATED: readings untrusted because R-LOG-02 (no logger assignment exists for this shipment; readings are not trusted)

Only 10-minute samples exist. Excursion start and end are therefore inferred by sample-and-hold (start = first out-of-range sample; end = the next in-range sample, or last out-of-range sample + sampling interval, capped at arrival); the exact physical times are unknown.

## 6. Data gaps

Not evaluated (readings untrusted).

## 7. Route and custody

### Route

| # | type | location | planned arrival | planned departure | actual arrival | actual departure | dwell min | flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | ORIGIN | Chicago | 2026-01-28T13:30:00Z | 2026-01-28T14:00:00Z | 2026-01-28T13:38:00Z | 2026-01-28T14:00:00Z | 22 | OK |
| 2 | TRANSIT | Denver | 2026-01-29T00:17:00Z | 2026-01-29T01:10:00Z | 2026-01-29T00:24:00Z | 2026-01-29T01:17:00Z | 53 | OK |
| 3 | TRANSIT | Omaha | 2026-01-29T10:33:00Z | 2026-01-29T12:02:00Z | 2026-01-29T10:34:00Z | 2026-01-29T12:12:00Z | 98 | OK |
| 4 | DESTINATION | Tampa | 2026-01-29T20:50:00Z | - | 2026-01-29T21:10:00Z | - | - | OK |

### Custody chain

| seq | from | to | type | event time | recorded | continuity |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Aurora Labs (PTY-000003) | ArcticFreight (PTY-000005) | PICKUP | 2026-01-28T14:00:00Z | 2026-01-28T14:26:00Z | OK |
| 2 | ArcticFreight (PTY-000005) | PolarExpress (PTY-000007) | HANDOVER | 2026-01-29T00:24:00Z | 2026-01-29T00:28:00Z | OK |
| 3 | PolarExpress (PTY-000007) | ChillTrans (PTY-000008) | HANDOVER | 2026-01-29T10:34:00Z | 2026-01-29T10:55:00Z | OK |
| 4 | ChillTrans (PTY-000008) | Northgate Warehouse (PTY-000013) | DELIVERY | 2026-01-29T21:10:00Z | 2026-01-29T21:20:00Z | OK |

## 8. Evidence appendix

All 0 cited readings are listed.

## 9. History

### Earlier runs

(none)

No earlier runs for this shipment.

### Exception history

(none)

No exception history.
