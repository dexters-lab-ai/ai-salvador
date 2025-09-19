
import { Graphics, Sprite, useTick } from '@pixi/react';
import { Graphics as PixiGraphics, Ticker } from 'pixi.js';
import { useState, useCallback } from 'react';

export const PartyEffects = ({ isPartyActive, tileDim }: { isPartyActive: boolean; tileDim: number }) => {
  const [t, setT] = useState(0);
  // useTick callback receives (delta: number, ticker: Ticker) in @pixi/react v7.1.0
  useTick((delta: number) => {
    if (isPartyActive) {
      setT((prevT) => prevT + delta);
    }
  });

  const drawLights = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      if (!isPartyActive) return;

      const partyCenterX = (40 + 51) / 2 * tileDim;
      const partyCenterY = (9 + 14) / 2 * tileDim;
      const radius = 10 * tileDim;
      
      const time = t / 30;
      
      const alpha = 0.2 + (Math.sin(time) * 0.5 + 0.5) * 0.2;
      const scale = 1.0 + (Math.sin(time * 0.7) * 0.5 + 0.5) * 0.1;

      g.beginFill(0xffcc00, alpha);
      g.drawCircle(partyCenterX, partyCenterY, radius * scale);
      g.endFill();
    },
    [t, isPartyActive, tileDim],
  );

  const tentX = 40 * tileDim;
  const tentY = 8 * tileDim;
  const scaleY = 1 + Math.sin(t / 10) * 0.05; // Elastic bounce
  const anchorY = 1; // Pivot at the bottom

  const fireX = 45 * tileDim;
  const fireY = 11 * tileDim;
  const fireScale = isPartyActive ? 1.5 + Math.sin(t / 15) * 0.1 : 1.0;

  return (
    <>
      <Graphics draw={drawLights} />
      <Sprite
        image="/assets/spritesheets/tent.png"
        x={tentX}
        y={tentY + 32} // adjust y based on anchor
        scale={{ x: 1, y: scaleY }}
        anchor={{ x: 0, y: anchorY }}
      />
      <Sprite
        image="/assets/spritesheets/campfire.png"
        x={fireX}
        y={fireY}
        scale={fireScale}
        anchor={0.5}
      />
    </>
  );
};
