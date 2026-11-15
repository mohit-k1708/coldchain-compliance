# REST API

Express (the only added dependency: a small, mature HTTP router with JSON body parsing) on top of `node:sqlite`. `database/schema.sql` is the single DDL and is portable DDL; the API itself was only run against SQLite (PostgreSQL was not tested). The API never reads `ground_truth.*`.

```
npm run generate -- --seed=20261022 --shipments=5000 --loggers=1000
npm run evaluate
npm run db:build          # -> data/app.db (replaced on every build)
npm start                 # PORT (default 3001), DB_PATH (default data/app.db)
```

## Conventions
- JSON only, body limit 5 MB (413 `PAYLOAD_TOO_LARGE`). `page` >= 1, `pageSize` default 25 and capped at 200.
- All SQL is parameterized. Errors never include stack traces and always look like `{"error":{"code":"...","message":"..."}}`:

| status | codes |
|---|---|
| 400 | `VALIDATION_ERROR`, `INVALID_JSON`, `INVALID_ROLE`, `UNKNOWN_REFERENCE` (foreign key), `CONSTRAINT_VIOLATION`, `LOT_PRODUCT_MISMATCH`, `NOT_EVALUATED` |
| 403 | `FORBIDDEN` (role) |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` (unique), `ASSIGNMENT_OVERLAP`, `INVALID_TRANSITION`, `POLICY_OVERLAP`, `NO_EFFECTIVE_POLICY`, `NOT_EVALUATABLE` |
| 413 | `PAYLOAD_TOO_LARGE` |

## Roles (simulated, NO authentication)
The `x-role` header selects a role (default `analyst`; unknown value -> 400). Reads are open to every role. The permission table lives in `server/roles.js`:

| role | may |
|---|---|
| supplier | create parties, products, lots, policies |
| planner | create parties, shipments, packaging, loggers; assign loggers; add route stops; move shipment status |
| carrier | custody events, readings ingest, route stops (actual updates), shipment status |
| analyst | evaluate shipments; every exception transition |
| manager | read-only, plus the RESOLVED / ESCALATED decisions on exceptions |

## Read endpoints
| endpoint | returns |
|---|---|
| `GET /api/health` | `{ok, db:{shipment, temperature_reading, compliance_run}}` |
| `GET /api/dashboard` | totals, compliant / non_compliant / indeterminate, open exceptions, exceptions by status and severity, excursion runs, data gaps, counts by issue type, top reasons, per-product status breakdown |
| `GET /api/shipments?page&pageSize&status&shipmentStatus&productId&q&sort` | `{items,total,page,pageSize}`; `status` = compliance status, `q` = shipment id prefix, `sort` = `id`, `-id`, `departure`, `-departure`, `status`, `-status` |
| `GET /api/shipments/:id` | shipment, product, lots, packaging, applied policy and policy used, `runs` (all runs, current flagged), logger assignments with logger and calibrations, status history, route, custody, current run with findings (evidence ids capped at 50 + count), engine exceptions with history, legacy reports |
| `GET /api/shipments/:id/readings` | window readings with IN/OUT/MARGINAL, policy limits, class counts, excursion and gap periods (for charts) |
| `GET /api/shipments/:id/report?format=json\|md\|html` | the engine's traceable report (`engine/report.js`), built from a one-shipment slice of the DB (`server/loadSlice.js`) |
| `GET /api/evaluation` | contents of `docs/EVALUATION-REPORT.json` (primary + holdout metrics, ablation, naive summary, limitations); 404 JSON if the file is missing |
| `GET /api/exceptions?status&severity&issueType&shipmentId&source&page&pageSize` | engine exceptions by default (`source=ENGINE`) (rows include `evidence_count`) |
| `GET /api/exceptions/:id` | exception, history, evidence readings |

## Write endpoints (all in one transaction each)
| endpoint | role | notes |
|---|---|---|
| `POST /api/parties` `/products` `/policies` `/lots` `/packaging` `/loggers` | see roles | IDs from `generator/ids.js`, counters from the max existing ID. A new open-ended policy closes the previous one (exactly one policy effective at a time). A logger is created with its calibration row |
| `POST /api/shipments` | planner | `lots[]` (+ optional `packaging_id`); applies the policy effective at the planned departure; writes the first status-history row |
| `POST /api/shipments/:id/assign-logger` | planner | 409 `ASSIGNMENT_OVERLAP` if the logger is already assigned in the period (touching boundaries are allowed) |
| `POST /api/shipments/:id/custody-events` `/route-stops` | carrier / planner | sequence numbers assigned automatically for custody events |
| `POST /api/shipments/:id/status` | planner, carrier | PLANNED -> PACKED -> IN_TRANSIT -> DELIVERED (or CANCELLED from PLANNED/PACKED); history row each time; `departure_time` / `arrival_time` set on IN_TRANSIT / DELIVERED |
| `POST /api/readings/batch` | carrier | `{readings:[...]}` -> `{accepted, duplicates, rejected:[{index,reason}]}`. Validates grid, range, quality, logger, ids; `INSERT OR IGNORE` on reading id and (logger, recorded_at); a bad row never aborts the batch; re-posting changes nothing. Without `logger_assignment_id` the covering assignment is linked automatically |
| `POST /api/shipments/:id/evaluate` | analyst | runs the engine for one DELIVERED shipment. Same inputs -> same run (idempotent by fingerprint, `created:false`); changed inputs (for example a late reading) -> a NEW run, the old run is kept with `is_current=false`. Engine exceptions go through `reconcileExceptions` (no duplicates). Default as-of = max(last run's as-of, arrival, latest `received_at` inside the transit); `asOf` can be passed explicitly |
| `POST /api/exceptions/:id/transition` | analyst / manager | `{event_id, to_status, analyst?, note?, resolution?, occurred_at?}`; same `event_id` again -> 200 with no new history row; illegal transition 409; missing field 400 |

## Serving the UI
If `client/dist` exists (`npm run client:build`), `npm start` also serves it statically and returns `index.html` for every non-`/api` GET (SPA fallback). Unknown `/api/*` paths always return the JSON 404.
