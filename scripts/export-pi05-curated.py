"""Export frozen Pi0.5 indomain results and an exact video allowlist; never rerun scoring."""
import argparse,hashlib,json,math,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
REG=ROOT/'scripts/pi05-curated-registry.json'
OUT=ROOT/'app/data/generated/pi05-curated.json'
MEDIA=ROOT/'scripts/pi05-curated-media.json'
AGG=ROOT/'app/data/generated/pi05-curated-aggregates.json'
PROCESS={'TARGET_SELECTION':'first_target_selection_accuracy','INTENTION_SCORE':'intention_score',
 'ACTION_ACCURACY':'action.skill','SKILL_ACCURACY':'action.skill','OBJECT_ACCURACY':'action.object',
 'LOCAL_SUCCESS_ONCE':'local_success_once','LOCAL_SUCCESS_AT_END':'local_success_at_end',
 'DROP_AFTER_SUCCESS':'drop_after_local_success','GRASP_STABILITY':'transport_stability'}
MOTION={'LSPARC':'left.sparc_episode','RSPARC':'right.sparc_episode','LPATH':'left.path_length_m',
 'RPATH':'right.path_length_m','EXECUTION_STEPS':'executed_action_steps'}
def require(ok,msg):
 if not ok:raise ValueError(msg)
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
def finite(v):return v is None or isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)
def format_value(v,unit='rate'):
 if v is None:return 'N/A'
 if isinstance(v,dict):return ' / '.join(k+': '+format_value(x,unit) for k,x in v.items())
 if isinstance(v,str):return v
 return f'{v*100:.2f}%' if unit=='rate' else f'{v:.3f}'
def process_value(report,field):
 if field.startswith('action.'):return report['summary'].get('action_accuracy',{}).get(field.split('.')[1],{})
 return report['summary'].get(field,{})
def export(entry,media,check):
 r=Path(entry['sourceRoot']);hashes=entry['sha256'];task=entry['task'];n=entry['expectedEpisodes']
 require(r.parent==Path('/mnt/gyc/benchmark2027/wzy/exp'),'source root outside allowlist')
 def read(p):
  p=Path(p);p=p if p.is_absolute() else r/p
  require(p.resolve().is_relative_to(r.resolve()),'source path escape')
  rel=str(p.relative_to(r));require(rel in hashes and sha(p)==hashes[rel],'source hash mismatch '+rel)
  return json.loads(p.read_text())
 run=read('run.json');summary=read('summary/summary.json');eps=read('summary/episodes.json');done=read('completion.json')
 require(run['task']==summary['task']==task,'task mismatch')
 require(run['input_mode']=='curated_indomain' and run['checkpoint'].endswith('/RoboDojo-sim-arx_x5-joint-0/59999'),'model/split mismatch')
 require(done['sim_exit_code']==done['summary_refresh_exit_code']==0,'not a clean completed run')
 require(len(eps)==len(run['layouts'])==n and all(e['completed'] for e in eps),'incomplete cohort')
 require(len({e['layout_id'] for e in eps})==len({e['source_episode'] for e in eps})==n,'duplicate identity')
 st=summary['statistics'];require(st['completed_runs']==st['planned_runs']==n,'count mismatch')
 motion=read('summary/motion_summary.json');eff=read('summary/efficiency_summary.json');stage=read('summary/stage_summary.json')
 require(motion['protocol']['sample_rate_hz']==25 and motion['protocol']['reference_point']=='link6','motion protocol mismatch')
 require({x['layout_id'] for x in eff['episodes']}=={x['layout_id'] for x in eps},'efficiency cohort mismatch')
 samples=[];reports=[]
 for e in eps:
  layout=next(x for x in run['layouts'] if x['layout_id']==e['layout_id'])
  require(all(e[k]==layout[k] for k in ['source_episode','sha256','scene_seed']),'layout identity mismatch')
  p=Path(e['episode']);meta=read(p/'metadata.json');report=read(p/'metrics/metrics.json')
  require(meta['task']==task and meta['status']=='complete' and meta['success']==e['outcome']['success'],'metadata mismatch')
  mr=read(p/'motion-v3/metrics.json');sr=read(p/'stage/metrics.json');vr=read(p/'videos.json')
  require(mr['episode']['success']==e['outcome']['success'] and mr['protocol']['reference_point']=='link6' and mr['protocol']['sample_rate_hz']==25,'sample motion mismatch')
  vals={'TSR':int(e['outcome']['success']),'N':1,'SCORE_DIST':e['outcome']['task_score']}
  units={'N':'episodes','SCORE_DIST':'score'}
  for k,field in PROCESS.items():
   item=process_value(report,field);v=item.get('value');require(finite(v),'nonfinite metric')
   vals[k]=v
  for k,field in MOTION.items():
   if '.' in field:a,f=field.split('.');vals[k]=mr['arms'][a][f]
   else:vals[k]=mr['episode'][field]
   units[k]='SPARC' if 'SPARC' in k else 'm' if k in ['LPATH','RPATH'] else 'steps'
  for k,f,u in [('PEAK_SPEED','peak_speed_m_s','m/s'),('EE_DISPLACEMENT','net_displacement_m','m')]:
   vals[k]={a:mr['arms'][a][f] for a in ['left','right']};units[k]=u
  er=next(x for x in eff['episodes'] if x['layout_id']==e['layout_id'])
  require(er['success']==e['outcome']['success'],'efficiency outcome mismatch')
  er=er.get('report') or {}
  if er:
   require(er['protocol'].get('reference_data_sha256')==e['reference'].get('reference_data_sha256'),'GT hash mismatch')
  for k,f in [('PATH_EFFICIENCY','PE'),('TIME_EFFICIENCY','TE')]:
   vals[k]=er.get(f) if e['outcome']['success'] else None
   if vals[k] is not None:
    require(er.get('status')=='computed' and er['protocol'].get('reference_duration_s') is not None,'missing GT success time')
  vals['SET']=mr['episode'].get('time_to_success_s') if e['outcome']['success'] else None;units['SET']='s'
  vals['STAGE_COMPLETION']={str(x['id']):int(x['completed']) for x in sr.get('stages',[])} if sr.get('valid') else None
  videos=[]
  for camera in ['cam_head','cam_left_wrist','cam_right_wrist']:
   v=vr[camera];vp=(p/v['path']).resolve()
   require(v['status']=='finalized' and vp.is_relative_to(r.resolve()) and vp.suffix=='.mp4','invalid video association')
   require(vp.name==f"episode_{e['layout_id']:07d}_{camera}_{'success' if e['outcome']['success'] else 'fail'}.mp4",'video identity mismatch')
   digest=sha(vp);key=digest+'.mp4';size=vp.stat().st_size
   media[key]={'path':str(vp),'size':size,'sha256':digest}
   probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height,nb_frames,avg_frame_rate:format=duration','-of','json',str(vp)],text=True))
   require(len(probe['streams'])==1,'missing video stream')
   vs=probe['streams'][0]
   videos.append({'camera':camera,'url':'/api/pi05-media/'+key,'sha256':digest,'durationSeconds':float(probe['format']['duration']),'frameCount':int(vs['nb_frames']),'width':vs['width'],'height':vs['height']})
  samples.append({'id':entry['resultVersion']+':'+e['source_episode'],'sourceEpisode':e['source_episode'],'layoutId':e['layout_id'],'seed':e['scene_seed'],'success':e['outcome']['success'],'score':e['outcome']['task_score'],'values':vals,'units':units,'videos':videos,
   'layoutSha256':e['sha256'],'reportSha256':hashes[str((p/'metrics/metrics.json').relative_to(r))],'evaluatorSha256':report['inputs']['implementation_sha256']})
  reports.append(report)
 values={}
 def put(k,v,count,unit='rate',coverage=None,detail='',micro=None):
  require(isinstance(v,(str,dict)) or finite(v),'nonfinite aggregate')
  values[k]={'value':v,'n':count,'unit':unit,'primary':format_value(v,unit),'available':v is not None,'coverage':coverage,'detail':detail,'micro':micro}
 success=sum(x['success'] for x in samples)
 require(abs(st['success_rate']['mean']-success/n)<1e-10,'SR mismatch')
 put('TSR',success/n,n,coverage=1);put('N',n,n,'episodes',1)
 dist={str(x):sum(s['score']==x for s in samples) for x in sorted({s['score'] for s in samples})}
 put('SCORE_DIST',dist,n,'episodes',1)
 for k,field in PROCESS.items():
  agg=st['metrics'].get(field)
  if not agg:put(k,None,0);continue
  rows=[s['values'][k] for s in samples if s['values'][k] is not None];macro=agg['episode_macro']
  require(len(rows)==macro['n'] and (not rows or abs(sum(rows)/len(rows)-macro['mean'])<1e-9),'aggregate mismatch '+field)
  note='Episode mean'
  if k=='INTENTION_SCORE':note+='; fingertip midpoint to mesh vertices, episode minimum < 1 cm'
  put(k,macro['mean'],macro['n'],coverage=agg['coverage'],detail=note,micro=agg['micro'])
 mm=motion['groups']['all']['metrics']
 for k,field in MOTION.items():
  agg=mm[field];rows=[s['values'][k] for s in samples if s['values'][k] is not None]
  require(len(rows)==agg['n'] and (not rows or abs(sum(rows)/len(rows)-agg['mean'])<1e-8),'motion aggregate mismatch')
  put(k,agg['mean'],agg['n'],samples[0]['units'][k],agg['n']/n,'link6 · 25 Hz' if k!='EXECUTION_STEPS' else '')
 for k,f,u in [('PEAK_SPEED','peak_speed_m_s','m/s'),('EE_DISPLACEMENT','net_displacement_m','m')]:
  parts={a:mm[a+'.'+f]['mean'] for a in ['left','right']}
  put(k,parts if any(v is not None for v in parts.values()) else None,n,u,detail='link6 · 25 Hz')
 for k in ['PATH_EFFICIENCY','TIME_EFFICIENCY','SET']:
  rows=[s['values'][k] for s in samples if s['values'][k] is not None]
  put(k,sum(rows)/len(rows) if rows else None,len(rows),'s' if k=='SET' else 'rate',len(rows)/success if success else None,'Successful episodes only')
 scr=stage['SCR'];sv={str(x['id']):x['value'] for x in scr}
 for x in scr:
  rows=[s['values']['STAGE_COMPLETION'][str(x['id'])] for s in samples if s['values']['STAGE_COMPLETION'] is not None and str(x['id']) in s['values']['STAGE_COMPLETION']]
  require(len(rows)==x['denominator'] and sum(rows)==x['numerator'],'SCR mismatch')
 put('STAGE_COMPLETION',sv if stage['valid_episodes'] else None,stage['valid_episodes'],coverage=stage['valid_episodes']/n)
 out={'task':task,'model':'Pi0.5','split':'indomain','resultVersion':entry['resultVersion'],'protocol':'joint-0/59999; task-specific events; link6 25 Hz motion',
 'episodes':n,'successes':success,'values':values,'samples':samples,'sourceHashes':hashes,
 'stageNames':{str(x['id']):x['name'] for x in scr}}
 require('/mnt/' not in json.dumps(out),'server path leaked')
 return out
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--check',action='store_true');a=ap.parse_args()
 entries=json.loads(REG.read_text());require(len({e['task'] for e in entries})==len(entries),'duplicate task')
 media={};data={e['task']:export(e,media,a.check) for e in entries}
 aggregates={k:{a:b for a,b in t.items() if a not in ['samples','sourceHashes']} for k,t in data.items()}
 for file,obj in [(OUT,data),(MEDIA,media),(AGG,aggregates)]:
  text=json.dumps(obj,ensure_ascii=False,indent=2,allow_nan=False)+'\n'
  if a.check:require(file.read_text()==text,'stale export '+file.name)
  else:file.write_text(text)
 print('Verified',len(data),'tasks',sum(t['episodes'] for t in data.values()),'episodes',len(media),'videos')
if __name__=='__main__':main()
