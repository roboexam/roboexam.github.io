"use client";

import { Database, Video } from 'lucide-react';
import { useState } from 'react';
import { RealDatasetBrowser, SimulationDatasetBrowser } from './real-dataset-browser';
import { STATIC_SITE } from '../static-site';

export function ScenarioBrowser() {
  // ?source=real (from the Overview's real-robot clips) opens the Real & Ego view
  const [view, setView] = useState<'episodes' | 'real'>(() => typeof window !== 'undefined' && new URL(window.location.href).searchParams.get('source') === 'real' ? 'real' : 'episodes');
  return <div className="scenarioBrowser">
    <nav className="datasetSourceNav" aria-label="Dataset source">
      <button type="button" className={view === 'episodes' ? 'active' : ''} aria-pressed={view === 'episodes'} onClick={() => setView('episodes')}>
        <span className="datasetSourceIcon"><Database size={17}/></span><span><strong>Simulation</strong>{!STATIC_SITE && <small>Tasks, episodes &amp; actions</small>}</span>
        <b>24 tasks</b>
      </button>
      <button type="button" className={view === 'real' ? 'active' : ''} aria-pressed={view === 'real'} onClick={() => setView('real')}>
        <span className="datasetSourceIcon"><Video size={17}/></span><span><strong>Real &amp; Ego</strong>{!STATIC_SITE && <small>Camera + action replay</small>}</span><b>2 sources</b>
      </button>
    </nav>
    <div className="datasetSourceContext">
      <div><span>{view === 'episodes' ? 'SIMULATION DATA' : 'PHYSICAL DATA'}</span>
        <h2>{view === 'episodes' ? 'Task-aligned simulation episodes' : 'Real & ego episodes'}</h2></div>
      <p>{view === 'episodes' ? 'Pick a task to watch its 100 Training episodes and five episodes from each ID, OOD and Failure recovery group.' : 'Replay robot and egocentric cameras together with the recorded actions.'}</p>
    </div>
    {view === 'real' ? <RealDatasetBrowser embedded/> : <SimulationDatasetBrowser embedded/>}
  </div>;
}
