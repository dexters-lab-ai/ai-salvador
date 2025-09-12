import Game from './components/Game.tsx';

import { ToastContainer } from 'react-toastify';
import a16zImg from '../assets/a16z.png';
import convexImg from '../assets/convex.svg';
import starImg from '../assets/star.svg';
import helpImg from '../assets/help.svg';
// import { UserButton } from '@clerk/clerk-react';
// import { Authenticated, Unauthenticated } from 'convex/react';
// import LoginButton from './components/buttons/LoginButton.tsx';
import { useState } from 'react';
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

type HelpTab = 'nav' | 'tourist' | 'interact' | 'movement' | 'economy' | 'tips' | 'limits';

export default function Home() {
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [helpTab, setHelpTab] = useState<HelpTab>('nav');
  const [isExpanded, setIsExpanded] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [showCredits, setShowCredits] = useState(true);
  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const userPlayer = useQuery(api.players.user, worldStatus ? { worldId: worldStatus.worldId } : 'skip');
  const triggerChase = useMutation(api.world.triggerChase);
  const isAdmin = (import.meta as any).env?.VITE_ADMIN === '1';

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
            <h1 className="text-5xl sm:text-7xl lg:text-8xl font-bold font-display leading-none tracking-wider game-title landing-brighten title-stagger">
              {Array.from('WELCOME TO').map((ch, i) => (
                <span key={i} style={{ animationDelay: `${i * 60}ms` }}>{ch === ' ' ? '\u00A0' : ch}</span>
              ))}
            </h1>
            <h2 className="mt-1 text-6xl sm:text-8xl lg:text-9xl font-bold font-display leading-none tracking-wider game-title landing-brighten title-stagger">
              {Array.from('AI SALVADOR').map((ch, i) => (
                <span key={i} style={{ animationDelay: `${300 + i * 60}ms` }}>{ch === ' ' ? '\u00A0' : ch}</span>
              ))}
            </h2>
          </div>
          {showCredits ? (
            <LandingCredits inline durationMs={9000} onDone={() => setShowCredits(false)} />
          ) : (
            <>
              <p className="mt-5 sm:mt-6 text-lg sm:text-xl md:text-2xl max-w-md md:max-w-2xl lg:max-w-3xl mx-auto leading-snug text-white/95 shadow-solid scale-hover">
                Step into a bustling virtual town where the economy runs on BTC. As a tourist, you'll get some free BTC to start your adventure. Spend it, watch the town's treasury grow, and see how the AI citizens react to the highs and lows of the crypto market. Ready to dive in?
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
        <div className="font-body">
          <h1 className="text-center text-5xl sm:text-6xl font-bold font-display game-title">How to Play</h1>
          <p className="opacity-90 mt-2">
            Welcome to AI Salvador! Explore as a spectator or jump in as a tourist to interact with AI agents.
          </p>

          <div className="mt-4 flex flex-wrap gap-2 border-b border-brown-700 pb-2">
            {([
              { id: 'nav', label: 'Navigation' },
              { id: 'tourist', label: 'Tourist' },
              { id: 'interact', label: 'Interact' },
              { id: 'movement', label: 'Movement' },
              { id: 'economy', label: 'Economy' },
              { id: 'tips', label: 'Tips' },
              { id: 'limits', label: 'Limits' },
            ] as { id: HelpTab; label: string }[]).map((t) => (
              <button
                key={t.id}
                onClick={() => setHelpTab(t.id)}
                className={`px-3 py-1 text-sm sm:text-base tracking-wide pointer-events-auto ${
                  helpTab === t.id ? 'bg-clay-700 text-white shadow-solid' : 'bg-brown-600 text-white/90'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {helpTab === 'nav' && (
            <section className="mt-4">
              <h2 className="text-3xl">Navigation</h2>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Click and drag to pan the map.</li>
                <li>Scroll to zoom in/out.</li>
                <li>Click a character to open their profile and chat history.</li>
              </ul>
            </section>
          )}
          {helpTab === 'tourist' && (
            <section className="mt-4">
              <h2 className="text-3xl">Playing as a Tourist</h2>
              <p className="mt-2">
                Click <b>Interact</b> to join. You get a character and some free BTC to explore and chat.
              </p>
            </section>
          )}
          {helpTab === 'interact' && (
            <section className="mt-4">
              <h2 className="text-3xl">Interacting with Agents</h2>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Select an agent and click <b>Start conversation</b>. They’ll walk over to you.</li>
                <li>If they’re busy, they’ll accept once free. Humans are prioritized.</li>
                <li>Type your message and press Enter during the conversation.</li>
              </ul>
            </section>
          )}
          {helpTab === 'movement' && (
            <section className="mt-4">
              <h2 className="text-3xl">Moving Your Tourist</h2>
              <p className="mt-2">After clicking <b>Interact</b>:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Click any reachable tile to preview a path; click again to confirm and walk.</li>
                <li>You can choose a new destination at any time while walking.</li>
              </ul>
            </section>
          )}
          {helpTab === 'economy' && (
            <section className="mt-4">
              <h2 className="text-3xl">Town Economy</h2>
              <p className="mt-2">AI Salvador's economy is driven by tourism and agent interactions:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li><b>Tourist Tax:</b> A small, random amount of BTC is deducted as a tourist tax when you join the game. This contributes to the town treasury.</li>
                <li><b>Agent Earnings:</b> Agents (MCPs) earn BTC by talking to tourists and helping them. You can see their earnings on their profiles.</li>
                <li><b>President Bukele:</b> He holds the town's main BTC wallets. Challenge him to a game to win some BTC!</li>
                <li><b>MS-13 Protection Fee:</b> The MS-13 agent sometimes charges a 10% protection fee to other MCP agents during chats. You'll see green/red BTC popups when that happens.</li>
                <li><b>Border Tunnel Outcome:</b> When ICE and MS-13 reach the border tunnel, MS-13 bribes ICE and <i>all</i> MS-13 funds transfer to ICE. Later, when ICE meets President Bukele, ICE hands over all collected funds to the government.</li>
              </ul>
            </section>
          )}
          {helpTab === 'tips' && (
            <section className="mt-4">
              <h2 className="text-3xl">Tips</h2>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Keep replies short and clear for better responses.</li>
                <li>If an agent’s busy, try again shortly—they won’t accept new invites mid-chat.</li>
                <li>BTC flows during chats. Watch the <b>Treasury</b> panel for the town’s economy.</li>
                <li><b>ICE vs MS-13:</b> ICE patrols and asks about MS-13. If they meet, MS-13 shows “Run for border…” and ICE shows “Chase MS-13…”, then both head to the border tunnel. Upon arrival, MS-13 bribes ICE (MS-13 funds transfer to ICE). ICE later hands all seized funds to President Bukele during meetings.</li>
              </ul>
            </section>
          )}
          {helpTab === 'limits' && (
            <section className="mt-4">
              <h2 className="text-3xl">Limits & Timeouts</h2>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Up to {MAX_HUMAN_PLAYERS} humans can join.</li>
                <li>Idle players may be removed to free slots for others.</li>
              </ul>
            </section>
          )}
        </div>
      </ReactModal>

      <div className="w-full flex-grow flex flex-col items-center justify-start p-1">
        {!isExpanded && <UserPoolWidget />}
        {!isExpanded && (
          <div className="text-center">
            <h1 className="relative mx-auto text-5xl sm:text-8xl lg:text-9xl font-bold font-display leading-none tracking-wider game-title w-full text-left sm:text-center sm:w-auto flex items-center justify-center gap-3 max-h-[100px] overflow-hidden">
              <img src="/assets/spritesheets/volcano.png" alt="Volcano icon" className="h-36 w-36 sm:h-40 sm:w-40 animate-wiggle" />
              <span className="swing-kebab">AI Town</span>
            </h1>
            <div className="mx-auto mt-2 text-center text-base sm:text-xl md:text-2xl text-white/95 leading-snug shadow-solid scale-hover whitespace-nowrap max-w-none">
              A virtual town where AI characters live, chat and socialize.
            </div>
          </div>
        )}

        <div
          className={
            isExpanded
              ? 'w-full flex-grow relative flex items-start justify-center'
              : 'w-full flex-grow relative flex items-center justify-center max-h-[800px]'
          }
        >
          <Game isExpanded={isExpanded} setIsExpanded={setIsExpanded} />
        </div>
      </div>

      <footer
        className={
          !isExpanded
            ? 'footer-compact w-full flex items-center justify-center gap-2 p-1 flex-wrap pointer-events-none'
            : 'footer-compact fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center gap-2 p-1 pointer-events-none'
        }
      >
        <div className="flex gap-4 flex-grow max-w-[1200px] items-center justify-center pointer-events-none">
          <FreezeButton />
          <MusicButton />
          <Button href="https://twitter.com/intent/tweet?text=Playing%20AI%20Salvador%20%23AITown" title="Share on Twitter / X">
            Twitter
          </Button>
          <InteractButton />
          <Button imgUrl={helpImg} onClick={() => setHelpModalOpen(true)}>
            Help
          </Button>
          {isAdmin && worldStatus && (
            <Button
              onClick={() => triggerChase({ worldId: worldStatus.worldId })}
              title="Trigger ICE vs MS-13 cave chase"
            >
              Trigger Chase 🚨
            </Button>
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
    backgroundColor: 'rgb(0, 0, 0, 75%)',
    zIndex: 12,
  },
  content: {
    top: '50%',
    left: '50%',
    right: 'auto',
    bottom: 'auto',
    marginRight: '-50%',
    transform: 'translate(-50%, -50%)',
    maxWidth: '56%',
    maxHeight: '80vh',
    overflowY: 'auto' as CSSProperties['overflowY'],

    border: '10px solid rgb(23, 20, 33)',
    borderRadius: '0',
    background: 'rgb(35, 38, 58)',
    color: 'white',
    fontFamily: '"Upheaval Pro", "sans-serif"',
  },
};
