/* 404 Page - Displays when a user attempts to access a non-existent route - translate to the language of the user */
import { useLocation } from 'react-router-dom'
import { useEffect } from 'react'

const NotFound = () => {
  const location = useLocation()

  useEffect(() => {
    console.error('404 Error: User attempted to access non-existent route:', location.pathname)
  }, [location.pathname])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FFF8ED] text-[#2D2A26] font-sans px-4">
      <div className="text-center max-w-md p-8 bg-white rounded-2xl border border-[#F1E5C8] shadow-gold">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full border-2 border-[#D4AF37] flex items-center justify-center bg-[#FFF8ED]">
          <span className="font-serif text-2xl font-bold text-[#D4AF37]">404</span>
        </div>
        <h1 className="font-serif text-2xl font-bold mb-2 text-[#2D2A26]">Página não encontrada</h1>
        <p className="text-sm text-[#6B6560] mb-6">A rota informada não existe ou foi movida.</p>
        <a
          href="/"
          className="inline-flex items-center justify-center px-6 py-2.5 rounded-lg bg-[#D4AF37] hover:bg-[#B8960E] text-white text-sm font-semibold shadow-gold-btn transition-colors"
        >
          Voltar para o início
        </a>
      </div>
    </div>
  )
}

export default NotFound
