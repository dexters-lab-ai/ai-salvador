import express from 'express';
import dotenv from 'dotenv';
import { Connection, Keypair, PublicKey, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createTransferInstruction } from '@solana/spl-token';
import axios from 'axios';
import { v } from 'convex/values'; // Import v explicitly for Convex action definitions
import bs58 from 'bs58';
import winston from 'winston';
import { api } from './convex/_generated/api'; // Import api to call Convex functions

// Load environment variables
dotenv.config();

const app = express();
app.use(express.json());

// Logging setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

// Solana connection and wallet
const connection = new Connection(process.env.SOLANA_RPC!, 'confirmed');
const wallet = Keypair.fromSecretKey(bs58.decode(process.env.WALLET_PRIVATE_KEY!));
const usdcAddress = new PublicKey(process.env.USDC_ADDRESS!);
const facilitatorUrl = process.env.FACILITATOR_URL!;

// x402 payment middleware
const paymentMiddleware = (payTo: PublicKey, routes: { [key: string]: { amount: number; description: string } }) => {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Check if the current route matches any of the defined payment routes
    const routeKeys = Object.keys(routes).filter(r => {
      // Handle dynamic segments like /agent/:agentId/talk
      const routeRegex = new RegExp(`^${r.replace(/:[a-zA-Z0-9]+/g, '[^/]+')}$`);
      return routeRegex.test(req.path);
    });

    if (routeKeys.length > 0) {
      const matchedRoute = routeKeys[0]; // Use the first matched route
      const { amount, description } = routes[matchedRoute];

      const paymentRequired = {
        x402Version: 1,
        accepts: [
          {
            scheme: 'exact',
            network: 'mainnet-beta', // Ensure this matches your network
            maxAmountRequired: (amount * 1e6).toString(), // 6 decimals for USDC
            resource: `${req.protocol}://${req.get('host')}${req.path}`, // Use req.path for dynamic routes
            description,
            mimeType: 'application/json',
            payTo: payTo.toBase58(),
            maxTimeoutSeconds: 30,
            asset: usdcAddress.toBase58(),
            extra: { name: 'USDC', version: '1' },
          },
        ],
        error: null,
      };

      if (!req.headers['x-payment']) {
        logger.info('Payment required', { route: req.path, paymentRequired });
        return res.status(402).json(paymentRequired);
      }

      const paymentHeader = req.headers['x-payment'] as string;
      try {
        const paymentPayload = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());

        if (paymentPayload.scheme === 'exact' && paymentPayload.x402Version === 1 && paymentPayload.network === 'mainnet-beta') {
          const verifyResponse = await axios.post(`${facilitatorUrl}/verify`, {
            x402Version: 1,
            paymentHeader,
            paymentRequirements: paymentRequired.accepts[0],
          });

          if (verifyResponse.data.isValid) {
            req.body.paymentVerified = true;
            req.body.paymentAmount = amount;
            req.body.paymentRequirements = paymentRequired.accepts[0];
            req.body.x402TxHash = paymentPayload.payload.txHash; // Extract client-provided txHash
            logger.info('Payment verified', { route: req.path, amount, txHash: req.body.x402TxHash });
            next();
          } else {
            logger.warn('Payment verification failed', { route: req.path, reason: verifyResponse.data.invalidReason });
            return res.status(402).json({ ...paymentRequired, error: verifyResponse.data.invalidReason || 'Verification failed' });
          }
        } else {
          logger.warn('Invalid payment scheme or network in x-payment header', { route: req.path, paymentPayload });
          return res.status(402).json({ ...paymentRequired, error: 'Invalid payment scheme or network' });
        }
      } catch (error) {
        logger.error('Facilitator error during verification', { error });
        return res.status(500).json({ ...paymentRequired, error: 'Facilitator unavailable or invalid payment header' });
      }
    } else {
      next(); // No payment required for this route
    }
  };
};

// Local facilitator server for production (replace with Coinbase facilitator in prod)
const startFacilitator = () => {
  const facilitatorApp = express();
  facilitatorApp.use(express.json());

  facilitatorApp.post('/verify', async (req: express.Request, res: express.Response) => {
    const { paymentHeader, paymentRequirements } = req.body;
    try {
      const payload = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());
      const isValid = payload.payload.amount === paymentRequirements.maxAmountRequired;
      logger.info('Facilitator: Payment verification', { isValid, amount: payload.payload.amount, required: paymentRequirements.maxAmountRequired });
      res.json({ isValid, invalidReason: isValid ? null : 'Amount mismatch' });
    } catch (error) {
      logger.error('Facilitator: Verification error', { error });
      res.status(400).json({ isValid: false, invalidReason: 'Invalid payload' });
    }
  });

  facilitatorApp.post('/settle', async (req: express.Request, res: express.Response) => {
    const { paymentHeader, paymentRequirements } = req.body;
    try {
      const payload = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());
      const destinationATA = await getAssociatedTokenAddress(usdcAddress, new PublicKey(paymentRequirements.payTo));
      // In prod, `userWallet` should be extracted from `payload` (e.g., from a signed message)
      // or from client authentication, not randomly generated.
      // For this example, we assume `payload` contains a `userPublicKey` or similar.
      const userPublicKey = new PublicKey(payload.payload.userPublicKey || Keypair.generate().publicKey.toBase58()); 
      const sourceATA = await getAssociatedTokenAddress(usdcAddress, userPublicKey);
      
      const transaction = new Transaction().add(
        createTransferInstruction(
          sourceATA,
          destinationATA,
          userPublicKey, // Payer's public key
          BigInt(payload.payload.amount),
          [],
          TOKEN_PROGRAM_ID
        )
      );

      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey; // Server's wallet pays for gas
      
      // The `userWallet` here is purely for signing the transaction (if it's a server-initiated transfer).
      // In a client-initiated x402 flow, the client has already signed their part.
      // For this simplified facilitator, we'll use the server's wallet to send.
      const signature = await connection.sendTransaction(transaction, [wallet], { 
        skipPreflight: true, 
        commitment: 'confirmed',
      });
      await connection.confirmTransaction(signature, { commitment: 'confirmed' });

      logger.info('Facilitator: Payment settled', { txHash: signature, from: userPublicKey.toBase58(), to: destinationATA.toBase58(), amount: payload.payload.amount / 1e6 });
      res.json({ success: true, txHash: signature, networkId: 'mainnet-beta' });
    } catch (error) {
      logger.error('Facilitator: Settlement error', { error });
      res.status(500).json({ success: false, error: 'Settlement failed', txHash: null, networkId: null });
    }
  });

  // New endpoint for Convex to trigger reward distribution
  facilitatorApp.post('/distribute-reward', async (req: express.Request, res: express.Response) => {
    const { receiverWallet, amount, rewardId } = req.body;
    try {
      const receiverPubkey = new PublicKey(receiverWallet);
      const receiverATA = await getAssociatedTokenAddress(usdcAddress, receiverPubkey);
      const serverATA = await getAssociatedTokenAddress(usdcAddress, wallet.publicKey);

      const transaction = new Transaction().add(
        createTransferInstruction(
          serverATA,
          receiverATA,
          wallet.publicKey, // Server's wallet is the payer
          BigInt(amount * 1e6), // USDC has 6 decimals
          [],
          TOKEN_PROGRAM_ID
        )
      );

      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey; // Server's wallet pays for gas

      const signature = await connection.sendTransaction(transaction, [wallet], {
        skipPreflight: true,
        commitment: 'confirmed',
      });
      await connection.confirmTransaction(signature, { commitment: 'confirmed' });

      logger.info('Facilitator: Reward distributed', { txHash: signature, receiver: receiverWallet, amount });
      res.json({ success: true, txHash: signature, networkId: 'mainnet-beta' });
    } catch (error) {
      logger.error('Facilitator: Reward distribution error', { error, receiverWallet, amount, rewardId });
      res.status(500).json({ success: false, error: 'Reward distribution failed', txHash: null, networkId: null });
    }
  });

  facilitatorApp.get('/supported', (req: express.Request, res: express.Response) => {
    res.json({ kinds: [{ scheme: 'exact', network: 'mainnet-beta' }], });
  });

  facilitatorApp.listen(4000, () => logger.info('Facilitator running on port 4000'));
};

startFacilitator();

// Payment routes using the middleware
app.use(
  paymentMiddleware(wallet.publicKey, {
    '/join': { amount: 0.1, description: 'Payment to join X402 AI Town' }, // 0.1 USDC to join
    '/agent/:agentId/talk': { amount: 0.1, description: 'Payment to talk to Agent' }, // 0.1 USDC per talk
  })
);

// Join game endpoint
app.post('/join', async (req: express.Request, res: express.Response) => {
  if (!req.body.paymentVerified) {
    logger.warn('Unauthorized join attempt (payment not verified)');
    return res.status(402).json({ error: 'Payment required and not verified' });
  }

  const userWallet = req.body.wallet as string; // User's Solana wallet address
  if (!userWallet || !PublicKey.isOnCurve(new PublicKey(userWallet))) {
    logger.error('Invalid wallet address received in /join', { userWallet });
    return res.status(400).json({ error: 'Invalid wallet address' });
  }

  try {
    // Call Convex mutation to process the join payment, which updates user status and logs the payment
    const convexResult = await api.x402.handleJoinPayment({
      payerWallet: userWallet,
      amount: req.body.paymentAmount,
      txHash: req.body.x402TxHash, // Use the txHash extracted from the X-PAYMENT header
    });

    if (convexResult.success) {
      logger.info('User joined and Convex updated', { wallet: userWallet, txHash: req.body.x402TxHash });
      res.status(200).json({ success: true, message: 'Joined game successfully', transaction: req.body.x402TxHash });
    } else {
      logger.error('Convex handleJoinPayment failed unexpectedly', { convexResult });
      res.status(500).json({ error: 'Internal server error processing join' });
    }
  } catch (error: any) {
    logger.error('Error in /join endpoint', { error: error.message, userWallet });
    res.status(500).json({ error: error.message || 'Server error during join' });
  }
});

// Talk to agent endpoint
app.post('/agent/:agentId/talk', async (req: express.Request, res: express.Response) => {
  const agentId = req.params.agentId; // Agent GameId string
  if (!req.body.paymentVerified) {
    logger.warn('Unauthorized talk attempt (payment not verified)', { agentId });
    return res.status(402).json({ error: 'Payment required and not verified' });
  }

  const userWallet = req.body.wallet as string; // User's Solana wallet address
  const userMessage = req.body.message || 'Hello, Agent!';

  try {
    // Call Convex mutation to process the talk payment, which logs payment and triggers game logic
    const convexResult = await api.x402.handleTalkPayment({
      payerWallet: userWallet,
      agentId: agentId,
      message: userMessage,
      amount: req.body.paymentAmount,
      txHash: req.body.x402TxHash, // Use the txHash extracted from the X-PAYMENT header
    });

    if (convexResult.success) {
      logger.info('Talk payment processed and Convex updated', { agentId, message: userMessage, txHash: req.body.x402TxHash });
      const responseMessage = `Agent ${agentId} says: Thanks for talking!`; // Simplified agent response for now
      res.status(200).json({ success: true, agentId, response: responseMessage, transaction: req.body.x402TxHash });
    } else {
      logger.error('Convex handleTalkPayment failed unexpectedly', { convexResult });
      res.status(500).json({ error: 'Internal server error processing talk' });
    }
  } catch (error: any) {
    logger.error('Error in /agent/:agentId/talk endpoint', { error: error.message, agentId, userWallet });
    res.status(500).json({ error: error.message || 'Server error during talk' });
  }
});

// Start server
const PORT = 3000;
app.listen(PORT, () => logger.info(`x402 Server running on port ${PORT}`));

// Convex actions definitions (kept for completeness, assuming they are in a Convex file)
// Note: These actions are meant to be defined in Convex, not directly in this Express server.
// They are included here as a reference from the original prompt.
// For the actual application, ensure they reside in your Convex functions (e.g., convex/x402.ts, convex/economy.ts).

// Example of a Convex action.
// If this were in a Convex file, it would interact with the Convex DB directly.
/*
export const updateUserJoinStatus = action({
  args: { wallet: v.string(), isJoined: v.boolean() },
  handler: async (ctx, { wallet, isJoined }) => {
    const user = await ctx.db.query('users').filter((q) => q.eq(q.field('wallet'), wallet)).first();
    if (user) {
      await ctx.db.patch(user._id, { isJoined });
    } else {
      await ctx.db.insert('users', { wallet, isJoined, createdAt: Date.now() });
    }
    logger.info('User status updated in Convex', { wallet, isJoined });
    return { success: true };
  },
});
*/

// Example of reward distribution Convex action.
// This is now superseded by the `determineAndQueueReward` and `queueSolanaReward` flow.
/*
export const distributeRewards = action({
  args: { agentId: v.number() }, // Simplified agentId to number for this example
  handler: async (ctx, { agentId }) => {
    const users = await ctx.db.query('users').filter((q) => q.eq(q.field('isJoined'), true)).collect();
    if (!users.length) {
      logger.warn('No joined users for rewards');
      throw new Error('No joined users found');
    }
    const winnerCount = Math.floor(Math.random() * 3) + 1;
    const winners = new Set<string>();
    while (winners.size < winnerCount && winners.size < users.length) {
      const randomIndex = Math.floor(Math.random() * users.length);
      winners.add(users[randomIndex].wallet);
    }

    const rewardAmount = 0.005; // 0.005 USDC

    for (const winnerWallet of winners) {
      try {
        // Here, you would typically call an external service (like this Express server's /distribute-reward endpoint)
        // or directly execute Solana transaction if Convex had direct Solana SDK access.
        logger.info('Simulating reward distribution', { winnerWallet, rewardAmount });
        // In a real flow, this would involve a real Solana transaction via the facilitator
        const dummyTxHash = `reward-tx-${Date.now()}-${winnerWallet.substring(0, 5)}`;
        // Then record in Convex:
        // await ctx.db.insert('rewards', {
        //   receiverWallet: winnerWallet,
        //   amount: rewardAmount,
        //   status: 'distributed',
        //   txHash: dummyTxHash,
        //   timestamp: Date.now(),
        // });
        console.log(`Simulated Reward sent to ${winnerWallet}: ${dummyTxHash}`);
      } catch (error) {
        logger.error('Error distributing reward', { error, winnerWallet });
      }
    }
    return { agentId, winners: Array.from(winners), status: 'success' };
  },
});
*/