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
      className={`${compact ? 'fixed bottom-16 left-2' : `absolute ${containerPos}`} bg-brown-800/90 backdrop-blur-sm text-white rounded-lg shadow-lg cursor-pointer transition-all duration-300 z-50 pointer-events-auto ${
        isExpanded ? 'p-2' : 'p-0'
      }`}
      onClick={() => setIsExpanded(!isExpanded)}
      style={{ 
        width: isExpanded ? (window.innerWidth < 640 ? 'calc(100vw - 1rem)' : panelWidth) : 'auto',
        maxWidth: '100vw',
        overflow: 'hidden'
      }}
    >
      {/* Always show compact view on mobile */}
      <div className={`flex items-center ${isExpanded ? '' : 'p-1 sm:p-2'}`}>
        <div className={`flex items-center ${isExpanded ? '' : 'flex'}`}>
          <img 
            src={potOfGoldImg} 
            alt="Treasury" 
            className="w-8 h-8 sm:w-10 sm:h-10 mr-1 sm:mr-2" 
          />
          <div className={isExpanded ? 'block' : 'block'}>  
            {!compact && !isExpanded && <div className="font-bold text-sm sm:text-md">Treasury</div>}
            <div className={`font-bold ${compact ? 'text-sm' : 'text-base'} sm:text-lg ${sentimentColor}`}>
              {treasury.toFixed(4)} BTC
            </div>
            {!compact && !isExpanded && (
              <div className="text-xs sm:text-sm text-gray-300">
                ~${usdValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
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
            <h3 className="text-lg font-bold">Market Sentiment: <span className={sentimentColor}>
              {marketSentiment.charAt(0).toUpperCase() + marketSentiment.slice(1)}
            </span></h3>
            
            {agentPortfolios && (
              <div className="mt-3">
                <h4 className="font-semibold mb-1">Top Holders:</h4>
                <div className="space-y-1 max-h-40 overflow-y-auto pr-2 text-xs sm:text-sm">
                  {[...agentPortfolios]
                    .sort((a, b) => b.btcBalance - a.btcBalance)
                    .slice(0, 5)
                    .map((portfolio) => (
                      <div key={portfolio.name} className="flex justify-between">
                        <span className="truncate max-w-[60%] sm:max-w-[120px]">{portfolio.name}</span>
                        <span className="font-mono">{portfolio.btcBalance.toFixed(4)} BTC</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
            
            {!compact && (
              <div className="mt-4">
                <h3 className="text-lg font-bold">El Salvador's Holdings</h3>
                <p className="text-2xl font-bold text-yellow-300">6,237 BTC</p>
                <p className="text-sm text-gray-400">El Salvador's real-world BTC investment inspires our town's treasury.</p>
                <a href="https://dig.watch/updates/el-salvadors-bitcoin-reserves-surge-past-760-million" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline text-sm">
                  Learn More
                </a>
              </div>
            )}
          </div>
          
          <div className="mt-2 text-xs text-gray-400 text-center sm:text-right">
            Tap to collapse
          </div>
        </div>
      )}
    </div>
  );
}
