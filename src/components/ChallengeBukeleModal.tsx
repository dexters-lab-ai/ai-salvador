import ReactModal from 'react-modal';

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
    maxWidth: '80%',
    maxHeight: '80vh',
    overflow: 'hidden',
    border: '10px solid rgb(23, 20, 33)',
    borderRadius: '0',
    background: 'rgb(35, 38, 58)',
    color: 'white',
    fontFamily: '"Upheaval Pro", "sans-serif"',
    padding: '0',
  },
};

export function ChallengeBukeleModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <ReactModal isOpen={isOpen} onRequestClose={onClose} style={modalStyles} contentLabel="Challenge Bukele Modal">
      <div className="font-body text-center p-4">
        <h1 className="text-4xl font-bold font-display game-title">HTML5 Game</h1>
        <p className="mt-4">This is a placeholder for the HTML5 challenge game.</p>
        <button onClick={onClose} className="mt-6 button text-white shadow-solid text-xl cursor-pointer pointer-events-auto">
          <div className="h-full bg-clay-700 text-center">
            <span>Close</span>
          </div>
        </button>
      </div>
    </ReactModal>
  );
}
