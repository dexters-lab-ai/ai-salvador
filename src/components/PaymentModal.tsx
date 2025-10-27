import ReactModal from 'react-modal';
import x402Button from '../../public/assets/x402-button.svg';
import { useState } from 'react';
import { toast } from 'react-toastify';

// Placeholder for external Solana interaction (client.ts logic)
// In a real app, this would involve connecting to a wallet (e.g., Phantom)
// and constructing/signing a real Solana transaction.
// For this refactor, we'll simulate it or use the provided client.ts logic.
const createPaymentPayload = async (amount: number, resource: string, serverPublicKey: string): Promise<{ paymentHeader: string; txHash: string }> => {
  // This is a placeholder. In a real app, this would involve:
  // 1. Connecting to a user's Solana wallet (e.g., Phantom).
  // 2. Getting the user's public key.
  // 3. Getting the server's associated token account (ATA) for USDC.
  // 4. Building and signing a `createTransferInstruction` for USDC.
  // 5. Sending the transaction and confirming it.
  // 6. Base64 encoding the payment details.

  // For now, simulate a successful transaction and a dummy txHash.
  const dummyTxHash = `0x${Math.random().toString(16).slice(2, 10)}${Math.random().toString(16).slice(2, 10)}`;
  const paymentPayload = {
    x402Version: 1,
    scheme: 'exact',
    network: 'mainnet-beta', // Or 'devnet' for testing
    payload: {
      amount: (amount * 1e6).toString(), // USDC usually has 6 decimals
      txHash: dummyTxHash,
    },
  };
  return {
    paymentHeader: Buffer.from(JSON.stringify(paymentPayload)).toString('base64'),
    txHash: dummyTxHash,
  };
};

const sendPaymentRequest = async (
  route: string,
  paymentHeader: string,
  paymentAmount: number,
  payerWallet: string,
): Promise<{ success: boolean; message?: string; error?: string; txHash?: string }> => {
  try {
    // In a real app, this would be your Express server URL
    const facilitatorUrl = 'http://localhost:4000'; // Or your deployed facilitator URL
    const response = await fetch(`${facilitatorUrl}${route}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PAYMENT': paymentHeader,
      },
      body: JSON.stringify({
        wallet: payerWallet, // Pass user's wallet for server-side Convex mutation
        amount: paymentAmount, // Optional: for server-side logging if needed
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      return { success: false, error: data.error || 'Payment processing failed.' };
    }
    return { success: true, message: data.message, txHash: data.transaction };
  } catch (error) {
    console.error('Error sending payment request:', error);
    return { success: false, error: 'Network error or server unavailable.' };
  }
};


const modalStyles: ReactModal.Styles = {
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    zIndex: 1001, // Higher than other modals
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
    backgroundColor: '#0b1120',
    overflow: 'hidden', // Make it compact, no scrolling inside
    WebkitOverflowScrolling: 'touch',
    borderRadius: '0.5rem',
    outline: 'none',
    padding: '1.5rem', // Compact padding
    width: '100%',
    maxWidth: '400px', // Compact width
    maxHeight: '90vh',
    margin: '0 auto',
    boxShadow: '0 20px 45px rgba(15, 23, 42, 0.55)',
  },
};

export function PaymentModal({ isOpen, onClose, paymentDetails }: {
  isOpen: boolean;
  onClose: () => void;
  paymentDetails: {
    amount: number;
    description: string;
    route: string;
    onSuccess: (txHash: string) => void;
    onFailure: (error: string) => void;
  } | null;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePayment = async () => {
    if (!paymentDetails) return;

    setIsLoading(true);
    setError(null);

    try {
      // Placeholder for user's Solana wallet address.
      // In a real app, this would come from the connected wallet.
      const payerWalletAddress = 'simulated-user-solana-wallet'; 
      const serverPublicKey = 'simulated-server-public-key'; // This should come from your .env or a config

      const { paymentHeader, txHash } = await createPaymentPayload(
        paymentDetails.amount,
        `http://localhost:4000${paymentDetails.route}`, // Resource URL for facilitator
        serverPublicKey
      );

      const response = await sendPaymentRequest(
        paymentDetails.route,
        paymentHeader,
        paymentDetails.amount,
        payerWalletAddress,
      );

      if (response.success && response.txHash) {
        paymentDetails.onSuccess(response.txHash);
      } else {
        paymentDetails.onFailure(response.error || 'Unknown payment error.');
        setError(response.error || 'Payment failed.');
      }
    } catch (e: any) {
      console.error('Payment flow error:', e);
      paymentDetails.onFailure(e.message || 'Payment initiation failed.');
      setError(e.message || 'Payment initiation failed.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!paymentDetails) return null;

  return (
    <ReactModal
      isOpen={isOpen}
      onRequestClose={onClose}
      style={modalStyles}
      contentLabel="X402 Payment Required"
      ariaHideApp={false}
    >
      <div className="flex flex-col items-center p-2 text-white font-body">
        <img src={x402Button} alt="x402 Protocol" className="w-24 h-auto mb-4" />
        <h2 className="text-2xl font-bold font-display mb-2 text-yellow-300">Payment Required</h2>
        <p className="text-center text-sm mb-4">
          {paymentDetails.description}: <b>{paymentDetails.amount.toFixed(2)} USDC</b>.
        </p>
        <p className="text-center text-xs text-gray-400 mb-6">
          This payment is processed via the x402 protocol on Solana mainnet.
        </p>

        {error && (
          <p className="text-red-400 text-sm mb-4">{error}</p>
        )}

        <button
          onClick={handlePayment}
          className="button bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors text-lg flex items-center justify-center min-w-[150px]"
          disabled={isLoading}
        >
          {isLoading ? (
            <div className="flex items-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing...
            </div>
          ) : (
            'Make Payment'
          )}
        </button>

        <p className="text-xs text-gray-500 mt-4">
          <a href="https://x402.org" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
            What is x402?
          </a>
        </p>
      </div>
    </ReactModal>
  );
}