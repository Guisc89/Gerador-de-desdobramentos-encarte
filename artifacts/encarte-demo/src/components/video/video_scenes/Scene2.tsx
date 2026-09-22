import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FileSpreadsheet, UploadCloud, CheckCircle2, AlertCircle } from 'lucide-react';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 800); // show file drop
    const t2 = setTimeout(() => setPhase(2), 2500); // show processing
    const t3 = setTimeout(() => setPhase(3), 4000); // show results
    const t4 = setTimeout(() => setPhase(4), 6000); // show details
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center p-[5vw]"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: '-10vh' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="w-[80vw] h-[45vw] bg-white rounded-[1.5vw] shadow-2xl flex flex-col overflow-hidden border border-[#e4ead8]">
        {/* Header */}
        <div className="h-[4vw] bg-[#0f5f56] flex items-center px-[2vw] gap-[1vw]">
          <div className="flex gap-[0.5vw]">
            <div className="w-[1vw] h-[1vw] rounded-full bg-[#ff5f56]" />
            <div className="w-[1vw] h-[1vw] rounded-full bg-[#ffbd2e]" />
            <div className="w-[1vw] h-[1vw] rounded-full bg-[#27c93f]" />
          </div>
          <div className="text-white text-[1.2vw] font-semibold opacity-90">Painel do Encarte Associadas</div>
        </div>

        {/* Content */}
        <div className="flex-1 p-[3vw] flex flex-col relative bg-[#fafcfb]">
          <h2 className="text-[2.5vw] font-bold text-[#0f5f56] mb-[1vw]">Importar Planilha</h2>
          
          <div className="flex-1 border-2 border-dashed border-[#cfe0da] rounded-[1vw] flex flex-col items-center justify-center bg-white relative overflow-hidden">
            {/* Phase 1: Upload */}
            <motion.div 
              className="flex flex-col items-center absolute"
              animate={{ opacity: phase >= 2 ? 0 : 1, y: phase >= 2 ? '-5vh' : 0 }}
            >
              <UploadCloud className="w-[6vw] h-[6vw] text-[#04b3a6] mb-[1vw]" />
              <div className="text-[1.8vw] font-medium text-[#55716a]">Arraste a planilha de encarte aqui</div>
              
              <motion.div 
                className="mt-[2vw] bg-[#e6fafa] border border-[#04b3a6] text-[#0f5f56] px-[2vw] py-[1vw] rounded-full flex items-center gap-[1vw] shadow-lg"
                initial={{ opacity: 0, y: '5vh' }}
                animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : '5vh' }}
              >
                <FileSpreadsheet className="w-[2vw] h-[2vw] text-[#04b3a6]" />
                <span className="font-bold text-[1.4vw]">lista_higienizada_ms_1790097626906.xlsx</span>
              </motion.div>
            </motion.div>

            {/* Phase 2: Processing */}
            <motion.div 
              className="flex flex-col items-center absolute"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: phase === 2 ? 1 : 0, scale: phase === 2 ? 1 : 0.8 }}
            >
              <div className="w-[5vw] h-[5vw] border-[0.4vw] border-[#e6fafa] border-t-[#04b3a6] rounded-full animate-spin mb-[1vw]" />
              <div className="text-[1.8vw] font-medium text-[#0f5f56]">Processando dados e formatando produtos...</div>
            </motion.div>

            {/* Phase 3 & 4: Results */}
            <motion.div 
              className="flex flex-col absolute w-full h-full p-[2vw] justify-center"
              initial={{ opacity: 0, y: '5vh' }}
              animate={{ opacity: phase >= 3 ? 1 : 0, y: phase >= 3 ? 0 : '5vh' }}
            >
              <div className="flex items-center gap-[1vw] mb-[2vw] justify-center">
                <CheckCircle2 className="w-[4vw] h-[4vw] text-[#27c93f]" />
                <div className="text-[2.5vw] font-bold text-[#0f5f56]">Importação Concluída</div>
              </div>
              
              <div className="flex justify-center gap-[2vw]">
                <div className="bg-[#f2f7f3] border border-[#cfe0da] rounded-[1vw] p-[1.5vw] w-[20vw] text-center">
                  <div className="text-[3vw] font-black text-[#0f5f56]">98</div>
                  <div className="text-[1.2vw] font-semibold text-[#55716a] uppercase">Lidos / Válidos</div>
                </div>
                <div className="bg-[#fff4e0] border border-[#f0b86b] rounded-[1vw] p-[1.5vw] w-[20vw] text-center">
                  <div className="text-[3vw] font-black text-[#8a4b00]">140</div>
                  <div className="text-[1.2vw] font-semibold text-[#8a4b00] uppercase">Ignorados</div>
                </div>
                <div className="bg-[#f2f2ea] border border-[#d7e3e1] rounded-[1vw] p-[1.5vw] w-[20vw] text-center opacity-70">
                  <div className="text-[3vw] font-black text-[#9aa59f]">0</div>
                  <div className="text-[1.2vw] font-semibold text-[#9aa59f] uppercase">Erros</div>
                </div>
              </div>

              <motion.div 
                className="mt-[2vw] mx-auto bg-[#fafcfb] border border-[#e4ede8] rounded-[0.8vw] p-[1vw] w-[64vw]"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: phase >= 4 ? 1 : 0, height: phase >= 4 ? 'auto' : 0 }}
              >
                <div className="flex items-center gap-[0.5vw] text-[1.2vw] font-bold text-[#0f5f56] mb-[0.5vw]">
                  <AlertCircle className="w-[1.5vw] h-[1.5vw] text-[#04b3a6]" />
                  <span>Motivos dos itens ignorados</span>
                </div>
                <ul className="text-[1.1vw] text-[#55716a] list-disc list-inside pl-[2vw]">
                  <li>138 linhas sem nome do produto</li>
                  <li>Linha 207: Seção "MEDICAMENTOS"</li>
                  <li>Linha 208: Cabeçalho repetido</li>
                </ul>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Caption */}
      <motion.div
        className="absolute bottom-[8vh] bg-black/80 text-white px-[2vw] py-[1vh] rounded-lg text-[2vw] font-medium max-w-[80vw] text-center backdrop-blur-sm z-10"
        initial={{ opacity: 0, y: '2vh' }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        Agora, basta importar a planilha. O sistema processa tudo automaticamente em segundos.
      </motion.div>
    
      <div className="absolute top-[2vh] left-[2vw] bg-black/60 text-white/90 px-[1vw] py-[0.5vh] rounded text-[1vw] font-medium backdrop-blur-md z-20">
        Demonstração ilustrativa com a planilha enviada
      </div>
</motion.div>
  );
}
