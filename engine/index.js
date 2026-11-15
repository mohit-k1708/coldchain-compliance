import { createHash } from 'node:crypto';
import { buildIndexes } from './indexes.js';
import { calculateShipmentCompliance, ENGINE_VERSION } from './compliance.js';
import { ms } from './time.js';

export { ENGINE_VERSION };
export const DEFAULT_AS_OF = '2026-11-01T00:00:00Z';
const pad = (n, w) => String(n).padStart(w, '0');

function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

// Pure evaluation of one shipment: returns an un-numbered draft (no run/finding IDs yet).
export function evaluateShipment(idx, shipment, { asOf = DEFAULT_AS_OF } = {}) {
  const asOfMs = ms(asOf);
  const res = calculateShipmentCompliance(idx, shipment, { asOfMs });
  const fingerprint = createHash('sha256').update(canonical({ inputs: res.inputs, engine_version: ENGINE_VERSION, as_of: asOf })).digest('hex');
  return { shipment, asOf, fingerprint, ...res };
}

// Turns a draft into rows. runNo/excNo: first free numbers; returns rows and the next free excursion number.
export function materialize(draft, runNo, excNo) {
  const run_id = `RUN-2026-${pad(runNo, 6)}`;
  const p = draft.policy;
  const run = {
    compliance_run_id: run_id, shipment_id: draft.shipment.shipment_id, policy_id: p ? p.policy_id : draft.shipment.policy_id,
    policy_version: p ? p.policy_version : 0, policy_min_temp_c: p ? p.min_temp_c : 0, policy_max_temp_c: p ? p.max_temp_c : 0,
    policy_max_excursion_minutes: p ? p.max_excursion_minutes : 0, policy_max_data_gap_minutes: p ? p.max_data_gap_minutes : 0,
    compliance_status: draft.status, reason_summary: draft.reason_summary, engine_version: ENGINE_VERSION,
    input_fingerprint: draft.fingerprint, run_at: draft.asOf, is_current: true,
  };
  const findings = [], evidence = [];
  draft.findings.forEach((f, i) => {
    const finding_id = `FND-${pad(runNo, 6)}-${pad(i + 1, 2)}`;
    findings.push({ finding_id, compliance_run_id: run_id, rule_code: f.rule_code, result: f.result, detail: f.detail,
      detail_json: JSON.stringify({ ...(f.detail_json ?? {}), ...(f.issue_type ? { issue_type: f.issue_type } : {}), ...(f.severity ? { severity: f.severity } : {}) }) });
    for (const rid of f.reading_ids) evidence.push({ finding_id, reading_id: rid });
  });
  const excursions = [], excursionEvidence = [];
  const findingByRule = new Map(draft.findings.map((f, i) => [f.rule_code, `FND-${pad(runNo, 6)}-${pad(i + 1, 2)}`]));
  for (const x of draft.excursions) {
    const excursion_id = `EXCR-2026-${pad(excNo++, 6)}`;
    excursions.push({
      excursion_id, shipment_id: draft.shipment.shipment_id, logger_id: x.logger_id, logger_assignment_id: x.logger_assignment_id,
      policy_id: run.policy_id, compliance_run_id: run_id, source: 'ENGINE', issue_type: x.issue_type, start_time: x.start_time,
      end_time: x.end_time, duration_minutes: x.duration_minutes, peak_temperature_c: x.peak_temperature_c, severity: x.severity,
      status: 'OPEN', detected_at: draft.asOf, assigned_analyst: null, resolution: null, resolved_at: null,
      evidence_reference: findingByRule.get(x.rule_code) ?? null,
    });
    for (const rid of new Set(x.reading_ids)) excursionEvidence.push({ excursion_id, reading_id: rid });
  }
  return { run, findings, evidence, excursions, excursionEvidence, nextExcNo: excNo };
}

const numOf = (id) => Number(String(id).match(/(\d+)$/)?.[1] ?? 0);

// ds: plain table object. options: { asOf, existing } where existing = a previous evaluateAll result.
// Re-running with identical inputs adds nothing; changed inputs add a NEW run and supersede (never overwrite) the old one.
export function evaluateAll(ds, { asOf = DEFAULT_AS_OF, existing = null, readingStore = null } = {}) {
  const idx = buildIndexes(ds, { readingStore });
  const out = { runs: [], findings: [], evidence: [], excursions: [], excursionEvidence: [], supersededRunIds: [] };
  const known = new Map((existing?.runs ?? []).map((r) => [`${r.shipment_id}|${r.input_fingerprint}`, r]));
  const currentByShipment = new Map();
  for (const r of existing?.runs ?? []) if (r.is_current) currentByShipment.set(r.shipment_id, r);
  let runNo = Math.max(0, ...(existing?.runs ?? []).map((r) => numOf(r.compliance_run_id))) + 1;
  let excNo = Math.max(0, ...(ds.excursion_report ?? []).map((x) => numOf(x.excursion_id)), ...(existing?.excursions ?? []).map((x) => numOf(x.excursion_id))) + 1;
  const shipments = idx.shipments.filter((s) => s.shipment_status === 'DELIVERED').sort((a, b) => (a.shipment_id < b.shipment_id ? -1 : 1));
  for (const s of shipments) {
    const draft = evaluateShipment(idx, s, { asOf });
    if (known.has(`${s.shipment_id}|${draft.fingerprint}`)) continue;
    const m = materialize(draft, runNo++, excNo);
    excNo = m.nextExcNo;
    const prev = currentByShipment.get(s.shipment_id);
    if (prev) out.supersededRunIds.push(prev.compliance_run_id);
    out.runs.push(m.run);
    out.findings.push(...m.findings);
    out.evidence.push(...m.evidence);
    out.excursions.push(...m.excursions);
    out.excursionEvidence.push(...m.excursionEvidence);
  }
  return out;
}
