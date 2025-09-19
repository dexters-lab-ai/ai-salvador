import clsx from 'clsx';
import { Doc, Id } from '../../convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { MessageInput } from './MessageInput';
import { Player } from '../../convex/aiTown/player';
import { Conversation } from '../../convex/aiTown/conversation';
import { useEffect, useMemo, useRef } from 'react';

export function Messages({
  worldId,
  engineId,
  conversation,
  inConversationWithMe,
  humanPlayer,
  scrollViewRef,
  isMeetingActive,
}: {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  conversation:
    | { kind: 'active'; doc: Conversation }
    | { kind: 'archived'; doc: Doc<'archivedConversations'> };
  inConversationWithMe: boolean;
  humanPlayer?: Player;
  scrollViewRef: React.RefObject<HTMLDivElement>;
  isMeetingActive: boolean;
}) {
  const humanPlayerId = humanPlayer?.id;
  const descriptions = useQuery(api.world.gameDescriptions, { worldId });
  const messages = useQuery(api.messages.listMessages, {
    worldId,
    conversationId: conversation.doc.id,
  });
  const meetingNotes = useQuery(api.world.getLatestMeetingNotes, worldId ? { worldId } : 'skip');

  let currentlyTyping = conversation.kind === 'active' ? conversation.doc.isTyping : undefined;
  if (messages !== undefined && currentlyTyping) {
    if (messages.find((m) => m.messageUuid === currentlyTyping!.messageUuid)) {
      currentlyTyping = undefined;
    }
  }
  const currentlyTypingName =
    currentlyTyping &&
    descriptions?.playerDescriptions.find((p) => p.playerId === currentlyTyping?.playerId)?.name;

  // Find the other participant (agent) to fetch their latest news memory
  let otherPlayerId: string | undefined = undefined;
  if (isMeetingActive) {
    // In meeting mode, we don't need to find another participant
    return null;
  } else if (conversation.kind === 'active') {
    const participants = conversation.doc?.participants;
    if (participants) {
      const ids = [...participants.keys()];
      otherPlayerId = ids.find((id) => id !== humanPlayerId);
    }
  } else if (conversation.kind === 'archived') {
    const participants = conversation.doc?.participants;
    if (participants) {
      otherPlayerId = humanPlayerId ? participants.find((id) => id !== humanPlayerId) : participants[0];
    }
  }
  const latestNews = useQuery(
    api.agent.memory.getLatestNewsMemoryPublic,
    otherPlayerId ? { playerId: otherPlayerId as any } : 'skip',
  );
  // If the other agent is actively reading the news, prefer their current activity.article
  const otherActivity = useQuery(
    api.world.getPlayerActivity,
    otherPlayerId ? ({ worldId, playerId: otherPlayerId as any } as any) : 'skip',
  );

  const scrollView = scrollViewRef.current;
  const isScrolledToBottom = useRef(false);
  useEffect(() => {
    if (!scrollView) return undefined;

    const onScroll = () => {
      isScrolledToBottom.current = !!(
        scrollView && scrollView.scrollHeight - scrollView.scrollTop - 50 <= scrollView.clientHeight
      );
    };
    scrollView.addEventListener('scroll', onScroll);
    return () => scrollView.removeEventListener('scroll', onScroll);
  }, [scrollView]);
  useEffect(() => {
    if (isScrolledToBottom.current) {
      scrollViewRef.current?.scrollTo({
        top: scrollViewRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, currentlyTyping]);

  // TTS: speak agent messages (not human) as they arrive
  const spoken = useRef<Set<string>>(new Set());
  // On conversation switch or unmount, cancel any ongoing TTS and reset spoken set
  useEffect(() => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    // Cancel anything currently speaking when this conversation changes
    if (synth) try { synth.cancel(); } catch {}
    spoken.current.clear();
    return () => {
      const s = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
      if (s) try { s.cancel(); } catch {}
      spoken.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.doc.id]);
  const agentMessages = useMemo(
    () => (messages ?? []).filter((m) => m.author !== humanPlayerId),
    [messages, humanPlayerId],
  );

  useEffect(() => {
    if (inConversationWithMe) {
      // Don't play TTS if the human is in this conversation.
      return;
    }
    const synth = window.speechSynthesis;
    if (!synth) return;
    const voices = synth.getVoices();
    const pickVoice = (name?: string) => {
      const female = ['Alice', 'Stella', 'Kira'];
      const male = ['ICE', 'MS-13', 'President Bukele', 'Alex', 'Lucky', 'Bob', 'Kurt', 'Pete'];
      const preferFemale = name ? female.some((n) => name.includes(n)) : false;
      const preferMale = name ? male.some((n) => name.includes(n)) : false;
      // Try to pick a gendered voice name if available
      const byName = (needle: string) =>
        voices.find((v) => v.name.toLowerCase().includes(needle));
      if (preferFemale) return byName('female') || byName('google uk english female') || voices[0];
      if (preferMale) return byName('male') || byName('google uk english male') || voices[0];
      return voices[0];
    };
    for (const m of agentMessages) {
      const key = String(m._id);
      if (spoken.current.has(key)) continue;
      spoken.current.add(key);
      const utter = new SpeechSynthesisUtterance(m.text);
      utter.rate = 1.0;
      utter.pitch = 1.0;
      utter.voice = pickVoice(m.authorName);
      try {
        synth.speak(utter);
      } catch {}
    }
  }, [agentMessages, inConversationWithMe]);
  if (messages === undefined) {
    // Render minimal container to keep hook order stable
    return <div className="p-2 text-sm opacity-70">Loading messages…</div>;
  }
  // Always render the container so we can show typing or structural UI even before the first message
  const messageNodes: { time: number; node: React.ReactNode }[] = messages.map((m) => {
    const node = (
      <div key={`text-${m._id}`} className="leading-tight mb-6">
        <div className="flex gap-4">
          <span className="uppercase flex-grow">{m.authorName}</span>
          <time dateTime={m._creationTime.toString()}>
            {new Date(m._creationTime).toLocaleString()}
          </time>
        </div>
        <div className={clsx('bubble', m.author === humanPlayerId && 'bubble-mine')}>
          <p className="bg-white -mx-3 -my-1">{m.text}</p>
        </div>
      </div>
    );
    return { node, time: m._creationTime };
  });
  const lastMessageTs = messages.map((m) => m._creationTime).reduce((a, b) => Math.max(a, b), 0);

  const membershipNodes: typeof messageNodes = [];
  if (conversation.kind === 'active') {
    for (const [playerId, m] of conversation.doc.participants) {
      const playerName = descriptions?.playerDescriptions.find((p) => p.playerId === playerId)
        ?.name;
      let started;
      if (m.status.kind === 'participating') {
        started = m.status.started;
      }
      if (started) {
        membershipNodes.push({
          node: (
            <div key={`joined-${playerId}`} className="leading-tight mb-6">
              <p className="text-brown-700 text-center">{playerName} joined the conversation.</p>
            </div>
          ),
          time: started,
        });
      }
    }
  } else {
    for (const playerId of conversation.doc.participants) {
      const playerName = descriptions?.playerDescriptions.find((p) => p.playerId === playerId)
        ?.name;
      const started = conversation.doc.created;
      membershipNodes.push({
        node: (
          <div key={`joined-${playerId}`} className="leading-tight mb-6">
            <p className="text-brown-700 text-center">{playerName} joined the conversation.</p>
          </div>
        ),
        time: started,
      });
      const ended = conversation.doc.ended;
      membershipNodes.push({
        node: (
          <div key={`left-${playerId}`} className="leading-tight mb-6">
            <p className="text-brown-700 text-center">{playerName} left the conversation.</p>
          </div>
        ),
        // Always sort all "left" messages after the last message.
        // TODO: We can remove this once we want to support more than two participants per conversation.
        time: Math.max(lastMessageTs + 1, ended),
      });
    }
  }
  const nodes = [...messageNodes, ...membershipNodes];
  nodes.sort((a, b) => a.time - b.time);
  return (
    <div className="chats text-base sm:text-sm">
      <div className="bg-brown-200 text-black p-2">
        {isMeetingActive && meetingNotes && (
          <div className="mb-4">
            <div className="relative mx-auto max-w-xl bg-white text-black p-3 shadow-solid border-4 border-brown-700">
              <div className="text-center font-display text-xl">Town Meeting Notes</div>
              <div className="mt-1 text-xs text-gray-600">
                {new Date(meetingNotes._creationTime).toLocaleString()}
              </div>
              <div className="mt-2 italic">{meetingNotes.description}</div>
            </div>
          </div>
        )}
        {/* Prefer live article if the other agent is actively reading the news */}
        {otherActivity?.description?.toLowerCase().includes('news') && otherActivity?.article && !isMeetingActive ? (
          <div className="mb-4">
            <div className="relative mx-auto max-w-xl bg-white text-black p-3 shadow-solid border-4 border-brown-700">
              <div className="text-center font-display text-xl">Reading News</div>
              <div className="mt-1 text-xs text-gray-600 flex items-center justify-between">
                <span className="uppercase tracking-wide font-semibold">{otherActivity.article.source}</span>
              </div>
              <div className="mt-2 font-semibold">{otherActivity.article.headline}</div>
              {otherActivity.article.imageUrl && (
                <img src={otherActivity.article.imageUrl} alt="News" className="w-full h-auto my-2" />
              )}
              <div className="mt-2 italic whitespace-pre-wrap">{otherActivity.article.content}</div>
            </div>
          </div>
        ) : latestNews && !isMeetingActive && (
          <div className="mb-4">
            <div className="relative mx-auto max-w-xl bg-white text-black p-3 shadow-solid border-4 border-brown-700">
              <div className="text-center font-display text-xl">Daily Gazette</div>
              <div className="mt-1 text-xs text-gray-600">
                {new Date(latestNews._creationTime).toLocaleString()}
              </div>
              {(() => {
                const text = latestNews?.description ?? '';
                // Try to extract an image URL from the description if present
                const match = text.match(/https?:[^\s)]+\.(png|jpe?g|webp|gif)(\?[^\s)]*)?/i);
                const url = match?.[0];
                return url ? (
                  <img src={url} alt="News article image" className="w-full h-auto my-2" />
                ) : null;
              })()}
              <div className="mt-2 italic">{latestNews.description}</div>
            </div>
          </div>
        )}
        {nodes.length > 0 && nodes.map((n) => n.node)}
        {currentlyTyping && currentlyTyping.playerId !== humanPlayerId && (
          <div key="typing" className="leading-tight mb-6">
            <div className="flex gap-4">
              <span className="uppercase flex-grow">{currentlyTypingName}</span>
              <time dateTime={currentlyTyping.since.toString()}>
                {new Date(currentlyTyping.since).toLocaleString()}
              </time>
            </div>
            <div className={clsx('bubble')}>
              <p className="bg-white -mx-3 -my-1">
                <i>typing...</i>
              </p>
            </div>
          </div>
        )}
        {humanPlayer && inConversationWithMe && conversation.kind === 'active' && (
          <MessageInput
            worldId={worldId}
            engineId={engineId}
            conversation={conversation.doc}
            humanPlayer={humanPlayer}
          />
        )}
      </div>
    </div>
  );
}
