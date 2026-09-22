import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 800);
    const t2 = setTimeout(() => setPhase(2), 2500);
    const t3 = setTimeout(() => setPhase(3), 4000);
    const t4 = setTimeout(() => setPhase(4), 5500);
    const t5 = setTimeout(() => setPhase(5), 7500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); };
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center p-[5vw] bg-[#04b3a6]"
      initial={{ opacity: 0, clipPath: 'circle(0% at 50% 50%)' }}
      animate={{ opacity: 1, clipPath: 'circle(150% at 50% 50%)' }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div 
        className="text-white font-extrabold tracking-tight text-center leading-none"
        style={{ fontSize: '7vw' }}
        initial={{ y: '5vh', opacity: 0 }}
        animate={{ y: phase >= 1 ? 0 : '5vh', opacity: phase >= 1 ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        O processo <span className="text-[#0f5f56]">agora</span>
      </motion.div>

      <div className="flex gap-[4vw] mt-[5vh]">
        <motion.div 
          className="flex flex-col items-center bg-white rounded-[2vw] shadow-2xl p-[3vw] border-4 border-[#0f5f56]"
          initial={{ scale: 0.8, opacity: 0, y: '5vh' }}
          animate={{ 
            scale: phase >= 2 ? 1 : 0.8, 
            opacity: phase >= 2 ? 1 : 0,
            y: phase >= 2 ? 0 : '5vh'
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 15 }}
        >
          <div className="text-[6vw] font-black text-[#0f5f56]">Máx. 2 Dias</div>
          <div className="text-[2vw] font-semibold text-[#04b3a6] uppercase tracking-widest mt-[1vh]">de trabalho</div>
        </motion.div>

        <motion.div 
          className="flex flex-col items-center bg-white rounded-[2vw] shadow-2xl p-[3vw] border-4 border-[#0f5f56]"
          initial={{ scale: 0.8, opacity: 0, y: '5vh' }}
          animate={{ 
            scale: phase >= 3 ? 1 : 0.8, 
            opacity: phase >= 3 ? 1 : 0,
            y: phase >= 3 ? 0 : '5vh'
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 15 }}
        >
          <div className="text-[6vw] font-black text-[#0f5f56]">1 Pessoa</div>
          <div className="text-[2vw] font-semibold text-[#04b3a6] uppercase tracking-widest mt-[1vh]">resolve tudo</div>
        </motion.div>
      </div>

      <motion.div 
        className="absolute bottom-[20vh]"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: phase >= 4 ? 1 : 0, scale: phase >= 4 ? 1 : 0.8 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        <img src={`${import.meta.env.BASE_URL}assets/encarte-logo-sidebar.png`} alt="Encarte Associadas" className="h-[8vw]" />
      </motion.div>

      <motion.div 
        className="absolute bottom-[4vh] text-[#0f5f56] text-[1.2vw] font-bold bg-white/50 px-[1.5vw] py-[0.5vw] rounded-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: phase >= 5 ? 1 : 0 }}
        transition={{ duration: 1 }}
      >
        * Resultados informados pela equipe
      </motion.div>
    
      <motion.div
        className="absolute bottom-[12vh] bg-black/80 text-white px-[2vw] py-[1vh] rounded-lg text-[2vw] font-medium max-w-[80vw] text-center backdrop-blur-sm z-10"
        initial={{ opacity: 0, y: '2vh' }}
        animate={{ opacity: phase >= 4 ? 1 : 0, y: phase >= 4 ? 0 : '2vh' }}
        transition={{ delay: 0.2 }}
      >
        O resultado: muito mais eficiência e autonomia para a equipe.
      </motion.div>

    </motion.div>
  );
}
