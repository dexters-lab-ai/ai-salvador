import { Container, Graphics, Text } from '@pixi/react';
import { useState, useEffect, useCallback } from 'react';
import * as PIXI from 'pixi.js';

export const FloatingText = ({
  x,
  y,
  text,
  color = 'gold',
  onComplete,
  withBackground = false,
}: {
  x: number;
  y: number;
  text: string;
  color?: string;
  onComplete: () => void;
  withBackground?: boolean;
}) => {
  const [alpha, setAlpha] = useState(1);
  const [position, setPosition] = useState({ x, y });
  const [textMetrics, setTextMetrics] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const animationDuration = 3000; // 3 seconds
    const startTime = Date.now();

    const animate = () => {
      const elapsedTime = Date.now() - startTime;
      const progress = elapsedTime / animationDuration;

      if (progress < 1) {
        setAlpha(1 - progress);
        setPosition((prev) => ({ ...prev, y: y - progress * 60 }));
        requestAnimationFrame(animate);
      } else {
        onComplete();
      }
    };

    requestAnimationFrame(animate);
  }, [x, y, onComplete]);

  const textRefCallback = useCallback((node: PIXI.Text | null) => {
    if (node) {
      // Force an update to get fresh metrics
      node.updateText(true);
      setTextMetrics({ width: node.width, height: node.height });
    }
  }, []);

  const drawBackground = useCallback(
    (g: PIXI.Graphics) => {
      g.clear();
      if (textMetrics.width > 0) {
        const padding = 4;
        g.beginFill(0x000000, 0.6); // Semi-transparent black
        g.drawRoundedRect(
          -textMetrics.width / 2 - padding,
          -textMetrics.height / 2 - padding,
          textMetrics.width + padding * 2,
          textMetrics.height + padding * 2,
          8,
        );
        g.endFill();
      }
    },
    [textMetrics],
  );

  if (withBackground) {
    return (
      <Container x={position.x} y={position.y} alpha={alpha}>
        <Graphics draw={drawBackground} />
        <Text
          ref={textRefCallback}
          x={0}
          y={0}
          text={text}
          anchor={{ x: 0.5, y: 0.5 }}
          style={new PIXI.TextStyle({ fontSize: 14, fill: color, fontWeight: 'bold' })}
        />
      </Container>
    );
  }

  // Default: no background, just stroked text for transactions
  return (
    <Text
      x={position.x}
      y={position.y}
      text={text}
      anchor={{ x: 0.5, y: 0.5 }}
      style={
        new PIXI.TextStyle({
          fontSize: 14,
          fill: color,
          fontWeight: 'bold',
          stroke: '#000000',
          strokeThickness: 1, // Reduced thickness
        })
      }
      alpha={alpha}
    />
  );
};
