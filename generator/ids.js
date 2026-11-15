// Pure ID formatters.
import { iso } from './time.js';

const pad = (n, w = 6) => String(n).padStart(w, '0');

export const lotId = (n) => `LOT-2026-${pad(n)}`;
export const shipmentId = (n) => `SHP-2026-${pad(n)}`;
export const assignmentId = (shipId, nn) => `LOG-${shipId}-${pad(nn, 2)}`;
// ms epoch -> YYYYMMDDThhmmssZ (UTC)
export const readingId = (loggerId, ms) => `TEMP-${loggerId}-${iso(ms).replace(/[-:]/g, '')}`;
export const excursionId = (n) => `EXCR-2026-${pad(n)}`;
export const productId = (n) => `PRD-${pad(n)}`;
export const packagingId = (n) => `PKG-${pad(n)}`;
export const loggerId = (n) => `LGR-${pad(n)}`;
export const policyId = (n) => `POL-${pad(n)}`;
export const custodyId = (n) => `CUS-2026-${pad(n)}`;
export const routeStopId = (n) => `RST-2026-${pad(n)}`;
export const partyId = (n) => `PTY-${pad(n)}`;
export const runId = (n) => `RUN-2026-${pad(n)}`;
// Not specified by the brief; assumed formats.
export const calibrationId = (n) => `CAL-${pad(n)}`;
export const historyId = (n) => `HST-2026-${pad(n)}`;
export const legacyReportId = (n) => `LEG-2026-${pad(n)}`;
