"use client";

import { Database, Video } from 'lucide-react';
import { useState } from 'react';
import { RealDatasetBrowser, SimulationDatasetBrowser } from './real-dataset-browser';

export function ScenarioBrowser() {
  const [view, setView] = useState<'episodes' | 'real'>('episodes');
  return <div className="scenarioBrowser">
    <nav className="datasetSourceNav" aria-label="Dataset source">
      <button type="button" className={view === 'episodes' ? 'active' : ''} aria-pressed={view === 'episodes'} onClick={() => setView('episodes')}>
        <span className="datasetSourceIcon"><Database size={17}/></span><span><strong>Simulation</strong><small>Tasks, episodes &amp; actions</small></span>
        <b>24 tasks</b>
      </button>
      <button type="button" className={view === 'real' ? 'active' : ''} aria-pressed={view === 'real'} onClick={() => setView('real')}>
        <span className="datasetSourceIcon"><Video size={17}/></span><span><strong>Real &amp; Ego</strong><small>Camera + action replay</small></span><b>2 sources</b>
      </button>
    </nav>
    <div className="datasetSourceContext">
      <div><span>{view === 'episodes' ? 'SIMULATION DATA' : 'PHYSICAL DATA'}</span>
        <h2>{view === 'episodes' ? 'Task-aligned simulation episodes' : 'Real & ego episodes'}</h2></div>
      <p>{view === 'episodes' ? 'Choose one task, then browse its 100 Training episodes and five episodes in each ID, OOD, and Failure recovery group.' : 'Replay synchronized robot or ego cameras with recorded actions.'}</p>
    </div>
    {view === 'real' ? <RealDatasetBrowser embedded/> : <SimulationDatasetBrowser embedded/>}
  </div>;
}
