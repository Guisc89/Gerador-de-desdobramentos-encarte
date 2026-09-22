import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate';
import { Pause, Play, Repeat, Volume2, VolumeX, ChevronDown, ChevronUp } from 'lucide-react';

const keys = Object.keys(SCENE_DURATIONS) as (keyof typeof SCENE_DURATIONS)[];
const titles = ['Antes', 'Importação', 'Edição', 'Formatos', 'Resultado'];

function Timer({ index, tick, paused }: { index: number; tick: number; paused: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const saved = useRef(0);
  useEffect(() => { saved.current = 0; setElapsed(0); }, [tick]);
  useEffect(() => {
    if (paused) return;
    const start = performance.now();
    const interval = setInterval(() => setElapsed(saved.current + performance.now() - start), 60);
    return () => { clearInterval(interval); saved.current += performance.now() - start; };
  }, [paused, tick]);
  const seconds = Math.min(60, Math.floor(([0, 8000, 20000, 35000, 50000][index] + Math.min(elapsed, SCENE_DURATIONS[keys[index]])) / 1000));
  return <span role="timer" style={{ minWidth: 110, fontVariantNumeric: 'tabular-nums' }}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')} / 1:00</span>;
}

export default function VideoWithControls() {
  const [active, setActive] = useState(0);
  const [start, setStart] = useState(0);
  const [locked, setLocked] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [mount, setMount] = useState(0);
  const [tick, setTick] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const sensor = useRef<HTMLDivElement>(null);
  const durations = useMemo(() => {
    const key = keys[start];
    if (locked) return { [`${key}_r1`]: SCENE_DURATIONS[key], [`${key}_r2`]: SCENE_DURATIONS[key] };
    return Object.fromEntries(keys.map((_, i) => keys[(start + i) % keys.length]).map(k => [k, SCENE_DURATIONS[k]]));
  }, [start, locked]);
  const onSceneChange = useCallback((key: string) => {
    setActive(keys.indexOf(key.replace(/_r[12]$/, '') as keyof typeof SCENE_DURATIONS));
    setTick(t => t + 1);
  }, []);
  useEffect(() => {
    if (!paused) return;
    const animations = document.getAnimations().filter(a => a.playState === 'running');
    animations.forEach(a => a.pause());
    return () => animations.forEach(a => a.play());
  }, [paused]);
  useEffect(() => {
    if (!pinned) return;
    const listener = (e: PointerEvent) => {
      if (!sensor.current?.contains(e.target as Node)) setPinned(false);
    };
    document.addEventListener('pointerdown', listener);
    return () => document.removeEventListener('pointerdown', listener);
  }, [pinned]);
  if (window.self === window.top) return <VideoTemplate />;
  const visible = !collapsed || hover || pinned;
  const jump = (index: number) => {
    setStart(index); setActive(index); setPaused(false); setMount(m => m + 1);
    window.parent.postMessage({ type: 'REPLIT_VIDEO_SCENE_SELECTED', payload: {
      sceneIndex: index, sceneCount: 5, sceneTitle: titles[index],
      filePath: `src/components/video/video_scenes/Scene${index + 1}.tsx`, lineNumber: 1,
    } }, '*');
  };
  return <div className="relative w-full h-screen">
    <VideoTemplate key={mount} durations={durations} paused={paused} muted={muted} onSceneChange={onSceneChange} />
    <div ref={sensor} style={{ position: 'absolute', bottom: 0, width: '100%', height: '25%', zIndex: 100, display: 'flex', alignItems: 'end' }}
      onPointerEnter={e => { if (e.pointerType === 'mouse') setHover(true); }}
      onPointerLeave={() => setHover(false)}
      onPointerDown={e => { if (e.pointerType !== 'mouse') setPinned(true); }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: '100%', padding: 16, background: '#102d29e8', color: 'white',
        transform: visible ? 'translateY(0)' : 'translateY(100%)', opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none', transition: '0.2s' }}>
        <button aria-label={paused ? 'Reproduzir' : 'Pausar'} onClick={() => setPaused(p => !p)}>{paused ? <Play /> : <Pause />}</button>
        <button aria-label="Repetir cena" aria-pressed={locked} onClick={() => { setStart(active); setLocked(l => !l); setPaused(false); setMount(m => m + 1); }}><Repeat color={locked ? '#04b3a6' : 'white'} /></button>
        <button aria-label={muted ? 'Ativar som' : 'Silenciar'} onClick={() => setMuted(m => !m)}>{muted ? <VolumeX /> : <Volume2 />}</button>
        <div style={{ flex: 1, display: 'flex', gap: 8 }}>{keys.map((k, i) => <button key={k} title={titles[i]} aria-label={`Cena ${i + 1}: ${titles[i]}`} onClick={() => jump(i)}
          style={{ flex: 1, height: 12, borderRadius: 8, background: i === active ? '#04b3a6' : '#ffffff44' }} />)}</div>
        <span>{active + 1}/5</span><Timer index={active} tick={tick} paused={paused} />
        <button aria-label={collapsed ? 'Mostrar controles' : 'Ocultar controles'} onClick={() => { setCollapsed(c => !c); setHover(false); setPinned(false); }}>{collapsed ? <ChevronUp /> : <ChevronDown />}</button>
      </div>
    </div>
  </div>;
}