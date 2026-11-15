// Traceable per-shipment compliance report. Evaluates one shipment on the fly and explains every conclusion.
import { buildIndexes } from './indexes.js';
import { evaluateShipment, DEFAULT_AS_OF, ENGINE_VERSION } from './index.js';
import { classifyReading } from './evaluators/temperature.js';
import { ms, MIN } from './time.js';

export const RULE_NAMES = {
  'R-WIN-01': 'Evaluation window', 'R-TEMP-00': 'Readings trusted (evidence gate)', 'R-TEMP-03': 'Confirmed excursion vs allowance',
  'R-TEMP-04': 'Calibration uncertainty (marginal readings)', 'R-GAP-01': 'Missing data / gaps', 'R-LOG-01': 'Logger exists',
  'R-LOG-02': 'Logger assignment covers transit', 'R-LOG-03': 'Calibration valid', 'R-LOG-04': 'No overlapping assignments',
  'R-LOG-05': 'Reading/assignment references agree', 'R-POL-01': 'Correct policy applied', 'R-LOT-01': 'Lots present and consistent',
  'R-PKG-01': 'Packaging qualification', 'R-ROUTE-01': 'Planned stops reached', 'R-ROUTE-02': 'No unplanned stops',
  'R-ROUTE-03': 'Stop sequence', 'R-ROUTE-04': 'Dwell time', 'R-ROUTE-05': 'Route evidence present', 'R-CUS-01': 'Custody chain continuous',
  'R-CUS-02': 'Custody timestamps', 'R-ISO-01': 'Shipment isolation (legacy reports)', 'R-SILENT-01': 'Legacy PASS vs engine decision',
  LEGACY_DURATION_MISMATCH: 'Legacy duration vs recomputed run',
};
export const METHOD_NOTE = 'Only 10-minute samples exist. Excursion start and end are therefore inferred by sample-and-hold (start = first out-of-range sample; end = the next in-range sample, or last out-of-range sample + sampling interval, capped at arrival); the exact physical times are unknown.';
const EVIDENCE_CAP = 200;

const dwell = (s) => (s.actual_arrival && s.actual_departure ? (ms(s.actual_departure) - ms(s.actual_arrival)) / MIN : null);
const num = (x, d = 2) => (x === null || x === undefined ? '' : Number(x).toFixed(d));

export function buildReport(tables, shipmentId, { asOf = DEFAULT_AS_OF, readingStore = null, priorRuns = null } = {}) {
  const idx = buildIndexes(tables, { readingStore });
  const shipment = idx.shipments.find((s) => s.shipment_id === shipmentId);
  if (!shipment) throw new Error(`shipment ${shipmentId} not found`);
  if (shipment.shipment_status !== 'DELIVERED') throw new Error(`shipment ${shipmentId} is ${shipment.shipment_status}; only DELIVERED shipments are evaluated`);
  const draft = evaluateShipment(idx, shipment, { asOf });
  const ctx = draft.context;
  const delivered = idx.shipments.filter((s) => s.shipment_status === 'DELIVERED').map((s) => s.shipment_id).sort();
  const runNo = delivered.indexOf(shipmentId) + 1; // same numbering evaluateAll uses on a first run
  const policy = draft.policy;
  const party = (id) => (tables.party ?? []).find((p) => p.party_id === id);
  const finding = (code) => draft.findings.find((f) => f.rule_code === code);
  const used = ctx.used;

  // --- context
  const lots = (idx.lotsByShipment.get(shipmentId) ?? []).map((sl) => ({ ...(idx.lotById.get(sl.lot_id) ?? { lot_id: sl.lot_id }), quantity_units: sl.quantity_units }));
  const packaging = (idx.packagingByShipment.get(shipmentId) ?? []).map((sp) => ({ packaging_id: sp.packaging_id, ...(sp.profile ?? {}), assigned_from: sp.assigned_from, assigned_to: sp.assigned_to }));
  const loggers = ctx.assignments.map((a) => ({ assignment: a, logger: idx.loggerById.get(a.logger_id) ?? { logger_id: a.logger_id }, calibrations: idx.calibrationsByLogger.get(a.logger_id) ?? [] }));
  const context = {
    product: ctx.product, lots, packaging, loggers,
    origin: { location: shipment.origin_location, party: party(shipment.origin_party_id)?.party_name ?? shipment.origin_party_id, party_id: shipment.origin_party_id },
    destination: { location: shipment.destination_location, party: party(shipment.destination_party_id)?.party_name ?? shipment.destination_party_id, party_id: shipment.destination_party_id },
    planned_departure: shipment.planned_departure, planned_arrival: shipment.planned_arrival, departure: shipment.departure_time, arrival: shipment.arrival_time,
  };

  // --- policy
  const pdesc = (p) => (p ? { policy_id: p.policy_id, version: p.policy_version, min: p.min_temp_c, max: p.max_temp_c, allowed_excursion_minutes: p.max_excursion_minutes,
    gap_limit_minutes: p.max_data_gap_minutes, dwell_limit_minutes: p.max_dwell_minutes, sampling_interval_minutes: p.sampling_interval_minutes,
    effective_from: p.effective_from, effective_to: p.effective_to } : null);
  const policySec = { used: pdesc(policy), applied: pdesc(ctx.applied), correct: pdesc(ctx.correct), same: !!ctx.applied && !!ctx.correct && ctx.applied.policy_id === ctx.correct.policy_id };

  // --- trace
  const trace = draft.findings.map((f) => ({ rule_code: f.rule_code, name: RULE_NAMES[f.rule_code] ?? f.rule_code, result: f.result, detail: f.detail, evidence_readings: f.reading_ids.length }));

  // --- temperature
  let temperature;
  const A = policy.max_excursion_minutes;
  if (ctx.temp) {
    const t = ctx.temp;
    const temps = used.map((r) => r.temperature_c);
    const expected = Math.floor((ctx.arrMs - ctx.depMs) / (policy.sampling_interval_minutes * MIN)) + 1;
    const counts = { IN: 0, OUT: 0, MARGINAL: 0 };
    for (const r of used) counts[classifyReading(r, policy)]++;
    const runs = t.confirmed.map((r) => ({ start: r.start_time, end: r.end_time, duration_minutes: r.duration_minutes, peak_temperature_c: r.peak_temperature_c,
      readings: r.reading_ids.length, first_reading_id: r.reading_ids[0], last_reading_id: r.reading_ids.at(-1), direction: r.issue_type }));
    const total = t.confirmed_out_minutes;
    temperature = {
      evaluated: true, min: temps.length ? Math.min(...temps) : null, max: temps.length ? Math.max(...temps) : null,
      mean: temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null,
      expected_samples: expected, received_samples: used.length, coverage_pct: Math.min(100, (used.length / expected) * 100), class_counts: counts, runs,
      arithmetic: `Confirmed out-of-range: ${runs.length ? runs.map((r) => r.duration_minutes).join(' + ') : '0'} = ${total} min ${total > A ? '>' : '<='} ${A} min allowed`,
      possible_line: t.possible_out_minutes > total ? `Possible out-of-range (marginal readings counted as out): ${t.possible_out_minutes} min ${t.possible_out_minutes > A ? '>' : '<='} ${A} min allowed` : null,
      method_note: METHOD_NOTE,
    };
  } else temperature = { evaluated: false, reason: finding('R-TEMP-00')?.detail ?? 'not evaluated', method_note: METHOD_NOTE };

  // --- gaps
  const g = finding('R-GAP-01');
  const gaps = g ? { evaluated: true, rows: (g.detail_json.gaps ?? []).map((x) => ({ from: x.from, to: x.to, minutes: x.minutes, missing_samples: x.missing_samples.length, from_reading_id: x.from_reading_id, to_reading_id: x.to_reading_id })),
    missing_sample_count: g.detail_json.missing_sample_count ?? 0, gap_limit_minutes: policy.max_data_gap_minutes } : { evaluated: false, rows: [], missing_sample_count: 0 };

  // --- route
  const stops = [...(idx.stopsByShipment.get(shipmentId) ?? [])].sort((a, b) => (a.stop_sequence ?? 1e9) - (b.stop_sequence ?? 1e9) || ms(a.actual_arrival ?? a.planned_arrival) - ms(b.actual_arrival ?? b.planned_arrival));
  const ids = (code, key = 'stops') => new Set(finding(code)?.detail_json?.[key] ?? []);
  const miss = ids('R-ROUTE-01'), extra = ids('R-ROUTE-02'), over = ids('R-ROUTE-04');
  const r3 = finding('R-ROUTE-03');
  const seqBad = new Set();
  if (r3 && r3.result === 'FAIL') r3.detail_json.planned.forEach((id, i) => { if (r3.detail_json.actual[i] !== id) { seqBad.add(id); seqBad.add(r3.detail_json.actual[i]); } });
  const route = stops.map((s) => ({
    stop_sequence: s.stop_sequence, actual_sequence: s.actual_sequence, stop_type: s.stop_type, location: s.location, planned_arrival: s.planned_arrival, planned_departure: s.planned_departure,
    actual_arrival: s.actual_arrival, actual_departure: s.actual_departure, dwell_minutes: dwell(s),
    flags: [miss.has(s.route_stop_id) && 'MISSING_STOP', extra.has(s.route_stop_id) && 'UNEXPECTED_STOP', seqBad.has(s.route_stop_id) && 'SEQUENCE', over.has(s.route_stop_id) && 'EXCESS_DWELL'].filter(Boolean),
  }));

  // --- custody
  const ev = [...(idx.custodyByShipment.get(shipmentId) ?? [])].sort((a, b) => a.event_sequence - b.event_sequence);
  const pn = (id) => (id === null || id === undefined ? '(null)' : `${party(id)?.party_name ?? id} (${id})`);
  const custody = ev.map((e, i) => {
    const flags = [];
    if (i === 0 && !(e.event_type === 'PICKUP' && e.from_party_id === shipment.origin_party_id)) flags.push('NOT A PICKUP FROM THE ORIGIN PARTY');
    if (i === ev.length - 1 && !(e.event_type === 'DELIVERY' && e.to_party_id === shipment.destination_party_id)) flags.push('NOT A DELIVERY TO THE DESTINATION PARTY');
    if (!e.from_party_id || !e.to_party_id) flags.push('NULL PARTY');
    if (i > 0 && ev[i - 1].to_party_id !== e.from_party_id) flags.push(`BREAK: previous event handed to ${pn(ev[i - 1].to_party_id)}`);
    return { event_sequence: e.event_sequence, from: pn(e.from_party_id), to: pn(e.to_party_id), event_type: e.event_type, event_timestamp: e.event_timestamp, recorded_at: e.recorded_at, continuity: flags.length ? flags.join('; ') : 'OK' };
  });

  // --- evidence appendix
  const byId = new Map(used.map((r) => [r.reading_id, r]));
  const cited = [...new Set(draft.findings.flatMap((f) => f.reading_ids))].map((id) => byId.get(id)).filter(Boolean).sort((a, b) => a.t - b.t);
  const lg = ctx.assignments[0]?.logger_id;
  const evidence = {
    total: cited.length,
    rows: cited.slice(0, EVIDENCE_CAP).map((r) => ({ reading_id: r.reading_id, recorded_at: r.row.recorded_at, temperature_c: r.temperature_c, uncertainty_c: r.calibration_uncertainty_c, class: classifyReading(r, policy) })),
    capped: cited.length > EVIDENCE_CAP,
    query: lg ? `temperature_reading.csv: logger_id = ${lg} AND recorded_at BETWEEN ${shipment.departure_time} AND ${shipment.arrival_time}` : null,
  };

  // --- history
  const prior = (priorRuns ?? tables.compliance_run ?? []).filter((r) => r.shipment_id === shipmentId && r.input_fingerprint !== draft.fingerprint)
    .map((r) => ({ run_id: r.compliance_run_id, as_of: r.run_at, status: r.compliance_status, fingerprint: r.input_fingerprint }));
  const excIds = new Set((tables.excursion_report ?? []).filter((x) => x.shipment_id === shipmentId && x.source === 'ENGINE').map((x) => x.excursion_id));
  const exceptions = (tables.exception_event ?? []).filter((e) => excIds.has(e.excursion_id)).map((e) => ({ excursion_id: e.excursion_id, from_status: e.from_status, to_status: e.to_status, analyst: e.analyst, note: e.note, occurred_at: e.occurred_at }));

  return {
    header: { shipment_id: shipmentId, status: draft.status, reason_summary: draft.reason_summary, root_rule: (draft.reason_summary.match(/\[([^\]]+)\]/) ?? [])[1], run_id: `RUN-2026-${String(runNo).padStart(6, '0')}`,
      as_of: asOf, engine_version: ENGINE_VERSION, fingerprint: draft.fingerprint },
    context, policy: policySec, trace, temperature, gaps, route, custody, evidence, history: { earlier_runs: prior, exceptions },
  };
}

// ---- rendering: one block list -> markdown or HTML -------------------------------------------------------------
const f = (x) => (x === null || x === undefined || x === '' ? '-' : String(x));

export function toBlocks(r) {
  const B = [];
  const h = r.header, c = r.context, p = r.policy, t = r.temperature;
  B.push({ t: 'h1', text: `Compliance report: ${h.shipment_id}` });
  B.push({ t: 'badge', status: h.status });
  B.push({ t: 'p', text: h.reason_summary });
  B.push({ t: 'kv', pairs: [['Run', h.run_id], ['As of', h.as_of], ['Engine version', h.engine_version], ['Input fingerprint', h.fingerprint]] });

  B.push({ t: 'h2', text: '2. Context' });
  B.push({ t: 'kv', pairs: [['Product', c.product ? `${c.product.product_name} (${c.product.product_id}, ${c.product.category})` : '-'],
    ['Origin', `${c.origin.location}, ${c.origin.party}`], ['Destination', `${c.destination.location}, ${c.destination.party}`],
    ['Departure (planned / actual)', `${c.planned_departure} / ${c.departure}`], ['Arrival (planned / actual)', `${c.planned_arrival} / ${c.arrival}`]] });
  B.push({ t: 'table', title: 'Lots', head: ['lot', 'manufactured', 'expires', 'status', 'units'], rows: c.lots.map((l) => [l.lot_id, f(l.manufacturing_date), f(l.expiry_date), f(l.lot_status), f(l.quantity_units)]) });
  B.push({ t: 'table', title: 'Packaging', head: ['packaging', 'type', 'supported range (C)', 'qualified hours'], rows: c.packaging.map((k) => [k.packaging_id, f(k.packaging_type), `${f(k.min_supported_temp_c)} to ${f(k.max_supported_temp_c)}`, f(k.qualified_duration_hours)]) });
  B.push({ t: 'table', title: 'Logger, assignment and calibration', head: ['logger', 'serial', 'assignment', 'window', 'calibration (on / expires / uncertainty C)'],
    rows: c.loggers.map((l) => [l.logger.logger_id, f(l.logger.device_serial_number), l.assignment.logger_assignment_id, `${l.assignment.assigned_from} .. ${f(l.assignment.assigned_to)}`,
      l.calibrations.map((k) => `${k.calibrated_on} / ${k.expires_on} / ${k.uncertainty_c}`).join('; ') || '-']) });
  if (!c.loggers.length) B.push({ t: 'p', text: 'No logger assignment exists for this shipment.' });

  B.push({ t: 'h2', text: '3. Policy' });
  const pu = p.used;
  B.push({ t: 'kv', pairs: pu ? [['Policy used for evaluation', `${pu.policy_id} v${pu.version}`], ['Limits', `${num(pu.min)} to ${num(pu.max)} C`], ['Allowed excursion', `${pu.allowed_excursion_minutes} min`],
    ['Gap limit', `${pu.gap_limit_minutes} min`], ['Dwell limit', `${pu.dwell_limit_minutes} min`], ['Effective', `${pu.effective_from} .. ${f(pu.effective_to)}`],
    ['Applied on the shipment', p.applied ? `${p.applied.policy_id} v${p.applied.version}` : 'none'], ['Correct for the product at departure', p.correct ? `${p.correct.policy_id} v${p.correct.version}` : 'none'],
    ['Applied equals correct', p.same ? 'yes' : 'NO (see R-POL-01)']] : [['Policy', 'none found']] });

  B.push({ t: 'h2', text: '4. Decision trace' });
  B.push({ t: 'table', head: ['rule', 'name', 'result', 'detail', 'evidence readings'], rows: r.trace.map((x) => [x.rule_code, x.name, x.result, x.detail, x.evidence_readings]) });

  B.push({ t: 'h2', text: '5. Temperature' });
  if (t.evaluated) {
    B.push({ t: 'kv', pairs: [['Min / mean / max', `${num(t.min)} / ${num(t.mean)} / ${num(t.max)} C`], ['Readings expected / received', `${t.expected_samples} / ${t.received_samples} (${t.coverage_pct.toFixed(1)}% coverage)`],
      ['Reading classes', `IN ${t.class_counts.IN}, OUT ${t.class_counts.OUT}, MARGINAL ${t.class_counts.MARGINAL}`]] });
    B.push({ t: 'table', title: 'Excursions', head: ['start', 'end', 'minutes', 'peak C', 'OUT readings', 'first reading', 'last reading'],
      rows: t.runs.map((x) => [x.start, x.end, x.duration_minutes, num(x.peak_temperature_c), x.readings, x.first_reading_id, x.last_reading_id]) });
    if (!t.runs.length) B.push({ t: 'p', text: 'No confirmed out-of-range readings.' });
    B.push({ t: 'p', text: t.arithmetic });
    if (t.possible_line) B.push({ t: 'p', text: t.possible_line });
  } else B.push({ t: 'p', text: `Temperature was not evaluated. ${t.reason}` });
  B.push({ t: 'p', text: t.method_note });

  B.push({ t: 'h2', text: '6. Data gaps' });
  if (r.gaps.evaluated) {
    B.push({ t: 'table', head: ['from', 'to', 'minutes', 'missing samples'], rows: r.gaps.rows.map((x) => [x.from, x.to, x.minutes, x.missing_samples]) });
    B.push({ t: 'p', text: `Total missing samples: ${r.gaps.missing_sample_count}; gap limit ${r.gaps.gap_limit_minutes} min. During a gap nothing is known about the product temperature; gap time is never counted as in range.` });
  } else B.push({ t: 'p', text: 'Not evaluated (readings untrusted).' });

  B.push({ t: 'h2', text: '7. Route and custody' });
  B.push({ t: 'table', title: 'Route', head: ['#', 'type', 'location', 'planned arrival', 'planned departure', 'actual arrival', 'actual departure', 'dwell min', 'flags'],
    rows: r.route.map((x) => [f(x.stop_sequence), x.stop_type, x.location, f(x.planned_arrival), f(x.planned_departure), f(x.actual_arrival), f(x.actual_departure), f(x.dwell_minutes), x.flags.join(', ') || 'OK']) });
  B.push({ t: 'table', title: 'Custody chain', head: ['seq', 'from', 'to', 'type', 'event time', 'recorded', 'continuity'],
    rows: r.custody.map((x) => [x.event_sequence, x.from, x.to, x.event_type, x.event_timestamp, x.recorded_at, x.continuity]) });

  B.push({ t: 'h2', text: '8. Evidence appendix' });
  B.push({ t: 'table', head: ['reading', 'recorded at', 'temperature C', 'uncertainty C', 'class'], rows: r.evidence.rows.map((x) => [x.reading_id, x.recorded_at, num(x.temperature_c), num(x.uncertainty_c), x.class]) });
  B.push({ t: 'p', text: r.evidence.capped ? `Showing ${r.evidence.rows.length} of ${r.evidence.total} cited readings. Full list: ${r.evidence.query}.` : `All ${r.evidence.total} cited readings are listed.` });

  B.push({ t: 'h2', text: '9. History' });
  B.push({ t: 'table', title: 'Earlier runs', head: ['run', 'as of', 'status', 'fingerprint'], rows: r.history.earlier_runs.map((x) => [x.run_id, x.as_of, x.status, x.fingerprint]) });
  if (!r.history.earlier_runs.length) B.push({ t: 'p', text: 'No earlier runs for this shipment.' });
  B.push({ t: 'table', title: 'Exception history', head: ['exception', 'from', 'to', 'analyst', 'note', 'at'], rows: r.history.exceptions.map((x) => [x.excursion_id, f(x.from_status), x.to_status, f(x.analyst), f(x.note), x.occurred_at]) });
  if (!r.history.exceptions.length) B.push({ t: 'p', text: 'No exception history.' });
  return B;
}

const mdCell = (v) => String(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
export function renderMarkdown(report) {
  const out = [];
  for (const b of toBlocks(report)) {
    if (b.t === 'h1') out.push(`# ${b.text}`, '');
    else if (b.t === 'h2') out.push(`## ${b.text}`, '');
    else if (b.t === 'badge') out.push(`**Status: ${b.status}**`, '');
    else if (b.t === 'p') out.push(b.text, '');
    else if (b.t === 'kv') out.push(...b.pairs.map(([k, v]) => `- **${k}:** ${mdCell(v)}`), '');
    else if (b.t === 'table') {
      if (b.title) out.push(`### ${b.title}`, '');
      if (!b.rows.length) { if (b.title) out.push('(none)', ''); continue; }
      out.push(`| ${b.head.join(' | ')} |`, `| ${b.head.map(() => '---').join(' | ')} |`, ...b.rows.map((r) => `| ${r.map(mdCell).join(' | ')} |`), '');
    }
  }
  return out.join('\n');
}

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const CSS = 'body{font:14px/1.45 system-ui,sans-serif;max-width:1100px;margin:24px auto;padding:0 16px;color:#1b1f24}h1{font-size:22px}h2{font-size:17px;margin-top:28px;border-bottom:1px solid #d0d7de}h3{font-size:14px}table{border-collapse:collapse;width:100%;margin:8px 0;font-size:13px}th,td{border:1px solid #d0d7de;padding:4px 8px;text-align:left;vertical-align:top;word-break:break-word}th{background:#f6f8fa}.badge{display:inline-block;padding:2px 10px;border-radius:12px;color:#fff;font-weight:600}.COMPLIANT{background:#1a7f37}.NON_COMPLIANT{background:#cf222e}.INDETERMINATE{background:#9a6700}';
export function renderHtml(report) {
  const out = [`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Compliance report ${esc(report.header.shipment_id)}</title><style>${CSS}</style></head><body>`];
  for (const b of toBlocks(report)) {
    if (b.t === 'h1') out.push(`<h1>${esc(b.text)}</h1>`);
    else if (b.t === 'h2') out.push(`<h2>${esc(b.text)}</h2>`);
    else if (b.t === 'badge') out.push(`<p><span class="badge ${esc(b.status)}">${esc(b.status)}</span></p>`);
    else if (b.t === 'p') out.push(`<p>${esc(b.text)}</p>`);
    else if (b.t === 'kv') out.push(`<ul>${b.pairs.map(([k, v]) => `<li><strong>${esc(k)}:</strong> ${esc(v)}</li>`).join('')}</ul>`);
    else if (b.t === 'table') {
      if (b.title) out.push(`<h3>${esc(b.title)}</h3>`);
      if (!b.rows.length) { if (b.title) out.push('<p>(none)</p>'); continue; }
      out.push(`<table><thead><tr>${b.head.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((x) => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    }
  }
  out.push('</body></html>');
  return out.join('\n');
}
