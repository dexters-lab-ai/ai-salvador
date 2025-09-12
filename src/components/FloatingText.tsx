import { Text } from '@pixi/react';
import { useState, useEffect } from 'react';
import * as PIXI from 'pixi.js';

export const FloatingText = ({
  x,
  y,
  text,
  color = 'gold',
  onComplete,
}: {
  x: number;
  y: number;
  text: string;
  color?: string;
  onComplete: () => void;
}) => {
  const [alpha, setAlpha] = useState(1);
  const [position, setPosition] = useState({ x, y });

  useEffect(() => {
    const animationDuration = 2000; // 2 seconds
    const startTime = Date.now();

    const animate = () => {
      const elapsedTime = Date.now() - startTime;
      const progress = elapsedTime / animationDuration;

      if (progress < 1) {
        setAlpha(1 - progress);
        setPosition((prev) => ({ ...prev, y: y - progress * 50 }));
        requestAnimationFrame(animate);
      } else {
        onComplete();
      }
    };

    requestAnimationFrame(animate);
  }, [x, y, onComplete]);

  return (
    <Text
      x={position.x}
      y={position.y}
      text={text}
      anchor={{ x: 0.5, y: 0.5 }}
      style={new PIXI.TextStyle({ fontSize: 12, fill: color, fontWeight: 'bold' })}
      alpha={alpha}
    />
  );
};
