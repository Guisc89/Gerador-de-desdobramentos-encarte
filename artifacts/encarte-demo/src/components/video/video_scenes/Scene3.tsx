import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, Edit3, Save } from 'lucide-react';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 1000); // show editor
    const t2 = setTimeout(() => setPhase(2), 2500); // highlight fields
    const t3 = setTimeout(() => setPhase(3), 4000); // show preview update
    const t4 = setTimeout(() => setPhase(4), 6000); // highlight preview
    const t5 = setTimeout(() => setPhase(5), 8000); // show save
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); };
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center p-[5vw]"
      initial={{ opacity: 0, x: '10vw' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="w-[90vw] h-[45vw] bg-white rounded-[1.5vw] shadow-2xl flex overflow-hidden border border-[#e4ead8]">
        {/* Sidebar */}
        <div className="w-[18vw] bg-white border-r border-[#e4ead8] flex flex-col pt-[2vw] px-[1vw]">
          <div className="text-[1.5vw] font-black text-[#E55F11] mb-[2vw] px-[1vw]">Associadas</div>
          <div className="flex flex-col gap-[0.5vw]">
            <div className="px-[1vw] py-[0.8vw] text-[#55716a] text-[1.2vw] font-semibold rounded-[0.5vw]">Importar</div>
            <div className="px-[1vw] py-[0.8vw] bg-[#04b3a6] text-white text-[1.2vw] font-semibold rounded-[0.5vw] shadow-md">Editor</div>
            <div className="px-[1vw] py-[0.8vw] text-[#55716a] text-[1.2vw] font-semibold rounded-[0.5vw]">Telas</div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex bg-[#fafcfb]">
          {/* Editor List */}
          <div className="w-[60%] p-[2vw] border-r border-[#e4ead8] flex flex-col relative overflow-hidden">
            <div className="flex justify-between items-center mb-[1.5vw]">
              <h2 className="text-[2vw] font-bold text-[#0f5f56]">Editar Produtos</h2>
              <div className="bg-[#e6fafa] text-[#01aba8] border border-[#01aba8] px-[1vw] py-[0.5vw] rounded-full text-[1vw] font-bold">
                98 Produtos
              </div>
            </div>

            <div className="flex flex-col gap-[1vw]">
              <motion.div 
                className="bg-white border border-[#e5e5e5] rounded-[1vw] p-[1.5vw] shadow-sm relative"
                animate={{ 
                  borderColor: phase >= 2 ? '#04b3a6' : '#e5e5e5',
                  boxShadow: phase >= 2 ? '0 0 0 0.2vw rgba(4,179,166,0.2)' : 'none'
                }}
              >
                <div className="flex justify-between mb-[1vw]">
                  <span className="text-[#888] font-bold text-[1vw]">#1</span>
                  <Edit3 className="w-[1.2vw] h-[1.2vw] text-[#04b3a6]" />
                </div>
                <div className="grid grid-cols-2 gap-[1vw]">
                  <div className="flex flex-col gap-[0.3vw]">
                    <label className="text-[0.8vw] text-[#666] font-bold uppercase">Produto (Nome)</label>
                    <input type="text" value="Desodorante Aerossol Above Feminino" readOnly className="bg-[#f3f3f3] border border-[#ddd] p-[0.6vw] rounded-[0.5vw] text-[1vw] outline-none" />
                  </div>
                  <div className="flex flex-col gap-[0.3vw]">
                    <label className="text-[0.8vw] text-[#666] font-bold uppercase">Apresentação</label>
                    <input type="text" value="150ml | Consulte Apresentações" readOnly className="bg-[#f3f3f3] border border-[#ddd] p-[0.6vw] rounded-[0.5vw] text-[1vw] outline-none" />
                  </div>
                  <div className="flex flex-col gap-[0.3vw]">
                    <label className="text-[0.8vw] text-[#666] font-bold uppercase">Indústria</label>
                    <input type="text" value="ABOVE" readOnly className="bg-[#f3f3f3] border border-[#ddd] p-[0.6vw] rounded-[0.5vw] text-[1vw] outline-none" />
                  </div>
                  <div className="flex flex-col gap-[0.3vw]">
                    <label className="text-[0.8vw] text-[#666] font-bold uppercase">Preço</label>
                    <input type="text" value="8,99" readOnly className="bg-[#fff] border border-[#04b3a6] p-[0.6vw] rounded-[0.5vw] text-[1.1vw] font-bold text-[#0f5f56] outline-none" />
                  </div>
                </div>
                
                {phase >= 2 && (
                  <motion.div 
                    className="absolute inset-0 border-[0.3vw] border-[#E55F11] rounded-[1vw] pointer-events-none"
                    initial={{ opacity: 0, scale: 1.05 }}
                    animate={{ opacity: 1, scale: 1 }}
                  />
                )}
              </motion.div>

              <div className="bg-white border border-[#e5e5e5] rounded-[1vw] p-[1.5vw] shadow-sm opacity-50">
                <div className="flex justify-between mb-[1vw]">
                  <span className="text-[#888] font-bold text-[1vw]">#2</span>
                </div>
                <div className="grid grid-cols-2 gap-[1vw]">
                  <div className="h-[2vw] bg-[#f3f3f3] rounded-[0.5vw]" />
                  <div className="h-[2vw] bg-[#f3f3f3] rounded-[0.5vw]" />
                </div>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="w-[40%] bg-[#f3f3f3] flex flex-col">
            <div className="h-[4vw] bg-white border-b border-[#eee] flex items-center px-[2vw] justify-between">
              <div className="flex items-center gap-[0.5vw] text-[#555] font-bold text-[1.2vw]">
                <Eye className="w-[1.5vw] h-[1.5vw]" /> Preview
              </div>
              <motion.div 
                className="bg-[#e6fafa] text-[#014f4e] border border-[#01aba8] px-[1vw] py-[0.3vw] rounded-full text-[1vw] font-bold flex items-center gap-[0.5vw]"
                animate={{ 
                  backgroundColor: phase >= 5 ? '#e6fafa' : '#fff4e0',
                  color: phase >= 5 ? '#014f4e' : '#8a4b00',
                  borderColor: phase >= 5 ? '#01aba8' : '#f0b86b'
                }}
              >
                {phase >= 5 ? <Save className="w-[1vw] h-[1vw]" /> : null}
                {phase >= 5 ? 'Salvo' : 'Alterações pendentes'}
              </motion.div>
            </div>
            <div className="flex-1 p-[2vw] flex justify-center items-center">
              <motion.div 
                className="w-[20vw] h-[28vw] bg-white rounded-[1vw] shadow-xl border border-[#ddd] flex flex-col p-[2vw] relative"
                animate={{
                  scale: phase >= 4 ? 1.05 : 1,
                  boxShadow: phase >= 4 ? '0 1vw 3vw rgba(0,0,0,0.15)' : '0 0.5vw 1.5vw rgba(0,0,0,0.1)'
                }}
                transition={{ type: 'spring' }}
              >
                <div className="w-[6vw] h-[2vw] bg-[#E55F11] mb-[2vw] rounded-[0.3vw]" />
                <div className="text-[1.3vw] font-black text-[#0f5f56] leading-tight mb-[0.5vw]">Desodorante Aerossol Above Feminino</div>
                <div className="text-[1vw] text-[#666] mb-[0.5vw]">150ml | Consulte Apresentações</div>
                <div className="text-[0.9vw] text-[#999] uppercase font-bold mb-[auto]">ABOVE</div>
                
                <motion.div 
                  className="bg-[#E55F11] text-white text-[2.5vw] font-black p-[1vw] rounded-[1vw] text-center"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: phase >= 3 ? 1 : 0.5, scale: phase >= 3 ? 1 : 0.9 }}
                >
                  R$ 8,99
                </motion.div>

                {phase >= 4 && (
                  <motion.div 
                    className="absolute inset-0 border-[0.4vw] border-[#E55F11] rounded-[1vw] pointer-events-none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  />
                )}
              </motion.div>
            </div>
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
        O editor inteligente extrai produtos, apresentações e indústrias, com preview em tempo real.
      </motion.div>
    
      <div className="absolute top-[2vh] left-[2vw] bg-black/60 text-white/90 px-[1vw] py-[0.5vh] rounded text-[1vw] font-medium backdrop-blur-md z-20">
        Demonstração ilustrativa com a planilha enviada
      </div>
</motion.div>
  );
}
