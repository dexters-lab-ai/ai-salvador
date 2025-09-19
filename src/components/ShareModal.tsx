import ReactModal from 'react-modal';
import Button from './buttons/Button';

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
    maxWidth: '90%',
    width: '500px',
    maxHeight: '90vh',
    overflowY: 'auto',
    border: '10px solid rgb(23, 20, 33)',
    borderRadius: '0',
    background: 'rgb(35, 38, 58)',
    color: 'white',
    fontFamily: '"Upheaval Pro", "sans-serif"',
  },
};

export function ShareModal({
  isOpen,
  onClose,
  screenshotUrl,
}: {
  isOpen: boolean;
  onClose: () => void;
  screenshotUrl: string;
}) {
  const tweetText = `Check out AI Salvador! I'm playing in this virtual town where AI characters live, chat, and socialize. Join me at https://ai-salvador.com! #AITown`;
  const encodedTweetText = encodeURIComponent(tweetText);
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodedTweetText}`;

  const downloadScreenshot = () => {
    const link = document.createElement('a');
    link.href = screenshotUrl;
    link.download = 'ai-salvador-screenshot.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const tweetWithScreen = () => {
    downloadScreenshot();
    window.open(tweetUrl, '_blank');
    alert(
      'Your screenshot has been downloaded. Drag and drop it into your new tweet to share it!',
    );
  };

  const tweetWithoutScreen = () => {
    window.open(tweetUrl, '_blank');
  };

  return (
    <ReactModal isOpen={isOpen} onRequestClose={onClose} style={modalStyles} contentLabel="Share Modal">
      <div className="font-body text-center">
        <h1 className="text-4xl font-bold font-display game-title">Share Your Moment!</h1>
        <div className="my-4 p-2 bg-brown-900 border-2 border-brown-700 rounded">
          <p className="text-left text-sm text-white/80 italic">"{tweetText}"</p>
        </div>
        {screenshotUrl && (
          <img
            src={screenshotUrl}
            alt="AI Salvador Screenshot"
            className="w-full h-auto object-contain rounded border-2 border-brown-700 my-4"
          />
        )}
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Button onClick={tweetWithScreen}>Tweet with screenshot</Button>
          <Button onClick={tweetWithoutScreen}>Just tweet</Button>
          <Button onClick={downloadScreenshot}>Download image</Button>
        </div>
        <button
          onClick={onClose}
          className="mt-6 text-sm text-white/70 hover:text-white underline"
        >
          Close
        </button>
      </div>
    </ReactModal>
  );
}