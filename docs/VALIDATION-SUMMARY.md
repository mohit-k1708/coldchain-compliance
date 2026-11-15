# Validation summary

**Integrity: PASS**

## Generator configuration

| key | value |
|---|---|
| seed | 20261022 |
| shipments | 5000 |
| loggers | 1000 |
| mix | default |
| generator_version | 1.0.0 |

## Record counts

| table | rows |
|---|---:|
| party | 15 |
| product | 5 |
| lot | 10 |
| packaging | 3 |
| logger | 1000 |
| logger_calibration | 1000 |
| threshold_policy | 10 |
| shipment | 5000 |
| shipment_status_history | 20000 |
| shipment_lot | 7468 |
| shipment_packaging | 5000 |
| logger_assignment | 4942 |
| temperature_reading | 1196041 |
| custody_event | 17406 |
| route_stop | 17511 |
| compliance_run | 0 |
| compliance_finding | 0 |
| compliance_evidence | 0 |
| excursion_report | 835 |
| excursion_evidence | 4006 |
| exception_event | 0 |
| legacy_report | 4850 |

## Integrity checks (all expected 0)

- duplicate primary keys: 0
- missing references (invalid FKs, total): 0

### Invalid foreign keys per FK

| foreign key | invalid |
|---|---:|
| product.supplier_party_id->party.party_id | 0 |
| lot.product_id->product.product_id | 0 |
| logger_calibration.logger_id->logger.logger_id | 0 |
| threshold_policy.product_id->product.product_id | 0 |
| shipment.product_id->product.product_id | 0 |
| shipment.policy_id->threshold_policy.policy_id | 0 |
| shipment.origin_party_id->party.party_id | 0 |
| shipment.destination_party_id->party.party_id | 0 |
| shipment_status_history.shipment_id->shipment.shipment_id | 0 |
| shipment_lot.shipment_id->shipment.shipment_id | 0 |
| shipment_lot.lot_id->lot.lot_id | 0 |
| shipment_packaging.shipment_id->shipment.shipment_id | 0 |
| shipment_packaging.packaging_id->packaging.packaging_id | 0 |
| logger_assignment.logger_id->logger.logger_id | 0 |
| logger_assignment.shipment_id->shipment.shipment_id | 0 |
| temperature_reading.logger_id->logger.logger_id | 0 |
| temperature_reading.logger_assignment_id->logger_assignment.logger_assignment_id | 0 |
| custody_event.shipment_id->shipment.shipment_id | 0 |
| custody_event.from_party_id->party.party_id | 0 |
| custody_event.to_party_id->party.party_id | 0 |
| route_stop.shipment_id->shipment.shipment_id | 0 |
| compliance_run.shipment_id->shipment.shipment_id | 0 |
| compliance_run.policy_id->threshold_policy.policy_id | 0 |
| compliance_finding.compliance_run_id->compliance_run.compliance_run_id | 0 |
| compliance_evidence.finding_id->compliance_finding.finding_id | 0 |
| compliance_evidence.reading_id->temperature_reading.reading_id | 0 |
| excursion_report.shipment_id->shipment.shipment_id | 0 |
| excursion_report.logger_id->logger.logger_id | 0 |
| excursion_report.logger_assignment_id->logger_assignment.logger_assignment_id | 0 |
| excursion_report.policy_id->threshold_policy.policy_id | 0 |
| excursion_report.compliance_run_id->compliance_run.compliance_run_id | 0 |
| excursion_evidence.excursion_id->excursion_report.excursion_id | 0 |
| excursion_evidence.reading_id->temperature_reading.reading_id | 0 |
| exception_event.excursion_id->excursion_report.excursion_id | 0 |
| legacy_report.shipment_id->shipment.shipment_id | 0 |

### Invalid date orderings

| check | violations |
|---|---:|
| shipment.arrival_time<departure_time | 0 |
| shipment.planned_arrival<=planned_departure | 0 |
| logger_assignment.assigned_to<assigned_from | 0 |
| custody_event.recorded_at<event_timestamp | 0 |
| route_stop.planned_departure<planned_arrival | 0 |
| route_stop.actual_departure<actual_arrival | 0 |
| temperature_reading.received_at<recorded_at | 0 |
| excursion_report.end_time<start_time | 0 |

### Failed rules by name

| rule | failures |
|---|---:|
| PK_UNIQUE | 0 |
| FK_INTEGRITY | 0 |
| ENUM | 0 |
| ID_FORMAT | 0 |
| DATE_ORDER | 0 |
| READING_GRID | 0 |
| READING_DUP | 0 |
| READING_ID_REBUILD | 0 |
| EXCURSION_DURATION | 0 |

## Business observations vs ground truth (shipments; exact set match expected)

| observation | observed | ground truth | labels | match |
|---|---:|---:|---|---|
| assignmentOverlap | 0 | 0 | (none expected) | MATCH |
| noCoveringAssignment | 100 | 100 | LOGGER_NOT_ASSIGNED | MATCH |
| custodyDiscontinuity | 100 | 100 | CUSTODY_GAP | MATCH |
| routeMismatch | 100 | 100 | ROUTE_DEVIATION | MATCH |
| readingGap | 250 | 250 | MISSING_DATA + MISSING_DATA_SILENTLY_PASSED | MATCH |
| policyMismatch | 100 | 100 | POLICY_MISMATCH | MATCH |
| expiredCalibration | 50 | 50 | CALIBRATION_EXPIRED | MATCH |

Readings outside their assignment window (count of readings, expected for unassigned/truncated shipments): 17163

### Ground-truth label counts

| label | shipments |
|---|---:|
| BOUNDARY_AT_LIMIT | 100 |
| CALIBRATION_EXPIRED | 50 |
| CALIBRATION_MARGINAL | 100 |
| CROSS_SHIPMENT_EXCURSION | 50 |
| CUSTODY_GAP | 100 |
| EXCURSION_WITHIN_ALLOWANCE | 250 |
| LOGGER_NOT_ASSIGNED | 100 |
| MISSING_DATA | 150 |
| MISSING_DATA_SILENTLY_PASSED | 100 |
| NONE | 3400 |
| POLICY_MISMATCH | 100 |
| ROUTE_DEVIATION | 100 |
| TEMPERATURE_EXCURSION | 400 |

## sha256 per file

| file | sha256 |
|---|---|
| party.csv | `df77b6684f6c38849e67baa857235da0a2c1ba14f8fcc6c9221d67e84cdaf4bc` |
| product.csv | `bca0da0f3e1551cd0d7d39430962780be9fd385aab9f78ab14dcf8693c668bb2` |
| lot.csv | `c796d6a1f0e34e4e6735aa782e84b82414f55d813a6f165ee0dc2c8e2c8c396b` |
| packaging.csv | `b7784067ac7fd690ef1fe57e0951fc08329b8b6d4fac3b833b2204f7f8f70642` |
| logger.csv | `4adfac729813b2f5c81122a83a70ab3d03fbfc987b6fd8601e72375dbb15e043` |
| logger_calibration.csv | `d869b1d9f564e2be0ab23b63d45c1db469a4d2644cfa6fa567e4d296b5858a72` |
| threshold_policy.csv | `d63736f089b44814a310824106208885bbf6ef8e61f6a265cff36e817ec7f9d1` |
| shipment.csv | `30a97e4846da8bf66dffa3f95361fa847362ac2fc4c018cae5fda69ae8cbca47` |
| shipment_status_history.csv | `5f7c5d50742b691c391326ca57faa1323a83af3c21cdcf164e78475b205479dd` |
| shipment_lot.csv | `35dc880d82fb1bd7654f7b19434832098553b3d2ea0e09f94007daf0c51e5fa9` |
| shipment_packaging.csv | `e7c609ac4e66b843e70c975e4a09a569b45a2d55aaa9ff070276d0d4509325b1` |
| logger_assignment.csv | `2c08997fd44e44c0344ac4dc68a93643fbc7a6b8990117733e974dc5c27328b0` |
| temperature_reading.csv | `bfecd575dbd5ffec0cec59a08a83f5bfe7ad2fbbae52deb7547566772d3062e5` |
| custody_event.csv | `b1481ee5b3100260817f5bcd4f4654c0e2a67c56bc069612b058643bc1f98a38` |
| route_stop.csv | `98545cf18580d7ec8333bf5598fc323304d107a35b7a0185867d7b226ae2dba0` |
| compliance_run.csv | `5958abfc9c70f6aaf7aa1c9a5f36b2fdc9f5db147ef5ccae6fcbf83e190b1e29` |
| compliance_finding.csv | `557051083adfa1296159ef47656bd87cf0d80afb7a0daff058b61a807e3113e6` |
| compliance_evidence.csv | `79fdf67b45562625868da7f0ae8be24eea9bfc8f589f06e819b18781f70fdce9` |
| excursion_report.csv | `ffe54d46c44bb042574670860268cbd1d30746e0570735df30c983151d1f5ab9` |
| excursion_evidence.csv | `a022878706a64a064634ea5b5fd9feee1816946982c2b38cf193ebc18a7bbf3b` |
| exception_event.csv | `f7f2933d0ef9a6016d69e2540d78d2b9b68e2d6a96c3b4fca6a98f52023227dd` |
| legacy_report.csv | `17d8dfd8ce0846bf44dbbe5d9a6c39f78c5c2989eb3a1d054cd4311a40ad6fa0` |
| ground_truth.csv | `b981f34a06bf6000fba3d3a39ac46422494e5fa4c167be476e1d213be89844bf` |

**Integrity: PASS**
