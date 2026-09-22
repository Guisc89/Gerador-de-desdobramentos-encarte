import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { DownloadCloud, LayoutTemplate, Smartphone, Columns, FileText } from 'lucide-react';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 500); // Cards show
    const t2 = setTimeout(() => setPhase(2), 1500); // Stories show
    const t3 = setTimeout(() => setPhase(3), 2500); // Telas show
    const t4 = setTimeout(() => setPhase(4), 3500); // Precario show
    const t5 = setTimeout(() => setPhase(5), 5500); // Download all
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); };
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center p-[5vw]"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: '10vh' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex gap-[2vw] mb-[2vw] h-[35vw] items-end justify-center w-full">
        
        {/* Preçário Output */}
        <motion.div 
          className="flex flex-col items-center"
          initial={{ opacity: 0, y: '5vh' }}
          animate={{ opacity: phase >= 4 ? 1 : 0, y: phase >= 4 ? 0 : '5vh' }}
          transition={{ type: 'spring' }}
        >
          <div className="w-[14vw] h-[19.8vw] bg-white rounded-[0.5vw] shadow-2xl border border-[#e4ead8] p-[1vw] flex flex-col relative overflow-hidden">
            <div className="w-full h-[2vw] bg-[#0f5f56] rounded-sm mb-[1vw] flex items-center justify-center">
              <span className="text-white text-[0.8vw] font-bold">PREÇÁRIO</span>
            </div>
            <div className="flex-1 flex flex-col gap-[0.5vw]">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="flex justify-between border-b border-gray-100 pb-[0.2vw]">
                  <div className="w-[6vw] h-[0.5vw] bg-gray-200" />
                  <div className="w-[2vw] h-[0.5vw] bg-[#E55F11]" />
                </div>
              ))}
            </div>
          </div>
          <div className="mt-[1vw] flex items-center gap-[0.5vw] bg-[#fff] px-[1vw] py-[0.5vw] rounded-full shadow-lg text-[#0f5f56] font-bold text-[1vw]">
            <FileText className="w-[1.2vw] h-[1.2vw] text-[#E55F11]" />
            Preçário (PDF)
          </div>
        </motion.div>

        {/* Cards Output */}
        <motion.div 
          className="flex flex-col items-center"
          initial={{ opacity: 0, y: '5vh' }}
          animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : '5vh' }}
          transition={{ type: 'spring' }}
        >
          <div className="w-[16vw] h-[21.3vw] bg-white rounded-[1vw] shadow-2xl border border-[#e4ead8] p-[1.5vw] flex flex-col items-center relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[0.8vw] bg-[#04b3a6]" />
            <div className="w-[9vw] h-[9vw] bg-[#f3f3f3] rounded-[1vw] mt-[1.5vw] mb-[1vw]" />
            <div className="w-[10vw] h-[1.5vw] bg-[#0f5f56] rounded-[0.5vw] mb-[0.8vw]" />
            <div className="w-[6vw] h-[1vw] bg-[#cfe0da] rounded-[0.5vw] mb-[1.5vw]" />
            <div className="w-[12vw] h-[2.5vw] bg-[#E55F11] rounded-[0.8vw]" />
          </div>
          <div className="mt-[1vw] flex items-center gap-[0.5vw] bg-[#fff] px-[1vw] py-[0.5vw] rounded-full shadow-lg text-[#0f5f56] font-bold text-[1vw]">
            <LayoutTemplate className="w-[1.2vw] h-[1.2vw] text-[#E55F11]" />
            Cards 3:4
          </div>
        </motion.div>

        {/* Stories Output */}
        <motion.div 
          className="flex flex-col items-center"
          initial={{ opacity: 0, y: '5vh' }}
          animate={{ opacity: phase >= 2 ? 1 : 0, y: phase >= 2 ? 0 : '5vh' }}
          transition={{ type: 'spring' }}
        >
          <div className="w-[14vw] h-[24.9vw] bg-[#0f5f56] rounded-[1.5vw] shadow-2xl border-4 border-[#333] p-[1vw] flex flex-col items-center justify-between relative overflow-hidden">
            <div className="text-[1.5vw] font-black text-white self-start">OFERTA</div>
            <div className="w-[10vw] h-[10vw] bg-white/20 rounded-[1vw]" />
            <div className="w-[12vw] bg-white rounded-[1vw] p-[0.8vw] flex flex-col items-center">
              <div className="w-[8vw] h-[1.2vw] bg-[#0f5f56] rounded-[0.5vw] mb-[0.8vw]" />
              <div className="text-[1.6vw] font-black text-[#E55F11]">R$ 8,99</div>
            </div>
          </div>
          <div className="mt-[1vw] flex items-center gap-[0.5vw] bg-[#fff] px-[1vw] py-[0.5vw] rounded-full shadow-lg text-[#0f5f56] font-bold text-[1vw]">
            <Smartphone className="w-[1.2vw] h-[1.2vw] text-[#E55F11]" />
            Stories 9:16
          </div>
        </motion.div>

        {/* Telas Output */}
        <motion.div 
          className="flex flex-col items-center"
          initial={{ opacity: 0, y: '5vh' }}
          animate={{ opacity: phase >= 3 ? 1 : 0, y: phase >= 3 ? 0 : '5vh' }}
          transition={{ type: 'spring' }}
        >
          <div className="w-[28vw] h-[15.75vw] bg-white rounded-[1vw] shadow-2xl border border-[#e4ead8] p-[1.5vw] flex flex-col relative overflow-hidden mt-auto">
            <div className="w-[8vw] h-[2vw] bg-[#E55F11] rounded-[0.5vw] mb-[1.5vw]" />
            <div className="flex gap-[2vw]">
              <div className="flex-1 flex flex-col gap-[1vw]">
                <div className="flex justify-between items-center bg-[#f3f3f3] p-[1vw] rounded-[0.5vw]">
                  <div className="w-[6vw] h-[1vw] bg-[#0f5f56] rounded-[0.3vw]" />
                  <div className="w-[3.5vw] h-[1.2vw] bg-[#E55F11] rounded-[0.3vw]" />
                </div>
                <div className="flex justify-between items-center bg-[#f3f3f3] p-[1vw] rounded-[0.5vw]">
                  <div className="w-[8vw] h-[1vw] bg-[#0f5f56] rounded-[0.3vw]" />
                  <div className="w-[3.5vw] h-[1.2vw] bg-[#E55F11] rounded-[0.3vw]" />
                </div>
              </div>
              <div className="w-[6vw] h-[6vw] bg-[#cfe0da] rounded-[1vw]" />
            </div>
          </div>
          <div className="mt-[1vw] flex items-center gap-[0.5vw] bg-[#fff] px-[1vw] py-[0.5vw] rounded-full shadow-lg text-[#0f5f56] font-bold text-[1vw]">
            <Columns className="w-[1.2vw] h-[1.2vw] text-[#E55F11]" />
            Telas 16:9
          </div>
        </motion.div>
      </div>

      <motion.div 
        className="bg-[#0f5f56] text-white px-[3vw] py-[1vw] rounded-full shadow-2xl flex items-center gap-[1vw] text-[1.5vw] font-bold cursor-pointer"
        initial={{ opacity: 0, scale: 0.8, y: '5vh' }}
        animate={{ opacity: phase >= 5 ? 1 : 0, scale: phase >= 5 ? 1 : 0.8, y: phase >= 5 ? 0 : '5vh' }}
        whileHover={{ scale: 1.05 }}
      >
        <DownloadCloud className="w-[2vw] h-[2vw]" />
        Baixar Todos os Formatos
      </motion.div>

      {/* Caption */}
      <motion.div
        className="absolute bottom-[4vh] bg-black/80 text-white px-[2vw] py-[1vh] rounded-lg text-[2vw] font-medium max-w-[80vw] text-center backdrop-blur-sm z-10"
        initial={{ opacity: 0, y: '2vh' }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        E gera automaticamente Preçário, Cards, Stories e Telas.
      </motion.div>
    
      <div className="absolute top-[2vh] left-[2vw] bg-black/60 text-white/90 px-[1vw] py-[0.5vh] rounded text-[1vw] font-medium backdrop-blur-md z-20">
        Demonstração ilustrativa com a planilha enviada
      </div>
</motion.div>
  );
}
