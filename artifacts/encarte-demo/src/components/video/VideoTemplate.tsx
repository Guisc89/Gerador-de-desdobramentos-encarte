import {
  VideoCanvas,
  type VideoAspectRatio,
  useVideoPlayer,
  VideoPausedContext,
} from '@/lib/video';
import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';

export const SCENE_DURATIONS = {
  s1: 8000,
  s2: 12000,
  s3: 15000,
  s4: 15000,
  s5: 10000,
};

const VIDEO_ASPECT_RATIO: VideoAspectRatio = '16:9';

export default function VideoTemplate({
  durations = SCENE_DURATIONS, paused = false, muted = false, onSceneChange,
}: {
  durations?: Record<string, number>; paused?: boolean; muted?: boolean;
  onSceneChange?: (key: string) => void;
} = {}) {
  const { currentSceneKey } = useVideoPlayer({ durations, paused });
  const baseKey = currentSceneKey.replace(/_r[12]$/, '');
  const currentScene = Object.keys(SCENE_DURATIONS).indexOf(baseKey);
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastKey = useRef<string | null>(null);
  useEffect(() => { onSceneChange?.(currentSceneKey); }, [currentSceneKey, onSceneChange]);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.45;
    if (paused) { audio.pause(); return; }
    if (lastKey.current !== currentSceneKey) {
      lastKey.current = currentSceneKey;
      const target = [0, 8, 20, 35, 50][currentScene] ?? 0;
      if (Math.abs(audio.currentTime - target) > 0.18) audio.currentTime = target;
    }
    void audio.play().catch(() => {});
  }, [currentSceneKey, currentScene, muted, paused]);

  return (
    <VideoPausedContext.Provider value={paused}><VideoCanvas
      aspectRatio={VIDEO_ASPECT_RATIO}
      style={{ backgroundColor: '#fbfdfb' }}
    >
      {/* Background persistent across scenes */}
      <motion.div 
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(circle at 15% -10%, rgba(4, 179, 166, 0.12) 0%, transparent 45%), radial-gradient(circle at 110% 10%, rgba(15, 95, 86, 0.08) 0%, transparent 40%), linear-gradient(180deg, #f2f7f3 0%, #fbfdfb 60%)'
        }}
      />
      
      {/* Background drifting element */}
      <motion.div
        className="absolute w-[80vw] h-[80vw] rounded-full blur-[10vw] opacity-40 mix-blend-multiply pointer-events-none"
        animate={{
          x: currentScene === 0 ? '-20vw' : currentScene === 1 ? '10vw' : currentScene === 2 ? '-10vw' : currentScene === 3 ? '20vw' : '0vw',
          y: currentScene === 0 ? '-20vw' : currentScene === 1 ? '-10vw' : currentScene === 2 ? '10vw' : currentScene === 3 ? '-20vw' : '-10vw',
          scale: currentScene === 4 ? 1.5 : 1,
          backgroundColor: currentScene === 4 ? '#04b3a6' : '#e6fafa'
        }}
        transition={{ duration: 4, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute w-[60vw] h-[60vw] rounded-full blur-[8vw] opacity-30 mix-blend-multiply pointer-events-none"
        animate={{
          x: currentScene === 0 ? '40vw' : currentScene === 1 ? '20vw' : currentScene === 2 ? '50vw' : currentScene === 3 ? '10vw' : '30vw',
          y: currentScene === 0 ? '20vw' : currentScene === 1 ? '40vw' : currentScene === 2 ? '10vw' : currentScene === 3 ? '30vw' : '20vw',
          backgroundColor: '#0f5f56'
        }}
        transition={{ duration: 5, ease: "easeInOut" }}
      />

      {/* mode="wait" = sequential, "sync" = simultaneous, "popLayout" = new snaps in while old animates out */}
      <AnimatePresence mode="popLayout">
        {currentScene === 0 && <Scene1 key={currentSceneKey} />}
        {currentScene === 1 && <Scene2 key={currentSceneKey} />}
        {currentScene === 2 && <Scene3 key={currentSceneKey} />}
        {currentScene === 3 && <Scene4 key={currentSceneKey} />}
        {currentScene === 4 && <Scene5 key={currentSceneKey} />}
      </AnimatePresence>
      <audio ref={audioRef} src={`${import.meta.env.BASE_URL}audio/bg_music.mp3`} preload="auto" autoPlay muted={muted} />
    </VideoCanvas></VideoPausedContext.Provider>
  );
}
