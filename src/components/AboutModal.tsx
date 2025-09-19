
import ReactModal from 'react-modal';
import { Descriptions, characters } from '../../data/characters';
import closeImg from '../../assets/close.svg';
import { useMemo } from 'react';
import { SpritesheetData } from '../../data/spritesheets/types';

const modalStyles: ReactModal.Styles = {
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    zIndex: 50,
  },
  content: {
    top: '0',
    left: '0',
    right: '0',
    bottom: '0',
    border: 'none',
    background: 'transparent',
    padding: '0',
    overflow: 'hidden',
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
      <div className="w-full h-full relative flex flex-col items-center justify-center font-body game-background overflow-auto p-4 sm:p-8">
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

        <div className="relative z-10 text-center text-white w-full max-w-5xl">
          <h1 className="text-6xl sm:text-7xl lg:text-8xl font-bold font-display game-title">
            AI Salvador
          </h1>
          <h2 className="mt-8 text-2xl sm:text-3xl font-display text-white/80 tracking-widest">
            Starring
          </h2>

          <div className="mt-6 flex flex-wrap justify-center items-start gap-x-6 gap-y-8 sm:gap-x-8">
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
                    className="bg-black/40 border border-white/20 backdrop-blur-sm rounded-full shadow-2xl overflow-hidden flex items-center justify-center"
                    style={{
                      width: frontFrame ? frontFrame.w * 2 : 96,
                      height: frontFrame ? frontFrame.h * 2 : 96,
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
                  <span className="mt-3 font-bold text-lg leading-tight agent-name-plate">
                    {agent.name}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="mt-12 text-lg sm:text-xl md:text-2xl text-white/90 italic max-w-3xl mx-auto">
            "A virtual town where AI characters live, chat, socialize, hustle, HODL and party."
          </p>
        </div>
      </div>
    </ReactModal>
  );
}
