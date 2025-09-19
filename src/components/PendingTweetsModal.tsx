

import ReactModal from 'react-modal';
import { useAction, useConvex, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import Button from './buttons/Button';
import { toast } from 'react-toastify';
import closeImg from '../../assets/close.svg';

const modalStyles: ReactModal.Styles = {
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    zIndex: 12,
  },
  content: {
    top: '50%',
    left: '50%',
    right: 'auto',
    bottom: 'auto',
    marginRight: '-50%',
    transform: 'translate(-50%, -50%)',
    maxWidth: '560px',
    width: '90%',
    maxHeight: '90vh',
    overflowY: 'auto',
    border: '10px solid rgb(23, 20, 33)',
    borderRadius: '0',
    background: 'rgb(35, 38, 58)',
    color: 'white',
    fontFamily: '"Upheaval Pro", "sans-serif"',
  },
};

export function PendingTweetsModal({
  isOpen,
  onClose,
  worldId,
}: {
  isOpen: boolean;
  onClose: () => void;
  worldId: Id<'worlds'>;
}) {
  const pendingTweets = useQuery(api.world.getPendingTweets, { worldId });
  const sendTweet = useAction(api.agent.twitter.sendTweetWithImage);
  const convex = useConvex();

  const handlePost = async (tweet: any) => {
    try {
      toast.info('Capturing screenshot...');
      const canvas = document.querySelector('.game-frame canvas') as HTMLCanvasElement;
      if (!canvas) {
        toast.error('Game canvas not found.');
        return;
      }
      const dataUrl = canvas.toDataURL('image/png');
      const blob = await (await fetch(dataUrl)).blob();

      toast.info('Uploading screenshot...');
// Fix: Correct path to agentComposeTweet
      const storageId = await (convex as any).storage.store(blob);

      toast.info('Posting tweet...');
      await sendTweet({ pendingTweetId: tweet._id, storageId });
      toast.success('Tweet posted!');
    } catch (error) {
      console.error('Failed to post tweet:', error);
      toast.error('Failed to post tweet.');
    }
  };

  return (
    <ReactModal
      isOpen={isOpen}
      onRequestClose={onClose}
      style={modalStyles}
      contentLabel="Pending Tweets"
      ariaHideApp={false}
    >
      <div className="font-body p-4">
        <h1 className="text-center text-4xl font-bold font-display game-title">Pending Tweets</h1>
        <button onClick={onClose} className="absolute top-4 right-4">
          <img src={closeImg} className="w-6 h-6" />
        </button>
        <div className="mt-6 space-y-4">
          {!pendingTweets || pendingTweets.length === 0 ? (
            <p className="text-center text-white/80">No pending tweets to review.</p>
          ) : (
            pendingTweets.map((tweet) => (
              <div
                key={tweet._id.toString()}
                className="p-3 bg-brown-900 border-2 border-brown-700 rounded"
              >
                <p className="text-lg">
                  <strong className="font-display tracking-wider text-yellow-300">
                    {tweet.player.name}:
                  </strong>
                  <span className="italic text-white/90"> "{tweet.text}"</span>
                </p>
                <div className="flex justify-end mt-3">
                  <Button onClick={() => handlePost(tweet)}>Post with Screenshot</Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </ReactModal>
  );
}
