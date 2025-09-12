import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import Modal from 'react-modal';

Modal.setAppElement('#root');

export const HustleModal = ({ playerId }: { playerId: string }) => {
  const pendingHustle = useQuery(api.economy.getPendingHustle, { touristId: playerId });
  const acceptHustle = useMutation(api.economy.acceptHustle);
  const rejectHustle = useMutation(api.economy.rejectHustle);

  const handleAccept = () => {
    if (pendingHustle) {
      acceptHustle({ hustleId: pendingHustle._id });
    }
  };

  const handleReject = () => {
    if (pendingHustle) {
      rejectHustle({ hustleId: pendingHustle._id });
    }
  };

  return (
    <Modal
      isOpen={!!pendingHustle}
      onRequestClose={handleReject}
      contentLabel="Hustle Request"
      style={{
        overlay: {
          backgroundColor: 'rgba(0,0,0,0.75)',
          zIndex: 2000,
          backdropFilter: 'blur(2px)',
        },
        content: {
          inset: '50% auto auto 50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgb(35, 38, 58)',
          border: '10px solid rgb(23, 20, 33)',
          color: 'white',
          maxWidth: '460px',
          padding: '24px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        },
      }}
    >
      {pendingHustle && (
        <div>
          <h2 className="text-2xl font-bold mb-2">Hustle Request</h2>
          <p>
            An agent is trying to hustle you for {pendingHustle.amount.toFixed(4)} BTC!
          </p>
          <div className="flex justify-around mt-4">
            <button onClick={handleAccept} className="bg-green-500 text-white px-4 py-2 rounded">
              Accept
            </button>
            <button onClick={handleReject} className="bg-red-500 text-white px-4 py-2 rounded">
              Reject
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};
