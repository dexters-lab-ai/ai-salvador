import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import potOfGoldImg from '../../assets/ui/pot-of-gold.svg';
import clsx from 'clsx';
import { useState } from 'react';

export default function Treasury({ compact = false }: { compact?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const villageState = useQuery(api.world.villageState, {});
  const agentPortfolios = useQuery(
    api.economy.getAgentPortfolios,
    worldId ? { worldId } : 'skip',
  );

  if (!villageState) {
    return null;
  }

  const { treasury, btcPrice, marketSentiment } = villageState;
  const usdValue = treasury * btcPrice;

  const sentimentColor = clsx({
    'text-green-400': marketSentiment === 'positive',
    'text-red-400': marketSentiment === 'negative',
    'text-white': marketSentiment === 'neutral',
  });

  // In compact (max-frame) mode, pin to bottom-left and expand upward.
  const containerPos = compact ? '' : 'top-4 left-4';
  const panelWidth = compact ? 220 : 350;
  return (
    <div
      className={`${compact ? '' : `absolute ${containerPos}`} bg-brown-800 text-white rounded-lg shadow-lg cursor-pointer transition-all duration-300 z-50 pointer-events-auto ${
        isExpanded ? 'p-2' : 'p-0'
      }`}
      onClick={() => setIsExpanded(!isExpanded)}
      style={{ width: isExpanded ? panelWidth : undefined }}
    >
      {/* Compact button on mobile when not expanded */}
      <div className={`flex items-center ${isExpanded ? '' : 'sm:p-2'}`}>
        <div className={`flex items-center ${isExpanded ? '' : 'sm:flex'} ${isExpanded ? '' : 'hidden sm:flex'}`}>
          <img src={potOfGoldImg} alt="Treasury" className="w-10 h-10 mr-2" />
          <div className="hidden sm:block">
            {!compact && <div className="font-bold text-md">AI Salvador Treasury</div>}
            <div className={`font-bold ${compact ? 'text-base' : 'text-lg'} ${sentimentColor}`}>{treasury.toFixed(4)} BTC</div>
            {!compact && (
              <div className="text-sm text-gray-400">
                ~${usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            )}
          </div>
        </div>
        {/* Icon-only circular button on xs when collapsed */}
        {!isExpanded && (
          <div className="sm:hidden w-12 h-12 flex items-center justify-center">
            <img src={potOfGoldImg} alt="Treasury" className="w-8 h-8" />
          </div>
        )}
      </div>
      {isExpanded && (
        <div className={`pt-2 ${compact ? 'mb-2' : 'mt-4 pt-4'} border-t border-gray-600 space-y-4`} style={{ transform: compact ? 'translateY(-4px)' : undefined }}>
          <div>
            {!compact && (
              <>
                <h3 className="text-lg font-bold">El Salvador's Holdings</h3>
                <p className="text-2xl font-bold text-yellow-300">6,237 BTC</p>
                <p className="text-sm text-gray-400">El Salvador's real-world BTC investment inspires our town's treasury.</p>
                <a href="https://dig.watch/updates/el-salvadors-bitcoin-reserves-surge-past-760-million" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline text-sm">
                  Learn More
                </a>
              </>
            )}
          </div>
          {!compact && (
            <>
              <div className="pt-4 border-t border-gray-600">
                <h3 className="text-lg font-bold">Tourist Information</h3>
                <p className="text-2xl font-bold text-yellow-300">{villageState.touristCount} Tourists</p>
                <p className="text-sm text-gray-400">The treasury grows from tourist visits. Each tourist pays a small tax to enter.</p>
              </div>
              <div className="pt-4 border-t border-gray-600">
                <h3 className="text-lg font-bold">Agent Economy</h3>
                <p className="text-sm text-gray-400">Agents earn BTC by helping tourists. Here are their holdings:</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {agentPortfolios?.map((agent) => (
                    <li key={agent.name}>
                      {agent.name}: {agent.btcBalance.toFixed(4)} BTC
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
