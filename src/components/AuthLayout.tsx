import React, { ReactNode } from 'react'
import { BadgeCheck, Sparkles } from 'lucide-react'

interface AuthLayoutProps {
  children: ReactNode
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-white selection:bg-[#F1E5C8] selection:text-[#2D2A26] animate-fade-in font-sans">
      {/* Banner decorativo Mobile (< 1024px) */}
      <div className="lg:hidden w-full bg-gradient-to-r from-[#FFF8ED] via-[#FDFBF7] to-[#FFF8ED] border-b border-[#F1E5C8] px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-[#D4AF37] flex items-center justify-center bg-white shadow-gold">
            <svg
              className="w-5 h-5 text-[#D4AF37]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2C8 6 4 10 4 14a8 8 0 0 0 16 0c0-4-4-8-8-12z" />
              <path d="M12 8c2.5 2 3.5 4 3.5 6a3.5 3.5 0 0 1-7 0c0-2 1-4 3.5-6z" />
            </svg>
          </div>
          <div>
            <span className="font-serif text-lg font-bold text-[#2D2A26] tracking-wide">
              CRM Estética
            </span>
            <span className="block text-[11px] uppercase tracking-widest text-[#B8960E] font-medium">
              Gestão de Alto Padrão
            </span>
          </div>
        </div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FFF8ED] border border-[#D4AF37]/40 text-[11px] font-medium text-[#92750B]">
          <Sparkles className="w-3 h-3 text-[#D4AF37]" />
          <span>Premium</span>
        </div>
      </div>

      {/* Coluna do Formulário (Esquerda) */}
      <div className="w-full lg:w-[60%] flex items-center justify-center p-6 sm:p-10 lg:p-14 bg-white">
        <div className="w-full max-w-[480px] my-auto">{children}</div>
      </div>

      {/* Coluna Visual (Direita - Desktop 40%) */}
      <div className="hidden lg:relative lg:flex lg:w-[40%] bg-[#2D2A26] overflow-hidden flex-col justify-between p-12">
        {/* Imagem de Fundo (mulher em tratamento de spa/facial com iluminação suave) */}
        <img
          src="https://img.usecurling.com/p/1200/1600?q=skincare%20facial%20spa&color=warm"
          alt="Tratamento estético de alta precisão e bem-estar"
          className="absolute inset-0 w-full h-full object-cover object-center scale-105 transition-transform duration-1000 ease-out hover:scale-110"
          loading="eager"
        />

        {/* Gradiente Dourado Translúcido e Escuro com overlay sofisticado */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#2D2A26]/95 via-[#2D2A26]/55 to-[#D4AF37]/35 backdrop-blur-[1px]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#2D2A26]/60 via-transparent to-[#D4AF37]/20" />

        {/* Elemento decorativo topo */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white text-xs font-medium tracking-wide">
            <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse" />
            Plataforma Segura SSL 256-bit
          </div>
          <span className="text-white/70 text-xs tracking-widest uppercase font-serif">
            Edição Exclusive
          </span>
        </div>

        {/* Citação Inspiradora Centro-Inferior */}
        <div className="relative z-10 my-auto py-10">
          <div className="w-12 h-0.5 bg-gradient-to-r from-[#D4AF37] to-transparent mb-6" />
          <blockquote className="font-serif text-2xl xl:text-3xl font-medium text-white leading-relaxed tracking-wide drop-shadow-md">
            &ldquo;Realce a beleza que existe em cada detalhe. Gerencie sua clínica com{' '}
            <span className="text-[#F1E5C8] italic font-semibold">precisão e cuidado</span>.&rdquo;
          </blockquote>
          <p className="mt-4 text-sm text-[#F1E5C8]/80 font-sans tracking-wide">
            Tecnologia pensada exclusivamente para clínicas de estética e dermatologia de
            excelência.
          </p>
        </div>

        {/* Selo no canto inferior */}
        <div className="relative z-10 flex items-center justify-between pt-6 border-t border-white/15">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#D4AF37] text-white flex items-center justify-center shadow-gold-btn">
              <BadgeCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white tracking-wider uppercase">
                Premium Estética CRM
              </p>
              <p className="text-[11px] text-white/70">
                Homologado para clínicas de alta performance
              </p>
            </div>
          </div>
          <div className="flex -space-x-1">
            <div className="w-2 h-2 rounded-full bg-[#D4AF37]" />
            <div className="w-2 h-2 rounded-full bg-[#F1E5C8]" />
            <div className="w-2 h-2 rounded-full bg-white" />
          </div>
        </div>
      </div>
    </div>
  )
}
