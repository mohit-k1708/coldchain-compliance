# Reproducibility

**Result: PASS**

The generator was run twice in separate Node processes (default Node flags) into two temporary directories; row counts and sha256 of every file (including `ground_truth.csv`) were compared. Checksums were recomputed from the files on disk and also compared with each run's `manifest.json`.

## Inputs

```
node generator/index.js --seed=20261022 --shipments=5000 --loggers=1000 --mix=default --out=<tmp>
```

Manifests identical: true

## Timings

- run 1: 21605 ms
- run 2: 16810 ms

## Checksums (run 1 / run 2)

| file | rows 1 | rows 2 | sha256 run 1 | sha256 run 2 | match |
|---|---:|---:|---|---|---|
| compliance_evidence.csv | 0 | 0 | `79fdf67b45562625868da7f0ae8be24eea9bfc8f589f06e819b18781f70fdce9` | `79fdf67b45562625868da7f0ae8be24eea9bfc8f589f06e819b18781f70fdce9` | yes |
| compliance_finding.csv | 0 | 0 | `557051083adfa1296159ef47656bd87cf0d80afb7a0daff058b61a807e3113e6` | `557051083adfa1296159ef47656bd87cf0d80afb7a0daff058b61a807e3113e6` | yes |
| compliance_run.csv | 0 | 0 | `5958abfc9c70f6aaf7aa1c9a5f36b2fdc9f5db147ef5ccae6fcbf83e190b1e29` | `5958abfc9c70f6aaf7aa1c9a5f36b2fdc9f5db147ef5ccae6fcbf83e190b1e29` | yes |
| custody_event.csv | 17406 | 17406 | `b1481ee5b3100260817f5bcd4f4654c0e2a67c56bc069612b058643bc1f98a38` | `b1481ee5b3100260817f5bcd4f4654c0e2a67c56bc069612b058643bc1f98a38` | yes |
| exception_event.csv | 0 | 0 | `f7f2933d0ef9a6016d69e2540d78d2b9b68e2d6a96c3b4fca6a98f52023227dd` | `f7f2933d0ef9a6016d69e2540d78d2b9b68e2d6a96c3b4fca6a98f52023227dd` | yes |
| excursion_evidence.csv | 4006 | 4006 | `a022878706a64a064634ea5b5fd9feee1816946982c2b38cf193ebc18a7bbf3b` | `a022878706a64a064634ea5b5fd9feee1816946982c2b38cf193ebc18a7bbf3b` | yes |
| excursion_report.csv | 835 | 835 | `ffe54d46c44bb042574670860268cbd1d30746e0570735df30c983151d1f5ab9` | `ffe54d46c44bb042574670860268cbd1d30746e0570735df30c983151d1f5ab9` | yes |
| ground_truth.csv | 5000 | 5000 | `b981f34a06bf6000fba3d3a39ac46422494e5fa4c167be476e1d213be89844bf` | `b981f34a06bf6000fba3d3a39ac46422494e5fa4c167be476e1d213be89844bf` | yes |
| legacy_report.csv | 4850 | 4850 | `17d8dfd8ce0846bf44dbbe5d9a6c39f78c5c2989eb3a1d054cd4311a40ad6fa0` | `17d8dfd8ce0846bf44dbbe5d9a6c39f78c5c2989eb3a1d054cd4311a40ad6fa0` | yes |
| logger.csv | 1000 | 1000 | `4adfac729813b2f5c81122a83a70ab3d03fbfc987b6fd8601e72375dbb15e043` | `4adfac729813b2f5c81122a83a70ab3d03fbfc987b6fd8601e72375dbb15e043` | yes |
| logger_assignment.csv | 4942 | 4942 | `2c08997fd44e44c0344ac4dc68a93643fbc7a6b8990117733e974dc5c27328b0` | `2c08997fd44e44c0344ac4dc68a93643fbc7a6b8990117733e974dc5c27328b0` | yes |
| logger_calibration.csv | 1000 | 1000 | `d869b1d9f564e2be0ab23b63d45c1db469a4d2644cfa6fa567e4d296b5858a72` | `d869b1d9f564e2be0ab23b63d45c1db469a4d2644cfa6fa567e4d296b5858a72` | yes |
| lot.csv | 10 | 10 | `c796d6a1f0e34e4e6735aa782e84b82414f55d813a6f165ee0dc2c8e2c8c396b` | `c796d6a1f0e34e4e6735aa782e84b82414f55d813a6f165ee0dc2c8e2c8c396b` | yes |
| packaging.csv | 3 | 3 | `b7784067ac7fd690ef1fe57e0951fc08329b8b6d4fac3b833b2204f7f8f70642` | `b7784067ac7fd690ef1fe57e0951fc08329b8b6d4fac3b833b2204f7f8f70642` | yes |
| party.csv | 15 | 15 | `df77b6684f6c38849e67baa857235da0a2c1ba14f8fcc6c9221d67e84cdaf4bc` | `df77b6684f6c38849e67baa857235da0a2c1ba14f8fcc6c9221d67e84cdaf4bc` | yes |
| product.csv | 5 | 5 | `bca0da0f3e1551cd0d7d39430962780be9fd385aab9f78ab14dcf8693c668bb2` | `bca0da0f3e1551cd0d7d39430962780be9fd385aab9f78ab14dcf8693c668bb2` | yes |
| route_stop.csv | 17511 | 17511 | `98545cf18580d7ec8333bf5598fc323304d107a35b7a0185867d7b226ae2dba0` | `98545cf18580d7ec8333bf5598fc323304d107a35b7a0185867d7b226ae2dba0` | yes |
| shipment.csv | 5000 | 5000 | `30a97e4846da8bf66dffa3f95361fa847362ac2fc4c018cae5fda69ae8cbca47` | `30a97e4846da8bf66dffa3f95361fa847362ac2fc4c018cae5fda69ae8cbca47` | yes |
| shipment_lot.csv | 7468 | 7468 | `35dc880d82fb1bd7654f7b19434832098553b3d2ea0e09f94007daf0c51e5fa9` | `35dc880d82fb1bd7654f7b19434832098553b3d2ea0e09f94007daf0c51e5fa9` | yes |
| shipment_packaging.csv | 5000 | 5000 | `e7c609ac4e66b843e70c975e4a09a569b45a2d55aaa9ff070276d0d4509325b1` | `e7c609ac4e66b843e70c975e4a09a569b45a2d55aaa9ff070276d0d4509325b1` | yes |
| shipment_status_history.csv | 20000 | 20000 | `5f7c5d50742b691c391326ca57faa1323a83af3c21cdcf164e78475b205479dd` | `5f7c5d50742b691c391326ca57faa1323a83af3c21cdcf164e78475b205479dd` | yes |
| temperature_reading.csv | 1196041 | 1196041 | `bfecd575dbd5ffec0cec59a08a83f5bfe7ad2fbbae52deb7547566772d3062e5` | `bfecd575dbd5ffec0cec59a08a83f5bfe7ad2fbbae52deb7547566772d3062e5` | yes |
| threshold_policy.csv | 10 | 10 | `d63736f089b44814a310824106208885bbf6ef8e61f6a265cff36e817ec7f9d1` | `d63736f089b44814a310824106208885bbf6ef8e61f6a265cff36e817ec7f9d1` | yes |
