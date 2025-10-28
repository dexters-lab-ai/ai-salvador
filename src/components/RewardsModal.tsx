import ReactModal from 'react-modal';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import clsx from 'clsx';

const modalStyles: ReactModal.Styles = {
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
    backgroundColor: '#0f172a',
    overflow: 'hidden',
    WebkitOverflowScrolling: 'touch',
    borderRadius: '0.5rem',
    outline: 'none',
    padding: '0',
    width: '100%',
    maxWidth: '95vw',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
  },
};

export function RewardsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const rewards = useQuery(api.economy.getRewardsWithDetails);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'distributed':
        return 'text-green-400';
      case 'pending':
        return 'text-yellow-400';
      case 'failed':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <ReactModal
      isOpen={isOpen}
      onRequestClose={onClose}
      style={modalStyles}
      contentLabel="Rewards Noticeboard"
      ariaHideApp={false}
    >
      <div className="bg-[#111827] border border-white/10 shadow-lg rounded-lg p-4 sm:p-6 flex flex-col h-full">
        <h1 className="text-center text-2xl sm:text-3xl font-bold font-display game-title mb-4">
          Rewards Noticeboard
        </h1>
        <p className="text-center text-sm text-slate-400 mb-6">
          A portion of x402 payments are randomly distributed back to players. Here's the latest!
        </p>
        <div className="flex-grow overflow-y-auto custom-scroll -mr-2 pr-2">
          {rewards && rewards.length > 0 ? (
            <ul className="space-y-3">
              {rewards.map((reward) => (
                <li
                  key={reward._id}
                  className="bg-black/20 p-3 rounded-md border border-white/10 transition-all hover:bg-black/30 hover:border-white/20"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-base text-white">
                        {reward.receiverName}
                      </p>
                      <p className="text-xs text-slate-400">
                        {new Date(reward.timestamp).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg text-yellow-300">
                        {reward.amount.toFixed(4)} USDC
                      </p>
                      <p className={clsx("text-xs font-mono", getStatusColor(reward.status))}>
                        {reward.status.toUpperCase()}
                      </p>
                    </div>
                  </div>
                  {reward.txHash && (
                    <a
                      href={`https://solscan.io/tx/${reward.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 text-xs mt-2 inline-block truncate w-full"
                      title={reward.txHash}
                    >
                      Tx: {reward.txHash.slice(0,10)}...{reward.txHash.slice(-10)}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center text-slate-500 py-8">
              <p>No rewards have been distributed yet.</p>
              <p className="text-sm">Start interacting to get the economy going!</p>
            </div>
          )}
        </div>
      </div>
    </ReactModal>
  );
}