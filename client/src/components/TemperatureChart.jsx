import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { buildChartData, DOT_COLORS } from '../lib/chartData.js';
import { formatDateTime, formatTick, formatTemp } from '../lib/format.js';

function Dot({ cx, cy, payload }) {
  if (cx === undefined || cy === undefined) return null;
  return <circle cx={cx} cy={cy} r={3} fill={DOT_COLORS[payload.cls] ?? DOT_COLORS.UNKNOWN} stroke="#fff" strokeWidth={0.5} />;
}

function Tip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="chart-tip">
      <div><strong>{p.id}</strong></div>
      <div>{formatDateTime(p.recorded_at)}</div>
      <div>{formatTemp(p.temp)}{p.unc !== null ? ` ± ${Number(p.unc).toFixed(2)} °C` : ''}</div>
      <div>Classification: {p.cls}</div>
    </div>
  );
}

export default function TemperatureChart({ payload }) {
  const d = buildChartData(payload);
  if (d.empty) return <p className="empty">No temperature readings in the transit window.</p>;
  const domain = d.domain ?? ['dataMin', 'dataMax'];
  return (
    <div>
      <div className="chart-box" style={{ height: 360 }}>
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={d.points} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#d6d9de" />
            <XAxis dataKey="t" type="number" scale="time" domain={domain} tickFormatter={formatTick} tickCount={8} allowDataOverflow />
            <YAxis domain={d.y} unit=" °C" width={60} allowDataOverflow />
            {d.policy && <ReferenceArea y1={d.policy.min_temp_c} y2={d.policy.max_temp_c} fill="#2e9d4f" fillOpacity={0.14} ifOverflow="extendDomain" />}
            {d.policy && <ReferenceLine y={d.policy.min_temp_c} stroke="#2e9d4f" strokeDasharray="4 3" />}
            {d.policy && <ReferenceLine y={d.policy.max_temp_c} stroke="#2e9d4f" strokeDasharray="4 3" />}
            {d.gaps.map((g, i) => <ReferenceArea key={`g${i}`} x1={g.x1} x2={g.x2} fill="#8a8f98" fillOpacity={0.3} />)}
            {d.excursions.map((x, i) => <ReferenceArea key={`x${i}`} x1={x.x1} x2={x.x2} fill="#d32f2f" fillOpacity={0.22} />)}
            <Tooltip content={<Tip />} />
            <Line type="linear" dataKey="temp" stroke="#44546a" strokeWidth={1.5} dot={<Dot />} activeDot={{ r: 5 }} isAnimationActive={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="legend" aria-label="Chart legend">
        <li><span className="swatch" style={{ background: DOT_COLORS.IN }} /> IN: inside the permitted range ({d.counts.IN})</li>
        <li><span className="swatch" style={{ background: DOT_COLORS.OUT }} /> OUT: outside the range ({d.counts.OUT})</li>
        <li><span className="swatch" style={{ background: DOT_COLORS.MARGINAL }} /> MARGINAL: within calibration uncertainty of a limit ({d.counts.MARGINAL})</li>
        <li><span className="swatch area-green" /> Permitted range{d.policy ? ` (${d.policy.min_temp_c} to ${d.policy.max_temp_c} °C, ${d.policy.policy_id})` : ''}</li>
        <li><span className="swatch area-red" /> Excursion period ({d.excursions.length})</li>
        <li><span className="swatch area-grey" /> Data gap ({d.gaps.length})</li>
      </ul>
      <p className="note">Excursion start/end are inferred from 10-minute samples (sample-and-hold); exact times are unknown.</p>
    </div>
  );
}
