# Business Rules, Assumptions and Decision Contract

Problem: *Prove that temperature-sensitive shipments remained within product and route requirements, and manage deviations.*

This file is the single source of truth for the generator, validator, compliance engine, ground truth and tests.
Where the problem statement is silent, the choice is marked **ASSUMPTION (A-xx)**. Nothing here is claimed to come from Yotta unless it is in the statement.

---

## 1. ID conventions

All IDs are immutable, zero-padded and referenced identically in every file.

| Entity | Format | Example | Source |
|---|---|---|---|
| Lot | `LOT-2026-NNNNNN` | LOT-2026-000001 | statement |
| Shipment | `SHP-2026-NNNNNN` | SHP-2026-000001 | statement |
| Logger assignment | `LOG-<shipment-id>-NN` | LOG-SHP-2026-000001-01 | statement (see A-01) |
| Temperature reading | `TEMP-<logger-id>-<timestamp>` | TEMP-LGR-000001-20260312T101000Z | statement (see A-01) |
| Excursion report | `EXCR-2026-NNNNNN` | EXCR-2026-000001 | statement |
| Product | `PRD-NNNNNN` | PRD-000001 | assumption |
| Packaging profile | `PKG-NNNNNN` | PKG-000001 | assumption |
| Physical logger | `LGR-NNNNNN` | LGR-000001 | assumption (A-01) |
| Threshold policy | `POL-NNNNNN` | POL-000001 | assumption |
| Custody event | `CUS-2026-NNNNNN` | CUS-2026-000001 | assumption |
| Route stop | `RST-2026-NNNNNN` | RST-2026-000001 | assumption |
| Party | `PTY-NNNNNN` | PTY-000001 | assumption |
| Compliance run | `RUN-2026-NNNNNN` | RUN-2026-000001 | assumption |

Timestamps in IDs: UTC, `YYYYMMDDThhmmssZ` reduced to `YYYYMMDDThhmmZ` (readings are on 10-minute marks).

### A-01 Logger identity (the biggest ambiguity)
The statement asks for **1,000 loggers** *and* the ID pattern `LOG-<shipment-id>-01` (which embeds a shipment).
With 5,000 shipments those cannot both describe the same row set.
Decision:
- `logger` table = **1,000 physical devices**, ID `LGR-NNNNNN`, reused across shipments over time.
- `logger_assignment` = one row per (device, shipment) deployment, ID `LOG-<shipment-id>-NN` (NN = 01 normally; 02 allows a second logger on one shipment).
- Readings are emitted by the **physical device** (a device does not know which shipment it is on), so `TEMP-<logger-id>-<timestamp>` uses the `LGR-` id and is unique per device per timestamp.
- Link reading -> shipment is *derived* from assignment time windows. `temperature_reading.logger_assignment_id` is the ingestion-time link and is NOT trusted; the engine re-derives it.

Alternative if organisers clarify otherwise: rename IDs only; ID generation is centralised in one module.

---

## 2. Enumerations

| Name | Values |
|---|---|
| shipment_status | PLANNED, PACKED, IN_TRANSIT, DELIVERED, CANCELLED |
| lot_status | CREATED, RELEASED, QUARANTINED, EXPIRED |
| packaging_status | ACTIVE, RETIRED |
| device_status | AVAILABLE, IN_USE, MAINTENANCE, RETIRED |
| calibration_status | VALID, EXPIRED, UNCALIBRATED |
| assignment_status | ASSIGNED, COMPLETED, CANCELLED |
| policy_status | DRAFT, ACTIVE, SUPERSEDED, RETIRED |
| reading_quality | GOOD, SUSPECT, INVALID |
| custody event_type | PICKUP, HANDOVER, DELIVERY |
| route stop_type | ORIGIN, TRANSIT, DESTINATION |
| party_type | SUPPLIER, CARRIER, WAREHOUSE |
| compliance_status | COMPLIANT, NON_COMPLIANT, INDETERMINATE |
| finding_result | PASS, FAIL, INDETERMINATE, WARNING |
| severity | LOW, MEDIUM, HIGH, CRITICAL |
| exception status | OPEN, ASSIGNED, INVESTIGATING, RESOLVED, ESCALATED |
| excursion source | LEGACY_IMPORT, ENGINE |
| legacy reported_status | PASS, FAIL |

**issue_type** (ExcursionReport):
`TEMP_HIGH`, `TEMP_LOW`, `MISSING_DATA`, `LOGGER_NOT_ASSIGNED`, `CALIBRATION_INVALID`, `ASSIGNMENT_OVERLAP`,
`POLICY_MISMATCH`, `CUSTODY_GAP`, `ROUTE_DEVIATION`, `CROSS_SHIPMENT_REPORT`, `CALIBRATION_MARGINAL`.

There is **no `REVIEW` status**. Investigation state is separate from compliance state.

---

## 3. Compliance decision (precedence)

Evaluated per shipment with `shipment_status = DELIVERED`. CANCELLED / not-yet-delivered shipments are **not evaluated** (no run, no status).

1. **NON_COMPLIANT** if any *confirmed* violation: R-TEMP-03 (confirmed excursion time > allowed) or R-ROUTE-01..04.
2. else **INDETERMINATE** if evidence is insufficient: R-GAP-01, R-LOG-01/02/03, R-POL-01, R-CUS-01/02, R-TEMP-04 (marginal), R-ROUTE-05, R-LOT-01.
3. else **COMPLIANT**.

*No evidence of failure is not evidence of compliance.*
Every finding stores the rule code, result, human-readable reason and the reading IDs it rests on.

---

## 4. Rules

### Evaluation window
**R-WIN-01** Readings for shipment S are those of the logger(s) with an assignment to S, with `recorded_at` in
`[departure_time, arrival_time]` (actual times) **and** inside the assignment window. Readings outside are never used.
Readings with `reading_quality <> GOOD` are excluded and count as missing.

### Temperature
**R-TEMP-01 Classification.** For reading temperature `t`, uncertainty `u` (+/- °C), policy limits `[min, max]`:
- IN: `min + u <= t <= max - u`
- OUT: `t < min - u` or `t > max + u`
- MARGINAL: everything else (within `u` of a limit)

Exactly at a limit with `u = 0` is IN. 8.1 °C with `u = 0` is OUT. (A-03)

**R-TEMP-02 Excursion segmentation and duration (A-01 of ambiguity list #1, called A-02 here).**
Consecutive OUT readings (no data gap between them) form one excursion run. Only sampled readings exist, so the physical start and end are *unknown*; we use **sample-and-hold**:
- `start_time` = time of first OUT reading
- `end_time` = time of the next non-OUT reading after the run; if the run reaches the end of the window, `last OUT time + sampling_interval`, capped at `arrival_time`
- `duration_minutes = end_time - start_time`

Example: 10:20 (9°C), 10:30 (10°C), 10:40 (7°C) with limit 8 gives start 10:20, end 10:40, duration **20 min**.
A single OUT reading at 10:20 followed by an IN reading at 10:30 gives **10 min**.
A run is never extended across a data gap: it ends at `last OUT time + sampling_interval`.

**R-TEMP-03 Allowed duration (A-02b).** Excursions are measured individually **and** cumulatively.
`confirmed_out_minutes` = sum of durations of all OUT excursions. If `confirmed_out_minutes > max_excursion_minutes` -> FAIL (NON_COMPLIANT). Equal to the limit is allowed.

**R-TEMP-04 Calibration uncertainty (A-03b).** Compute `possible_out_minutes` treating MARGINAL readings as OUT.
If `confirmed_out_minutes <= max` but `possible_out_minutes > max` -> INDETERMINATE (issue `CALIBRATION_MARGINAL`).

### Missing data
**R-GAP-01 (A-04).** Expected sampling interval comes from the policy (default 10 min). A gap exists when two consecutive valid readings, or a window boundary and the nearest valid reading, are more than `max_data_gap_minutes` apart (default **30 min**). Gap minutes are never assumed in-range.
Any gap -> INDETERMINATE (`MISSING_DATA`) unless NON_COMPLIANT already applies. Short jitter (< `max_data_gap_minutes`) is tolerated and reported as a coverage statistic only.

### Logger
**R-LOG-01** Logger exists (FK).
**R-LOG-02** An assignment for (logger, shipment) exists and covers `[departure_time, arrival_time]`. Otherwise readings are **not trusted** -> INDETERMINATE (`LOGGER_NOT_ASSIGNED`).
**R-LOG-03** Calibration valid at every reading time using `logger_calibration` history (not just the current logger row). Expired/missing -> INDETERMINATE (`CALIBRATION_INVALID`).
**R-LOG-04** No two assignments of the same logger overlap in time. Overlap -> data-quality alert + INDETERMINATE for the affected window (`ASSIGNMENT_OVERLAP`).
**R-LOG-05** If `reading.logger_assignment_id` disagrees with the window-derived assignment, raise a data-quality alert (not a compliance failure).

### Policy and product
**R-POL-01 (A-09).** The applied policy `shipment.policy_id` must: (a) belong to the shipment's product, (b) be effective at `departure_time` (`effective_from <= departure < effective_to or NULL`), (c) have limits inside the product's required range. The policy that *should* apply is the single policy for that product effective at departure. A mismatch -> INDETERMINATE (`POLICY_MISMATCH`); the finding also stores what the correct-policy evaluation would give. The run stores `policy_id` plus a snapshot of its limits so later policy edits do not change history.

### Lot / shipment
**R-LOT-01 (A-08).** A shipment links to 1..N lots via `shipment_lot`. All lots in one shipment share one product (generator rule). Zero lots -> INDETERMINATE.

### Packaging
**R-PKG-01 (A-07).** Packaging supported range must contain the policy range and `qualified_duration_hours >=` planned duration. Violation -> **WARNING** finding only; does not change compliance status.

### Route (A-05)
Planned stop = route_stop with `planned_arrival`; actual stop = with `actual_arrival`.
**R-ROUTE-01 MISSING_STOP** planned stop has no actual arrival on a delivered shipment -> FAIL.
**R-ROUTE-02 UNEXPECTED_STOP** actual stop without a planned counterpart -> FAIL.
**R-ROUTE-03 SEQUENCE** actual order differs from planned order -> FAIL.
**R-ROUTE-04 EXCESS_DWELL** `actual_departure - actual_arrival > policy.max_dwell_minutes` -> FAIL.
**R-ROUTE-05 MISSING_ROUTE_EVIDENCE** delivered shipment with no actual stops -> INDETERMINATE.
All route FAILs are issue_type `ROUTE_DEVIATION` (subtype in the finding detail).

### Custody (A-06)
**R-CUS-01** Chain must start with PICKUP (from origin party) and end with DELIVERY (to destination party), and be continuous: `to_party` of event *i* = `from_party` of event *i+1*. A break, or missing PICKUP/DELIVERY, is a **custody gap** -> INDETERMINATE (`CUSTODY_GAP`). A missing record is missing evidence, not proof of violation.
**R-CUS-02** Timestamps non-decreasing and `event_timestamp <= recorded_at`; DELIVERY not before PICKUP. Violations -> data-quality alert + INDETERMINATE. Duplicate handovers and unknown parties -> data-quality alert.

### Isolation (mandatory edge case 5)
**R-ISO-01** Excursion runs are computed **per assignment window**, never per logger stream. A physical logger is reused, so readings of shipment N and N+1 are adjacent in the stream; a run must not cross an assignment boundary. A `LEGACY_IMPORT` excursion report whose `[start,end]` leaves its shipment's window is flagged `CROSS_SHIPMENT_REPORT`.

### Silent pass (mandatory edge case 3)
**R-SILENT-01** If `legacy_report.reported_status = PASS` but the engine finds INDETERMINATE/NON_COMPLIANT, record a finding naming the disagreement.

### Late-arriving data (A-10)
Readings with `received_at > run.run_at` inside the window mark the run *stale*. Re-running creates a **new** run; previous runs and decisions are never overwritten. Repeated execution with identical inputs is idempotent (same `input_fingerprint` -> no new run).

---

## 5. Exception lifecycle
`OPEN -> ASSIGNED -> INVESTIGATING -> RESOLVED | ESCALATED`; `ESCALATED -> INVESTIGATING | RESOLVED`.
Every transition inserts a row in `exception_event`; `excursion_report.status` is just the latest state, history is never lost.

**Severity:** CRITICAL: temperature >= 5 °C beyond a limit, or duration >= 4x allowed. HIGH: duration > allowed, custody gap, route deviation. MEDIUM: marginal, data gap, within-allowance excursion over 50% of allowance. LOW: other within-allowance excursions and warnings.

---

## 6. Ground-truth contract (generator labels, written to `ground_truth.csv`, never read by the engine)

| issue_type (label) | Expected status | Expected rule / detection |
|---|---|---|
| NONE | COMPLIANT | all rules pass |
| BOUNDARY_AT_LIMIT | COMPLIANT | reading exactly at limit |
| EXCURSION_WITHIN_ALLOWANCE | COMPLIANT | excursion report created, duration <= allowed |
| TEMPERATURE_EXCURSION | NON_COMPLIANT | R-TEMP-03 |
| CALIBRATION_MARGINAL | INDETERMINATE | R-TEMP-04 |
| MISSING_DATA | INDETERMINATE | R-GAP-01 |
| MISSING_DATA_SILENTLY_PASSED | INDETERMINATE | R-GAP-01 + R-SILENT-01 (legacy says PASS) |
| LOGGER_NOT_ASSIGNED | INDETERMINATE | R-LOG-02 |
| CALIBRATION_EXPIRED | INDETERMINATE | R-LOG-03 |
| POLICY_MISMATCH | INDETERMINATE | R-POL-01 |
| CUSTODY_GAP | INDETERMINATE | R-CUS-01 |
| CROSS_SHIPMENT_EXCURSION | COMPLIANT (own readings fine) | R-ISO-01: legacy report flagged `CROSS_SHIPMENT_REPORT`; naive per-logger calc would wrongly say NON_COMPLIANT |
| ROUTE_DEVIATION | NON_COMPLIANT | R-ROUTE-01..04 |

Labels are produced by the injector from the *injection it performed*, not by calling engine code (avoids circular 100% metrics). Multi-label shipments are avoided in v1 so each shipment has exactly one label.

---

## 7. Assumption index

| ID | Topic | Decision |
|---|---|---|
| A-01 | Logger identity | Physical `LGR-` device + `LOG-<shipment>-NN` assignment |
| A-02 | Excursion duration | Sample-and-hold, first OUT to next non-OUT |
| A-02b | Multiple excursions | Individual records, cumulative total vs allowance |
| A-03 | Boundaries / uncertainty | At limit with u=0 is IN; +/-u band gives MARGINAL -> INDETERMINATE |
| A-04 | Acceptable gap | Policy `max_data_gap_minutes`, default 30 |
| A-05 | Route deviation | Missing/unexpected stop, wrong order, excess dwell |
| A-06 | Custody gap | Broken or incomplete chain of PICKUP/HANDOVER/DELIVERY |
| A-07 | Packaging compatibility | Range containment + duration; WARNING only |
| A-08 | Lots per shipment | 1..N lots, single product per shipment |
| A-09 | Policy version | Effective-dated, one per product per instant, snapshot on run |
| A-10 | Late readings | New run, old run kept |
