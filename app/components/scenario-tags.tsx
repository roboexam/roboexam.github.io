import { scenarioTags, type Scenario } from '../data/scenario-plan';

export function ScenarioTags({ scene }: { scene: Scenario }) {
  return <div className="scenarioTagList">{scene.tags.map(tag => <span key={tag} title={scenarioTags[tag].label}>{tag}</span>)}{scene.scoped.map(({tag,scope,reason}) => <span className="conditionalTag" key={tag} title={`${scenarioTags[tag].label} · ${scope}: ${reason}`} aria-label={`${scenarioTags[tag].label}, ${scope}`}>{tag}{scope === 'candidate' ? '?' : '*'}</span>)}</div>;
}
