import clsx from 'clsx';
import { useMutation, useQuery } from 'convex/react';
import { KeyboardEvent, useRef, useState, useEffect } from 'react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useSendInput } from '../hooks/sendInput';
import { Player } from '../../convex/aiTown/player';
import { Conversation } from '../../convex/aiTown/conversation';
import micImg from '../../assets/mic.svg';

export function MessageInput({
  worldId,
  engineId,
  humanPlayer,
  conversation,
}: {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  humanPlayer: Player;
  conversation: Conversation;
}) {
  const descriptions = useQuery(api.world.gameDescriptions, { worldId });
  const humanName = descriptions?.playerDescriptions.find((p) => p.playerId === humanPlayer.id)
    ?.name;
  const inputRef = useRef<HTMLParagraphElement>(null);
  const inflightUuid = useRef<string | undefined>();
  const writeMessage = useMutation(api.messages.writeMessage);
  const startTyping = useSendInput(engineId, 'startTyping');
  const currentlyTyping = conversation.isTyping;

  const [isListening, setIsListening] = useState(false);
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    // Check for speech recognition support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.warn('Speech recognition is not supported in this browser');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        console.log('Speech recognition started');
        setIsListening(true);
      };
      
      recognition.onend = () => {
        console.log('Speech recognition ended');
        setIsListening(false);
      };
      
      recognition.onerror = (event: Event) => {
        const errorEvent = event as SpeechRecognitionErrorEvent;
        console.error('Speech recognition error:', errorEvent.error);
        setIsListening(false);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interimTranscript = '';
        let finalTranscript = '';
        const results = event.results;
        for (let i = event.resultIndex; i < results.length; i++) {
          const result = results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interimTranscript += result[0].transcript;
          }
        }
        if (inputRef.current) {
          inputRef.current.innerText = finalTranscript + interimTranscript;
        }
      };

      recognitionRef.current = recognition;
      setIsSpeechSupported(true);

      return () => {
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
      };
    } catch (error) {
      console.error('Failed to initialize speech recognition:', error);
      setIsSpeechSupported(false);
    }
  }, []);

  const handleMicClick = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
    }
  };

  const onKeyDown = async (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = inputRef.current?.innerText;
      if (text && text.length > 0 && humanPlayer) {
        const messageUuid = crypto.randomUUID();
        inflightUuid.current = messageUuid;
        try {
          await writeMessage({
            worldId,
            conversationId: conversation.id,
            playerId: humanPlayer.id,
            text,
            messageUuid,
          });
          if (inputRef.current) {
            inputRef.current.innerText = '';
          }
        } finally {
          inflightUuid.current = undefined;
        }
      }
    } else {
      if (humanPlayer && !currentlyTyping) {
        const messageUuid = crypto.randomUUID();
        inflightUuid.current = messageUuid;
        try {
          await startTyping({
            playerId: humanPlayer.id,
            conversationId: conversation.id,
            messageUuid,
          });
        } finally {
          inflightUuid.current = undefined;
        }
      }
    }
  };
  return (
    <div className="flex-shrink-0 p-2 relative">
      <div className="flex gap-4">
        <span className="uppercase flex-grow">{humanName}</span>
      </div>
      <div className={clsx('bubble', 'bubble-mine')}>
        <p
          ref={inputRef}
          className="bg-white -mx-3 -my-1 text-black"
          contentEditable
          data-placeholder="Type a message..."
          onKeyDown={onKeyDown}
        />
        {isSpeechSupported && (
          <button onClick={handleMicClick} className={clsx("absolute right-2 top-2 p-1 rounded-full transition-colors", isListening ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-600')}>
            <img src={micImg} alt="Microphone" className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
