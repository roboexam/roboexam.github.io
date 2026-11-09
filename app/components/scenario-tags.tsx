import { scenarioTags, temporalSubtypes, type Scenario } from '../data/scenario-plan';

export function ScenarioTags({ scene }: { scene: Scenario }) {
  return <div className="scenarioTagList">{scene.tags.map(tag => <span key={tag} title={scenarioTags[tag].rule}>{tag}</span>)}{scene.scoped.map(({tag,scope,reason}) => <span className="conditionalTag" key={tag} title={`${scenarioTags[tag].label} · ${scope}: ${reason}`} aria-label={`${scenarioTags[tag].label}, ${scope}`}>{tag}{scope === 'candidate' ? '?' : '*'}</span>)}{scene.temporal.map(({subtype,scope,reason}) => <span className={scope === 'candidate' ? 'conditionalTag' : 'temporalSubtype'} key={subtype} title={`${temporalSubtypes[subtype].label} · ${scope}: ${reason}`} aria-label={`${temporalSubtypes[subtype].label}, ${scope}`}>{temporalSubtypes[subtype].code}{scope === 'candidate' ? '?' : ''}</span>)}</div>;
}
