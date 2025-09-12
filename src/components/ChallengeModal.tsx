import ReactModal from 'react-modal';

const modalStyles: ReactModal.Styles = {
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    zIndex: 1000,
  },
  content: {
    top: '0',
    left: '0',
    right: '0',
    bottom: '0',
    border: 'none',
    background: 'transparent',
    padding: '0',
  },
};

export const ChallengeModal = ({ isOpen, onClose, playerSprite, presidentSprite }: {
  isOpen: boolean;
  onClose: () => void;
  playerSprite: string;
  presidentSprite: string;
}) => {
  if (!isOpen) return null;

  return (
    <ReactModal isOpen={isOpen} onRequestClose={onClose} style={modalStyles} contentLabel="Challenge Modal">
      <div className="w-full h-full bg-black bg-opacity-80 flex flex-col items-center justify-center text-white font-display">
        <h1 className="text-6xl mb-8 game-title">Challenge for BTC!</h1>
        <div className="w-full flex justify-between items-end px-16" style={{ height: '50%' }}>
          <img src={playerSprite} className="w-32 h-32" alt="Player" />
          <img src={presidentSprite} className="w-32 h-32" alt="President" />
        </div>
        <div className="w-3/4 h-1/2 bg-gray-800 border-4 border-white rounded-lg mt-8">
          {/* Game Area */}
        </div>
        <button onClick={onClose} className="mt-8 text-2xl button">Close</button>
      </div>
    </ReactModal>
  );
};
