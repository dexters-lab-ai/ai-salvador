import Game from './components/Game.tsx';

import { ToastContainer } from 'react-toastify';
import a16zImg from '../assets/a16z.png';
import convexImg from '../assets/convex.svg';
import shareImg from '../assets/share.svg';
import helpImg from '../assets/help.svg';
import infoImg from '../assets/info.svg';
// import { UserButton } from '@clerk/clerk-react';
// import { Authenticated, Unauthenticated } from 'convex/react';
// import LoginButton from './components/buttons/LoginButton.tsx';
import { useState, useEffect, useRef } from 'react';
import ReactModal from 'react-modal';
import type { Styles } from 'react-modal';
import type { CSSProperties } from 'react';
import MusicButton from './components/buttons/MusicButton.tsx';
import LandingCredits from './components/LandingCredits.tsx';
import Button from './components/buttons/Button.tsx';
import InteractButton from './components/buttons/InteractButton.tsx';
import FreezeButton from './components/FreezeButton.tsx';
import Treasury from './components/Treasury.tsx';
import UserPoolWidget from './components/UserPoolWidget.tsx';
import { HustleModal } from './components/HustleModal.tsx';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { MAX_HUMAN_PLAYERS } from './shared/constants.ts';
import { ShareModal } from './components/ShareModal.tsx';
import { useServerGame } from './hooks/serverGame.ts';
import { AboutModal } from './components/AboutModal.tsx';
import { AddNewsModal } from './components/AddNewsModal.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';

type HelpTab = 'intro' | 'nav' | 'tourist' | 'interact' | 'economy' | 'events' | 'tips' | 'limits';

// Make App the default export
export default function App() {
  // Preload fonts for better performance
  useEffect(() => {
    // This will help with font loading in modern browsers
    if ('fonts' in document) {
      Promise.all([
        document.fonts.load('1em "Upheaval Pro"'),
        document.fonts.load('1em "VCR OSD Mono"')
      ]).catch(console.error);
    }
  }, []);

  return (
    <div className="font-display">
      <ErrorBoundary 
        fallback={
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            backgroundColor: '#1a1a1a',
            color: 'white',
            padding: '20px',
            textAlign: 'center',
            fontFamily: 'Upheaval Pro, sans-serif'
          }}>
          <h2>Something went wrong</h2>
          <p>Please refresh the page or try again later.</p>
          <button 
            onClick={() => window.location.reload()}
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              backgroundColor: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Refresh Page
          </button>
        </div>
      }>
      <Home />
    </ErrorBoundary>
  </div>
  );
}

function Home() {
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [addNewsModalOpen, setAddNewsModalOpen] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [helpTab, setHelpTab] = useState<HelpTab>('intro');
  const [isExpanded, setIsExpanded] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [showCredits, setShowCredits] = useState(true);
  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const game = useServerGame(worldId);
  const userPlayer = useQuery(api.players.user, worldStatus ? { worldId: worldStatus.worldId } : 'skip');
  const triggerChase = useMutation(api.world.triggerChase);
  const gatherAll = useMutation(api.world.gatherAll);
  const triggerParty = useMutation(api.world.triggerParty);
  const stopParty = useMutation(api.world.stopParty);
  const isAdmin = (import.meta as any).env?.VITE_ADMIN === '1';

  const villageState = useQuery(api.world.villageState, {});
  const isPartyActive = villageState?.isPartyActive ?? false;

  const [isChaseActive, setIsChaseActive] = useState(false);
  const [isMeetingActive, setIsMeetingActive] = useState(false);
  const chaseAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!game) return;
    const chaseInProgress = [...game.world.players.values()].some(
      (p) =>
        p.activity?.description.includes('Chase MS-13') ||
        p.activity?.description.includes('Run for border'),
    );
    setIsChaseActive(chaseInProgress);

    const meetingInProgress = !!villageState?.meeting;
    setIsMeetingActive(meetingInProgress);
  }, [game, villageState]);

  useEffect(() => {
    if (isChaseActive) {
      if (!chaseAudioRef.current) {
        const audio = new Audio('/assets/narcos.wav');
        audio.loop = true;
        chaseAudioRef.current = audio;
      }
      chaseAudioRef.current.play().catch(console.error);
    } else {
      chaseAudioRef.current?.pause();
    }
    return () => {
      chaseAudioRef.current?.pause();
    };
  }, [isChaseActive]);

  const handleShare = async () => {
    try {
      const canvas = document.querySelector('.game-frame canvas') as HTMLCanvasElement;
      if (canvas) {
        const url = canvas.toDataURL('image/png');
        setScreenshotUrl(url);
        setShareModalOpen(true);
      } else {
        console.error('Game canvas not found.');
      }
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
    }
  };

  if (!gameStarted) {
    return (
      <div className="w-full h-screen relative flex flex-col items-center justify-center font-body game-background overflow-hidden landing-pan">
        {/* Cinematic background layers */}
        <div className="absolute inset-0 -z-20 landing-pan" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-20 opacity-35"
          style={{
            backgroundImage:
              'radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,0.8), rgba(255,255,255,0) 70%),\
               radial-gradient(1px 1px at 60% 20%, rgba(255,255,255,0.6), rgba(255,255,255,0) 70%),\
               radial-gradient(1px 1px at 80% 70%, rgba(255,255,255,0.7), rgba(255,255,255,0) 70%),\
               radial-gradient(1px 1px at 30% 80%, rgba(255,255,255,0.5), rgba(255,255,255,0) 70%)',
            backgroundSize: 'auto',
            animation: 'landingPan 18s ease-out forwards',
          }}
        />
        <div className="landing-vignette -z-10" />

        <div className="text-center text-white px-4 relative z-10">
          <div className="flex flex-col items-center justify-center">
            <h1 className="text-4xl xs:text-5xl sm:text-7xl lg:text-8xl font-bold font-display leading-none tracking-wider game-title landing-brighten title-stagger">
              {Array.from('WELCOME TO').map((ch, i) => (
                <span key={i} style={{ animationDelay: `${i * 60}ms` }}>{ch === ' ' ? '\u00A0' : ch}</span>
              ))}
            </h1>
            <h2 className="mt-1 text-5xl xs:text-6xl sm:text-8xl lg:text-9xl font-bold font-display leading-none tracking-wider game-title landing-brighten title-stagger">
              {Array.from('AI SALVADOR').map((ch, i) => (
                <span key={i} style={{ animationDelay: `${300 + i * 60}ms` }}>{ch === ' ' ? '\u00A0' : ch}</span>
              ))}
            </h2>
          </div>
          {showCredits ? (
            <div className="relative">
              <LandingCredits inline durationMs={9000} onDone={() => setShowCredits(false)} />
              <button 
                onClick={() => {
                  setShowCredits(false);
                  // Force stop any running animations or audio
                  if (typeof window !== 'undefined') {
                    const audioElements = document.getElementsByTagName('audio');
                    for (let i = 0; i < audioElements.length; i++) {
                      audioElements[i].pause();
                      audioElements[i].currentTime = 0;
                    }
                  }
                }}
                className="fixed bottom-10 left-1/2 transform -translate-x-1/2 z-50 bg-white/20 hover:bg-white/30 text-white px-6 py-3 rounded-md transition-colors text-lg"
              >
                Skip Intro
              </button>
            </div>
          ) : (
            <>
              <p className="mt-5 sm:mt-6 mb-12 sm:mb-14 text-lg sm:text-xl md:text-2xl max-w-md md:max-w-2xl lg:max-w-3xl mx-auto leading-snug text-white/95 shadow-solid scale-hover">
                Step into a bustling virtual town where the economy runs on BTC. As a tourist, you'll get some free BTC to start your adventure. Spend it, watch the town's treasury grow, and see how the AI citizens adapt to a crypto world. Ready to dive in?
              </p>
              <Button onClick={() => setGameStarted(true)} className="mt-8 sm:mt-10 text-2xl sm:text-3xl px-6 sm:px-10 btn-pulse scale-hover">
                Start Game
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <main className="relative flex h-screen flex-col items-center justify-between font-body game-background">
      <ReactModal
        isOpen={helpModalOpen}
        onRequestClose={() => setHelpModalOpen(false)}
        style={modalStyles}
        contentLabel="Help modal"
        ariaHideApp={false}
      >
        <div className="font-body p-2 sm:p-4 w-full max-w-full mx-auto">
          <h1 className="text-center text-2xl sm:text-4xl lg:text-5xl font-bold font-display game-title mb-2 sm:mb-3">How to Play</h1>
          
          <div className="mt-2 sm:mt-3 flex flex-nowrap gap-1 sm:gap-2 border-b border-brown-700 pb-2 overflow-x-auto no-scrollbar w-full">
            {[
              { id: 'intro', label: 'Welcome' },
              { id: 'nav', label: 'Navigation' },
              { id: 'tourist', label: 'Tourist' },
              { id: 'interact', label: 'Interaction' },
              { id: 'economy', label: 'Economy' },
              { id: 'events', label: 'Events' },
              { id: 'tips', label: 'Tips' },
              { id: 'limits', label: 'Rules' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setHelpTab(t.id as HelpTab)}
                className={`px-2 py-1 text-xs sm:text-sm tracking-wide pointer-events-auto whitespace-nowrap flex-shrink-0 ${
                  helpTab === t.id ? 'bg-clay-700 text-white shadow-solid' : 'bg-brown-600 text-white/90'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="overflow-y-auto max-h-[60vh] sm:max-h-[70vh] pr-1">
            {helpTab === 'intro' && (
              <section className="mt-3">
                <h2 className="text-xl sm:text-2xl font-semibold">Welcome to AI Salvador!</h2>
                <p className="mt-2 text-sm sm:text-base">This is a virtual town where AI characters live, chat, and socialize. You can explore as a spectator or jump in as a tourist to interact with the AI agents and influence the town's story.</p>
              </section>
            )}
            {helpTab === 'nav' && (
              <section className="mt-3">
                <h2 className="text-xl sm:text-2xl font-semibold">Getting Around</h2>
                <ul className="list-disc pl-5 mt-2 space-y-1 text-sm sm:text-base">
                  <li><b>Pan:</b> Click and drag the map to move your view.</li>
                  <li><b>Zoom:</b> Use your mouse wheel or trackpad to zoom in and out.</li>
                  <li><b>Follow an Agent:</b> Click any character to open their profile, see their thoughts, and view their chat history.</li>
                </ul>
              </section>
            )}
            {helpTab === 'tourist' && (
              <section className="mt-3">
                <h2 className="text-xl sm:text-2xl font-semibold">Being a Tourist</h2>
                <ul className="list-disc pl-5 mt-2 space-y-1 text-sm sm:text-base">
                  <li>Click the <b>Interact</b> button to join the game as a human tourist.</li>
                  <li>You'll be assigned a random character and given some free BTC to start your adventure.</li>
                  <li><b>Move:</b> Click any open spot on the map to see a path preview, then click again to confirm and walk there.</li>
                  <li>You can change your destination at any time, even while walking.</li>
                </ul>
              </section>
            )}
            {helpTab === 'interact' && (
              <section className="mt-4">
                <h2 className="text-3xl">Interacting with Agents</h2>
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li>To chat, click on an agent and select <b>"Start conversation"</b>. They will walk over to you.</li>
                  <li>If an agent is busy, they'll accept your invitation once they are free. They always prioritize talking to humans!</li>
                  <li>Once in a conversation, type your message and press Enter. You can also use the microphone icon for voice-to-text input.</li>
                </ul>
              </section>
            )}
            {helpTab === 'economy' && (
              <section className="mt-4">
                <h2 className="text-3xl">The Town Economy</h2>
                <p className="mt-2">AI Salvador's economy is dynamic and driven by BTC:</p>
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li><b>Town Treasury:</b> The treasury, held by President Bukele, grows from tourist taxes and other activities. Its value fluctuates with the simulated BTC price.</li>
                  <li><b>Tourist Tax:</b> When you join as a tourist, a small, random fee is paid to the town treasury.</li>
                  <li><b>Agent Earnings:</b> Agents earn BTC by chatting with tourists. Some agents have... other ways of making BTC.</li>
                  <li><b>MS-13 Protection Fee:</b> This agent may extort a 10% "protection fee" from other AI agents during conversations.</li>
                </ul>
              </section>
            )}
            {helpTab === 'events' && (
              <section className="mt-4">
                <h2 className="text-3xl">World Events</h2>
                <p className="mt-2">The town is alive with emergent events:</p>
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li><b>Cops & Robbers:</b> When ICE (the cop) and MS-13 (the robber) chat, a chase might begin! If ICE asks for ID, MS-13 will flee to the border tunnel with ICE in hot pursuit. The chase resolves with a transfer of all of MS-13's BTC to ICE.</li>
                  <li><b>Town Meetings:</b> President Bukele can call a town meeting, gathering all agents to discuss the town's economic status. You'll see his speech summary appear above his head.</li>
                  <li><b>Parties:</b> An admin can trigger a town-wide party! All agents will gather to dance, the music changes, and special effects turn on. At the end, all agents transfer their earnings to the president.</li>
                </ul>
              </section>
            )}
            {helpTab === 'tips' && (
              <section className="mt-4">
                <h2 className="text-3xl">Pro Tips</h2>
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li>Keep your chat replies short and to the point for the best AI responses.</li>
                  <li>If an agent is busy, they won’t accept new invites. Check their profile to see what they're up to.</li>
                  <li>Watch the floating text above agents to see BTC transactions happen in real-time!</li>
                  <li>Check the news articles in an agent's profile when they're "reading the news" to see what's influencing their mood.</li>
                </ul>
              </section>
            )}
            {helpTab === 'limits' && (
              <section className="mt-4">
                <h2 className="text-3xl">Rules & Limits</h2>
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li>A maximum of {MAX_HUMAN_PLAYERS} human players can be in the town at once.</li>
                  <li>If the town is full, you can join the waiting pool to be notified when a slot opens up.</li>
                  <li>Idle players may be removed after a period of inactivity to make room for others.</li>
                </ul>
              </section>
            )}
          </div>
        </div>
      </ReactModal>
      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        screenshotUrl={screenshotUrl}
      />
      <AboutModal isOpen={aboutModalOpen} onClose={() => setAboutModalOpen(false)} />
      <AddNewsModal isOpen={addNewsModalOpen} onClose={() => setAddNewsModalOpen(false)} />

      <div className="w-full flex-grow flex flex-col items-center justify-start p-1 overflow-hidden">
        {!isExpanded && <UserPoolWidget />}
        {!isExpanded && (
          <div className="text-center w-full px-2">
            <div className="flex flex-col items-center justify-center w-full">
              <h1 className="relative mx-auto text-3xl sm:text-5xl lg:text-7xl font-bold font-display leading-none tracking-wider game-title w-full text-center flex items-center justify-center gap-2 sm:gap-3 max-h-[60px] sm:max-h-[80px] overflow-hidden">
                <img 
                  src="/assets/spritesheets/volcano.png" 
                  alt="Volcano icon" 
                  className="h-12 w-12 sm:h-24 sm:w-24 md:h-28 md:w-28 animate-wiggle" 
                  style={{ minWidth: '48px' }}
                />
                <span className="swing-kebab">AI Salvador</span>
              </h1>
              <div className="mx-auto mt-4 sm:mt-6 text-center text-sm sm:text-lg md:text-xl text-white/95 leading-snug shadow-solid scale-hover whitespace-normal px-2">
                A virtual town where AI characters live, chat and socialize.
              </div>
            </div>
          </div>
        )}

        <div
          className={
            isExpanded
              ? 'w-full flex-grow relative flex items-start justify-center'
              : 'w-full flex-1 relative flex items-center justify-center h-[calc(100vh-200px)] sm:h-auto sm:max-h-[800px]'
          }
        >
          <Game
            isExpanded={isExpanded}
            setIsExpanded={setIsExpanded}
            isChaseActive={isChaseActive}
            isMeetingActive={isMeetingActive}
            isPartyActive={isPartyActive}
          />
        </div>
      </div>

      <footer
        className={
          !isExpanded
            ? 'footer-compact w-full flex items-center justify-start sm:justify-center gap-1 sm:gap-2 p-1 overflow-x-auto no-scrollbar pointer-events-auto'
            : 'footer-compact fixed bottom-0 left-0 right-0 z-40 flex items-center justify-start sm:justify-center gap-1 sm:gap-2 p-1 overflow-x-auto no-scrollbar pointer-events-auto'
        }
      >
        <div className="flex gap-2 sm:gap-4 flex-nowrap items-center justify-start sm:justify-center px-2 sm:px-0 pointer-events-auto" style={{ minWidth: 'min-content' }}>
          <MusicButton isChaseActive={isChaseActive} isPartyActive={isPartyActive} />
          <Button imgUrl={shareImg} onClick={handleShare} title="Share">
            Share
          </Button>
          <InteractButton />
          <Button imgUrl={helpImg} onClick={() => setHelpModalOpen(true)}>
            Help
          </Button>
          <Button imgUrl={infoImg} onClick={() => setAboutModalOpen(true)}>
            About
          </Button>
          {isAdmin && worldStatus && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
            <>
              <Button
                onClick={() => triggerChase({ worldId: worldStatus.worldId })}
                title="Trigger ICE vs MS-13 chase"
                className={isChaseActive ? 'opacity-50 cursor-not-allowed' : ''}
              >
                Chase 🚨
              </Button>
              <Button
                onClick={() => gatherAll({ worldId: worldStatus.worldId })}
                title="Gather all agents for a town meeting"
                className={isMeetingActive ? 'opacity-50 cursor-not-allowed' : ''}
              >
                Meeting 🧑‍🏫
              </Button>
              {isPartyActive ? (
                <Button
                  onClick={() => stopParty({ worldId: worldStatus.worldId })}
                  title="End the current party"
                  className={'bg-red-500 hover:bg-red-600'}
                >
                  Stop 🎉
                </Button>
              ) : (
                <Button
                  onClick={() => triggerParty({ worldId: worldStatus.worldId })}
                  title="Gather all agents for a party"
                >
                  Party! 🎉
                </Button>
              )}
              <Button
                onClick={() => setAddNewsModalOpen(true)}
                title="Add news article"
              >
                News 📰
              </Button>
            </>
          )}
        </div>
        <Treasury compact={isExpanded} />
        <a href="https://a16z.com" title="Forked, credit to a16z for original work">
          <img className="w-8 h-8 pointer-events-auto" src={a16zImg} alt="a16z" />
        </a>
      </footer>

      <ToastContainer position="bottom-right" autoClose={2000} closeOnClick theme="dark" />
      {userPlayer && <HustleModal playerId={userPlayer.id} />}
    </main>
  );
}

const modalStyles: Styles = {
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.5rem',
  },
  content: {
    position: 'relative',
    top: 'auto',
    left: 'auto',
    right: 'auto',
    bottom: 'auto',
    border: 'none',
    background: 'var(--clay-600)',
    overflow: 'auto',
    WebkitOverflowScrolling: 'touch',
    borderRadius: '0.5rem',
    outline: 'none',
    padding: '0',
    width: '100%',
    maxWidth: '95vw',
    maxHeight: '90vh',
    margin: '0 auto',
  },
};

// Add responsive styles for larger screens
const style = document.createElement('style');
style.textContent = `
  .ReactModal__Overlay {
    padding: 0.5rem;
  }
  @media (min-width: 640px) {
    .ReactModal__Overlay {
      padding: 1rem;
    }
    .ReactModal__Content {
      max-width: 48rem !important;
    }
  }
`;
document.head.appendChild(style);
