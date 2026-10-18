import type { T1Model } from "../../data/t1-agent-results";
import { scoreText } from "./result-format";

type Props = {
  models: T1Model[];
  selectedModelId: string;
  viewerId: string;
  onSelectModel: (modelId: string) => void;
};

export function T1ScoreTable({ models, selectedModelId, viewerId, onSelectModel }: Props) {
  return <div className="t1TableScroll" role="region" aria-label="Stack Bowls model results, horizontally scrollable"
    /* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */
    tabIndex={0}>
    <table className="t1ScoreTable">
      <caption className="srOnly">Initial VQA scores out of 100 across five Stack Bowls layouts. Process questions C2 and C3 have not been scored.</caption>
      <thead><tr>
        <th scope="col">Model</th>
        <th scope="col" className="t1MainScore">Initial VQA<small>/ 100</small></th>
        <th scope="col" title="Object facts: count and interior color">A1<small>Object facts</small></th>
        <th scope="col" title="3D center localization within 2 centimeters">A2<small>3D · ≤ 2 cm</small></th>
        <th scope="col" title="Task-conditioned final stack relationship">B1<small>Task goal</small></th>
        <th scope="col" title="Structured complete high-level plan">C1<small>Full plan</small></th>
        <th scope="col">C2<small>Completed set</small></th>
        <th scope="col">C3<small>Next action</small></th>
        <th scope="col">Answer coverage<small>normal / expected</small></th>
        <th scope="col" title="Maximum observed native progress across the five layouts; distinct from task success">
          Observed progress<small>max / 100</small>
        </th>
        <th scope="col"><span className="srOnly">Execution episodes</span></th>
      </tr></thead>
      <tbody>{models.map((model) => <tr key={model.id} className={model.id === selectedModelId ? "t1SelectedRow" : undefined}>
        <th scope="row"><strong>{model.label}</strong><span>{model.family}</span></th>
        <td className="t1MainScore"><strong>{scoreText(model.scores.composite)}</strong></td>
        <td>{scoreText(model.scores.a1)}</td>
        <td>{scoreText(model.scores.a2)}</td>
        <td>{scoreText(model.scores.b1)}</td>
        <td>{scoreText(model.scores.c1)}</td>
        <td className="t1Unmeasured" aria-label="C2 not measured">—</td>
        <td className="t1Unmeasured" aria-label="C3 not measured">—</td>
        <td>{model.answered}<span className="t1Fraction"> / {model.expected}</span></td>
        <td>{scoreText(model.maxProgress)}</td>
        <td><button type="button" className="t1EpisodeAction" aria-controls={viewerId}
          aria-pressed={model.id === selectedModelId} onClick={() => onSelectModel(model.id)}>
          View episodes<span aria-hidden="true">↗</span>
        </button></td>
      </tr>)}</tbody>
    </table>
  </div>;
}
