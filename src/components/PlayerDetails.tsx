
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import closeImg from '../../assets/close.svg';
import { SelectElement } from './Player';
import { Messages } from './Messages';
import { toastOnError } from '../toasts';
import { useSendInput } from '../hooks/sendInput';
import { Player } from '../../convex/aiTown/player';
import { GameId } from '../../convex/aiTown/ids';
import { ServerGame } from '../hooks/serverGame';
import { ChallengeModal } from './ChallengeModal';
import { useState } from 'react';
import { characters } from '../../data/characters';

export default function PlayerDetails({
  worldId,
  engineId,
  game,
  playerId,
  setSelectedElement,
  scrollViewRef,
  isMeetingActive,
}: {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  game: ServerGame;
  playerId?: GameId<'players'>;
  setSelectedElement: SelectElement;
  scrollViewRef: React.RefObject<HTMLDivElement>;
  isMeetingActive: boolean;
}) {
  const humanPlayerDoc = useQuery(api.players.user, { worldId });
  const humanPlayer = humanPlayerDoc
    ? game.world.players.get(humanPlayerDoc.id as GameId<'players'>)
    : undefined;
  const humanConversation = humanPlayer ? game.world.playerConversation(humanPlayer) : undefined;
  // Always select the other player if we're in a conversation with them.
  if (humanPlayer && humanConversation) {
    const otherPlayerIds = [...humanConversation.participants.keys()].filter(
      (p) => p !== humanPlayer.id,
    );
    playerId = otherPlayerIds[0] as GameId<'players'>;
  }

  const [challengeModalOpen, setChallengeModalOpen] = useState(false);
  const player = playerId && game.world.players.get(playerId);
  const portfolio = useQuery(
    api.economy.getPortfolio,
    playerId ? { playerId } : 'skip',
  );
  const playerConversation = player && game.world.playerConversation(player);

  const previousConversation = useQuery(
    api.world.previousConversation,
    playerId ? { worldId, playerId } : 'skip',
  );

  const playerDescription = playerId && game.playerDescriptions.get(playerId);

  const startConversation = useSendInput(engineId, 'startConversation');
  const acceptInvite = useSendInput(engineId, 'acceptInvite');
  const rejectInvite = useSendInput(engineId, 'rejectInvite');
  const leaveConversation = useSendInput(engineId, 'leaveConversation');

  if (!playerId && !isMeetingActive) {
    return (
      <div className="h-full text-xl flex text-center items-center p-4">
        Click on an agent on the map to see chat history.
      </div>
    );
  }

  if (isMeetingActive) {
    return (
      <Messages
        worldId={worldId}
        engineId={engineId}
        inConversationWithMe={false}
        conversation={{
          kind: 'archived',
          doc: { _id: 'meeting' } as any, // Dummy for meeting notes
        }}
        humanPlayer={humanPlayer}
        scrollViewRef={scrollViewRef}
        isMeetingActive={isMeetingActive}
      />
    );
  }
  if (!player) {
    return null;
  }

  const isMe = humanPlayer && player.id === humanPlayer.id;
  const canInvite = !isMe && !playerConversation && humanPlayer && !humanConversation;
  const sameConversation =
    !isMe &&
    humanPlayer &&
    humanConversation &&
    playerConversation &&
    humanConversation.id === playerConversation.id;

  const humanStatus =
    humanPlayer && humanConversation && humanConversation.participants.get(humanPlayer.id)?.status;
  const playerStatus = playerConversation && playerId ? playerConversation.participants.get(playerId)?.status : undefined;

  const haveInvite = sameConversation && humanStatus?.kind === 'invited';
  const waitingForAccept =
    sameConversation && playerId && playerConversation?.participants.get(playerId)?.status.kind === 'invited';
  const waitingForNearby =
    sameConversation && playerStatus?.kind === 'walkingOver' && humanStatus?.kind === 'walkingOver';

  const inConversationWithMe =
    sameConversation &&
    playerStatus?.kind === 'participating' &&
    humanStatus?.kind === 'participating';

  const onStartConversation = async () => {
    if (!humanPlayer || !playerId) {
      return;
    }
    console.log(`Starting conversation`);
    await toastOnError(startConversation({ playerId: humanPlayer.id, invitee: playerId }));
  };
  const onAcceptInvite = async () => {
    if (!humanPlayer || !humanConversation || !playerId) {
      return;
    }
    await toastOnError(
      acceptInvite({
        playerId: humanPlayer.id,
        conversationId: humanConversation.id,
      }),
    );
  };
  const onRejectInvite = async () => {
    if (!humanPlayer || !humanConversation) {
      return;
    }
    await toastOnError(
      rejectInvite({
        playerId: humanPlayer.id,
        conversationId: humanConversation.id,
      }),
    );
  };
  const onLeaveConversation = async () => {
    if (!humanPlayer || !inConversationWithMe || !humanConversation) {
      return;
    }
    await toastOnError(
      leaveConversation({
        playerId: humanPlayer.id,
        conversationId: humanConversation.id,
      }),
    );
  };

  const pendingSuffix = (s: string) => '';
  const isBukele = playerDescription?.name === 'President Bukele';
  const playerCharacter = characters.find(c => c.name === humanPlayer?.characterName);
  const bukeleCharacter = characters.find(c => c.name === playerDescription?.character);

  return (
    <>
      {isBukele && (
        <ChallengeModal
          isOpen={challengeModalOpen}
          onClose={() => setChallengeModalOpen(false)}
          playerSprite={playerCharacter?.textureUrl ?? ''}
          presidentSprite={bukeleCharacter?.textureUrl ?? ''}
        />
      )}
      <div className="flex gap-4 items-center">
        <div className="box flex-grow">
          <h2 className="bg-brown-700 p-2 font-display text-xl sm:text-2xl tracking-wider shadow-solid text-center">
            {playerDescription?.name}
          </h2>
          <div className="bg-brown-600 p-2 text-center">
            <p className="text-lg font-bold text-yellow-300">
              {(portfolio?.btcBalance ?? 0).toFixed(4)} BTC
            </p>
          </div>
        </div>
        <a
          className="button flex-shrink-0 text-white shadow-solid cursor-pointer pointer-events-auto flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12"
          onClick={() => setSelectedElement(undefined)}
        >
          <div className="h-full w-full bg-clay-700 flex items-center justify-center">
            <img className="w-4 h-4 sm:w-5 sm:h-5" src={closeImg} />
          </div>
        </a>
      </div>
      {canInvite && (
        <a
          className={
            'mt-6 button text-white shadow-solid text-xl cursor-pointer pointer-events-auto' +
            pendingSuffix('startConversation')
          }
          onClick={onStartConversation}
        >
          <div className="h-full bg-clay-700 text-center">
            <span>Start conversation</span>
          </div>
        </a>
      )}
      {waitingForAccept && (
        <a className="mt-6 button text-white shadow-solid text-xl cursor-pointer pointer-events-auto opacity-50">
          <div className="h-full bg-clay-700 text-center">
            <span>Waiting for accept...</span>
          </div>
        </a>
      )}
      {waitingForNearby && (
        <a className="mt-6 button text-white shadow-solid text-xl cursor-pointer pointer-events-auto opacity-50">
          <div className="h-full bg-clay-700 text-center">
            <span>Walking over...</span>
          </div>
        </a>
      )}
      {inConversationWithMe && (
        <a
          className={
            'mt-6 button text-white shadow-solid text-xl cursor-pointer pointer-events-auto' +
            pendingSuffix('leaveConversation')
          }
          onClick={onLeaveConversation}
        >
          <div className="h-full bg-clay-700 text-center">
            <span>Leave conversation</span>
          </div>
        </a>
      )}
      {haveInvite && (
        <>
          <a
            className={
              'mt-6 button text-white shadow-solid text-xl cursor-pointer pointer-events-auto' +
              pendingSuffix('acceptInvite')
            }
            onClick={onAcceptInvite}
          >
            <div className="h-full bg-clay-700 text-center">
              <span>Accept</span>
            </div>
          </a>
          <a
            className={
              'mt-6 button text-white shadow-solid text-xl cursor-pointer pointer-events-auto' +
              pendingSuffix('rejectInvite')
            }
            onClick={onRejectInvite}
          >
            <div className="h-full bg-clay-700 text-center">
              <span>Reject</span>
            </div>
          </a>
        </>
      )}
      {!playerConversation && player.activity && player.activity.until > Date.now() && (
        <div className="box flex-grow mt-6">
          <div className="bg-brown-700 text-base sm:text-lg text-center p-2">
            {player.activity.description}
          </div>
          {player.activity.article && (
            <div className="p-4 bg-brown-200 text-black">
              <h3 className="font-bold font-display text-lg tracking-wide">{player.activity.article.headline}</h3>
              <p className="text-xs text-gray-600 my-1">Source: {player.activity.article.source}</p>
              {player.activity.article.imageUrl && <img src={player.activity.article.imageUrl} className="my-2 w-full rounded-sm shadow-lg" alt={player.activity.article.headline} />}
              <p className="text-sm mt-2 leading-snug text-justify font-body">{player.activity.article.content}</p>
            </div>
          )}
        </div>
      )}
      {isBukele && (
        <a
          className={'mt-6 button text-white shadow-solid text-xl cursor-pointer pointer-events-auto'}
          onClick={() => setChallengeModalOpen(true)}
        >
          <div className="h-full bg-clay-700 text-center">
            <span>Challenge for BTC</span>
          </div>
        </a>
      )}
      <div className="desc my-6">
        <p className="leading-tight -m-4 bg-brown-700 text-base sm:text-sm">
          {!isMe && playerDescription?.description}
          {isMe && <i>This is you!</i>}
          {!isMe && inConversationWithMe && (
            <>
              <br />
              <br />(<i>Conversing with you!</i>)
            </>
          )}
        </p>
      </div>
      {!isMe && playerConversation && playerStatus?.kind === 'participating' && (
        <Messages
          worldId={worldId}
          engineId={engineId}
          inConversationWithMe={inConversationWithMe ?? false}
          conversation={{ kind: 'active', doc: playerConversation }}
          humanPlayer={humanPlayer}
          scrollViewRef={scrollViewRef}
          isMeetingActive={isMeetingActive}
        />
      )}
      {!playerConversation && previousConversation && (
        <>
          <div className="box flex-grow">
            <h2 className="bg-brown-700 text-lg text-center">Previous conversation</h2>
          </div>
          <Messages
            worldId={worldId}
            engineId={engineId}
            inConversationWithMe={false}
            conversation={{ kind: 'archived', doc: previousConversation }}
            humanPlayer={humanPlayer}
            scrollViewRef={scrollViewRef}
            isMeetingActive={isMeetingActive}
          />
        </>
      )}
    </>
  );
}
