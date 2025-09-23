
import ReactModal from 'react-modal';
import { Descriptions, characters } from '../../data/characters';
import closeImg from '../../assets/close.svg';
import { useMemo } from 'react';
import { SpritesheetData } from '../../data/spritesheets/types';

const modalStyles: ReactModal.Styles = {
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    zIndex: 50,
    padding: '1rem',
    margin: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(4px)',
  },
  content: {
    position: 'relative',
    border: 'none',
    background: 'transparent',
    width: '95%',
    maxWidth: '1400px',
    height: '90vh',
    margin: '0 auto',
    padding: '0',
    overflow: 'hidden',
    WebkitOverflowScrolling: 'touch',
    borderRadius: '1rem',
    outline: 'none',
  },
};

export function AboutModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const agentCast = useMemo(() => {
    const priority = ['President Bukele', 'ICE', 'MS-13', 'Alex', 'Lucky'];
    const descriptionsMap = new Map(Descriptions.map((d) => [d.name, d]));
    return priority
      .map((name) => {
        const d = descriptionsMap.get(name);
        if (!d) return null;
        const characterSheet = characters.find((c) => c.name === d.character);
        return {
          name: d.name,
          character: characterSheet,
        };
      })
      .filter((d): d is { name: string; character: (typeof characters)[0] } => d !== null && !!d.character);
  }, []);

  return (
    <ReactModal
      isOpen={isOpen}
      onRequestClose={onClose}
      style={modalStyles}
      contentLabel="About AI Salvador"
      ariaHideApp={false}
    >
      <div className="w-full h-full relative overflow-y-auto p-4 sm:p-6 md:p-8 lg:p-10" style={{
        background: 'rgba(17, 24, 39, 0.7)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '1rem',
      }}>
        <div
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: `url(/assets/background.webp)`,
            backgroundSize: 'cover',
            filter: 'blur(3px) brightness(0.6) saturate(1.2)',
          }}
        />
        <div className="landing-vignette z-0" />

        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 text-white hover:text-yellow-300 transition-colors"
        >
          <img src={closeImg} alt="Close" className="w-8 h-8" />
        </button>

        <div className="relative z-10 text-center text-white w-full">
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold font-display game-title text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-200 to-yellow-300">
            AI Salvador
          </h1>
          <h2 className="mt-4 sm:mt-6 md:mt-8 text-xl sm:text-2xl md:text-3xl font-display text-white tracking-widest font-bold">
            Starring
          </h2>

          <div className="mt-4 sm:mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-6">
            {agentCast.map((agent) => {
              const sheet = agent.character;
              const frame = (sheet.spritesheetData as SpritesheetData).frames['down']?.frame;
              const rawUrl = sheet.textureUrl;
              const normalized = rawUrl.replace(/^\/ai-town/, '');
              const base = (import.meta as any).env?.BASE_URL || '/';
              const spriteUrl = normalized.startsWith('/assets')
                ? `${base.replace(/\/$/, '')}${normalized}`
                : normalized;

              const frontFrame = (agent.character.spritesheetData as any)?.frames?.down?.frame;
              
              return (
                <div key={agent.name} className="flex flex-col items-center text-center w-28">
                  <div 
                    className="bg-gradient-to-br from-amber-100/10 to-amber-200/20 border-2 border-amber-200/30 backdrop-blur-md rounded-full shadow-2xl overflow-hidden flex items-center justify-center transition-all duration-300 hover:scale-105 hover:shadow-amber-200/20"
                    style={{
                      width: frontFrame ? frontFrame.w * 2.2 : 105,
                      height: frontFrame ? frontFrame.h * 2.2 : 105,
                      boxShadow: '0 0 20px rgba(253, 230, 138, 0.2)',
                    }}
                  >
                    {frame && spriteUrl && (
                      <img
                        src={spriteUrl}
                        alt={agent.name}
                        style={{
                          width: 'auto',
                          height: 'auto',
                          objectFit: 'none',
                          objectPosition: `-${frame.x}px -${frame.y}px`,
                          transform: 'scale(2)',
                          transformOrigin: 'top left',
                          imageRendering: 'pixelated',
                        }}
                      />
                    )}
                  </div>
                  <div className="mt-3 text-base font-bold bg-gradient-to-r from-amber-200 to-yellow-300 text-transparent bg-clip-text">
                    {agent.name}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-12 text-lg sm:text-xl md:text-2xl text-white/90 italic max-w-3xl mx-auto">
            "A virtual town where AI characters live, chat, socialize, hustle, HODL and party."
          </p>
        </div>

        {/* Contract Address Section */}
        <div className="mt-16 mb-8 w-[400px] mx-auto p-6 rounded-xl bg-gradient-to-r from-amber-900/40 to-amber-800/30 border border-amber-600/40 backdrop-blur-md shadow-lg">
          <div className="flex flex-col items-center">
            <div className="w-full">
              <div className="flex items-center gap-3">
                <span className="text-amber-300 font-bold text-lg">CA: </span>
                <div className="flex-1 min-w-0">
                  <span className="text-amber-100 font-mono text-sm sm:text-base break-words leading-relaxed">
                    EN6Up48xxFTmj1ngb4xSbArixMmebL1TmWURcuA8pump
                  </span>
                </div>
                <button 
                  onClick={(e) => {
                    navigator.clipboard.writeText('EN6Up48xxFTmj1ngb4xSbArixMmebL1TmWURcuA8pump');
                    const button = e.currentTarget;
                    const tooltip = button.nextElementSibling as HTMLElement;
                    tooltip.classList.remove('opacity-0', 'invisible');
                    setTimeout(() => {
                      tooltip.classList.add('opacity-0', 'invisible');
                    }, 2000);
                  }}
                  className="flex-shrink-0 p-2 rounded-full bg-amber-900/50 hover:bg-amber-800/70 transition-colors group relative"
                  aria-label="Copy to clipboard"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-amber-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 invisible transition-all duration-200 group-hover:opacity-100 group-hover:visible">
                    Copy to clipboard
                  </span>
                </button>
              </div>
            </div>
            
            <a 
              href="https://x.com/ai_town_meme" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center text-amber-200 hover:text-amber-100 transition-colors"
            >
              <span className="mr-2">Follow us on</span>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </ReactModal>
  );
}
