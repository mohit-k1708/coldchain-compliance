# Source manifest

- **All data is synthetic.** Every row is produced by `generator/` from a seeded pseudo-random generator (mulberry32) and fixed calendar dates; nothing is sampled from, copied from, or derived from a real dataset or a real system.
- **No external sources** were downloaded, scraped or imported at any stage.
- **No personal data.** Parties are invented company names (for example "Nordic Biologics", "FrostLine Logistics"); the `changed_by`, `reported_by` and analyst fields hold only the placeholders `system` and `legacy-system`. There are no names, emails, phone numbers, addresses or identifiers of real people.
- **No fields were discarded**: every column of every table in `database/schema.sql` is generated (nullable columns are NULL only where the scenario calls for it).
- **Public references** (general cold-chain practice for 2-8 C and frozen pharmaceutical transport, data-logger calibration uncertainty, and the usual shipment / custody / route entities) were used only as inspiration for the schema and the business rules in `docs/BUSINESS-RULES.md`; no text, tables or numbers were copied from them.
- Ground truth (`ground_truth.csv`) is produced by the injectors from the mutations they actually performed and is stored outside the application database.
