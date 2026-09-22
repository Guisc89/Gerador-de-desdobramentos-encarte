import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 500);
    const t2 = setTimeout(() => setPhase(2), 2000);
    const t3 = setTimeout(() => setPhase(3), 3500);
    const t4 = setTimeout(() => setPhase(4), 5000);
    const t5 = setTimeout(() => setPhase(5), 7000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); };
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center p-[5vw]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
      transition={{ duration: 0.8 }}
    >
      <motion.div 
        className="text-[#0f5f56] font-extrabold tracking-tight text-center leading-none"
        style={{ fontSize: '7vw' }}
        initial={{ y: '5vh', opacity: 0 }}
        animate={{ y: phase >= 1 ? 0 : '5vh', opacity: phase >= 1 ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        O processo manual<br/>de encartes
      </motion.div>

      <div className="flex gap-[4vw] mt-[5vh]">
        <motion.div 
          className="flex flex-col items-center bg-white rounded-[2vw] shadow-2xl p-[3vw] border border-[#e4ead8]"
          initial={{ scale: 0.8, opacity: 0, rotate: -5 }}
          animate={{ 
            scale: phase >= 2 ? 1 : 0.8, 
            opacity: phase >= 2 ? 1 : 0,
            rotate: phase >= 2 ? 0 : -5
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 15 }}
        >
          <div className="text-[6vw] font-black text-[#E55F11]">1 Semana</div>
          <div className="text-[2vw] font-semibold text-[#55716a] uppercase tracking-widest mt-[1vh]">de trabalho</div>
        </motion.div>

        <motion.div 
          className="flex flex-col items-center bg-white rounded-[2vw] shadow-2xl p-[3vw] border border-[#e4ead8]"
          initial={{ scale: 0.8, opacity: 0, rotate: 5 }}
          animate={{ 
            scale: phase >= 3 ? 1 : 0.8, 
            opacity: phase >= 3 ? 1 : 0,
            rotate: phase >= 3 ? 0 : 5
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 15 }}
        >
          <div className="text-[6vw] font-black text-[#E55F11]">2 Pessoas</div>
          <div className="text-[2vw] font-semibold text-[#55716a] uppercase tracking-widest mt-[1vh]">dedicadas</div>
        </motion.div>
      </div>

      <motion.div 
        className="absolute bottom-[4vh] text-[#74827c] text-[1.2vw] font-medium"
        initial={{ opacity: 0 }}
        animate={{ opacity: phase >= 4 ? 1 : 0 }}
        transition={{ duration: 1 }}
      >
        * Resultados informados pela equipe
      </motion.div>

      {/* Caption */}
      <motion.div
        className="absolute bottom-[10vh] bg-black/80 text-white px-[2vw] py-[1vh] rounded-lg text-[2vw] font-medium max-w-[80vw] text-center backdrop-blur-sm"
        initial={{ opacity: 0, y: '2vh' }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        Antes, montar encartes manualmente exigia uma semana inteira e dois funcionários.
      </motion.div>
    </motion.div>
  );
}
