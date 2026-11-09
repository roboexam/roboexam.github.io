"use client";

import { useState } from 'react';
import { acwm600, aColumns, compositeScores, regimeNames, type ReaderVersion } from '../data/acwm600-results';
import { dataUrl } from '../static-site';

type Dimension = 'all' | 'A' | 'B';
const videoColumns = aColumns;
const actionColumns = [
  { id: 'position', name: 'EE position MAE', unit: 'mm', direction: '↓' },
  { id: 'rotation', name: 'EE rotation MAE', unit: 'deg', direction: '↓' },
] as const;
const scoreText = (value: number | null | undefined, digits = 4) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';
const scopeText = (scope: string) => scope === 'ALL' ? 'All 600 cases'
  : scope.startsWith('family/') ? regimeNames[scope.slice(7)] : scope.slice(5).replaceAll('_', ' ');

/** Track 2 data in the same workspace/table styles as the other tracks. */
export function Acwm600Results() {
  const [scope, setScope] = useState('ALL');
  const [reader, setReader] = useState<ReaderVersion>('v5');
  const [dimension, setDimension] = useState<Dimension>('all');
  const keys = Object.keys(acwm600.models[0].groups);
  const showA = dimension !== 'B';
  const showB = dimension !== 'A';
  const columns = (showA ? videoColumns.length : 0) + (showB ? actionColumns.length : 0);
  const scores = compositeScores(scope, reader);

  return <>
    <div className="trackFilters" aria-label="Track 2 result filters">
      <label>Scope<select aria-label="ACWM result scope" value={scope} onChange={event => setScope(event.target.value)}>
        <option value="ALL">All scenarios · all settings</option>
        <optgroup label="Evaluation setting">{keys.filter(key => key.startsWith('family/')).map(key =>
          <option key={key} value={key}>{scopeText(key)}</option>)}</optgroup>
        <optgroup label="Scenario">{keys.filter(key => key.startsWith('task/')).map(key =>
          <option key={key} value={key}>{scopeText(key)}</option>)}</optgroup>
      </select></label>
      <label>Dimension<select aria-label="ACWM result dimension" value={dimension} onChange={event => setDimension(event.target.value as Dimension)}>
        <option value="all">A + B</option><option value="A">A · Video quality</option><option value="B">B · Action following</option>
      </select></label>
      <label>Reader<select aria-label="ACWM reader version" value={reader} onChange={event => setReader(event.target.value as ReaderVersion)}>
        <option value="v5">AnyPos v5</option><option value="v4">AnyPos v4 · comparison</option>
      </select></label>
    </div>
    <div className="tableHint"><span>3 methods · {columns} native metrics · composite score · {scopeText(scope)}</span><span>AnyPos {reader}</span></div>
    {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
    <div className="trackMetricTableWrap" tabIndex={0} role="region" aria-label="T2 current A/B leaderboard, horizontally scrollable">
      <table className="trackMetricTable methodLeaderboard" data-testid="acwm600-table" data-reader={reader} data-scope={scope}>
        <caption className="srOnly">Current ACWM results with a direction-aware composite score and native metrics.</caption>
        <thead>
          <tr><th rowSpan={2} scope="col">Method</th>
            <th className="overallScoreHead" rowSpan={2} scope="col"><span>Composite score</span><small>9 metrics · 0–100</small></th>
            {showA && <th className="metricGroupHead" scope="colgroup" colSpan={videoColumns.length}>A · Video quality</th>}
            {showB && <th className="metricGroupHead" scope="colgroup" colSpan={actionColumns.length}>B · Action following</th>}
          </tr>
          <tr>{showA && videoColumns.map(column => <th className="settingHead" scope="col" key={column.id} title={column.note}>
            {column.name} {column.direction}{column.unit && <small>{column.unit}</small>}
          </th>)}{showB && actionColumns.map(column => <th className="settingHead" scope="col" key={column.id}>
            {column.name} {column.direction}<small>{column.unit}</small>
          </th>)}</tr>
        </thead>
        <tbody>{acwm600.models.map(model => {
          const group = model.groups[scope];
          return <tr key={model.id} data-model={model.id}>
            <th scope="row"><strong>{model.label}</strong><span>{model.checkpoint}</span></th>
            <td className="overallScoreCell"><strong>{scores[model.id]?.toFixed(2) ?? '—'}</strong></td>
            {showA && videoColumns.map(column => <td key={column.id}><strong>{scoreText(group.a[column.id])}</strong></td>)}
            {showB && actionColumns.map(column => <td key={column.id}><strong>{scoreText(group.b[reader][column.id].mae, 3)}</strong></td>)}
          </tr>;
        })}</tbody>
      </table>
    </div>
    <details>
      <summary>Protocol, coverage & provenance</summary>
      <p>{acwm600.split}. Fixed-action self-recursive replay, t0-only conditioning; actual common 0.16 s grid, t0 excluded, no interpolation.</p>
      <p>A keeps the frozen aggregation rules and is independent of the B reader selection. JEPA/JEDi are set-level results; no per-episode A3 score is created. B compares AnyPos(GT) with AnyPos(prediction), pooling valid arm-frame denominators. The composite score direction-normalizes the seven A metrics and two B metrics against the geometric mean of the three methods in the selected scope, then averages them equally.</p>
      <p>AnyPos v5 GT qualification passed on 19/24 tasks. TASK_LIMITED: {acwm600.readerLimitedTasks.join(', ')}. All tasks remain included; numeric coverage does not establish generated-domain 3D accuracy or task success. v4/v5 reuse the same predictions.</p>
      <div className="trackMetricTableWrap" role="region" aria-label="T2 result provenance">
        <table className="trackMetricTable"><thead><tr><th scope="col">Field</th><th scope="col">Value</th></tr></thead><tbody>
          <tr><th scope="row">Result version</th><td>{acwm600.version}</td></tr>
          <tr><th scope="row">Accepted</th><td>{acwm600.acceptedAt}</td></tr>
          <tr><th scope="row">Reader {reader}</th><td><code>{acwm600.readers[reader]}</code></td></tr>
          <tr><th scope="row">Full result bundle SHA</th><td><code>{acwm600.fullBundleSha256}</code></td></tr>
          {acwm600.models.map(model => <tr key={model.id}><th scope="row">{model.label}</th><td>
            <code>{model.sha256}</code><br/>{model.groups[scope].count} cases · {model.groups[scope].b[reader].position.valid} / {model.groups[scope].b[reader].position.expected} position arm-frames · {model.groups[scope].b[reader].rotation.valid} / {model.groups[scope].b[reader].rotation.expected} rotation arm-frames · JEDi {scoreText(model.groups[scope].a.JEDi)}
          </td></tr>)}
          {acwm600.sources.map(source => <tr key={source.id}><th scope="row">{source.id}</th><td><code>{source.sha256}</code></td></tr>)}
        </tbody></table>
      </div>
      <p><a href={dataUrl("/api/acwm600-results")} download="acwm600-results.json">Download complete per-case results and provenance (JSON)</a></p>
    </details>
  </>;
}
