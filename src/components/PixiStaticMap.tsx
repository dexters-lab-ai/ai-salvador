import { Container, Sprite, AnimatedSprite as PixiAnimatedSprite } from '@pixi/react';
import * as PIXI from 'pixi.js';
import { WorldMap } from '../../convex/aiTown/worldMap';
import { useMemo, useEffect, useState, memo } from 'react';

// Animation configurations with direct paths
import * as campfire from '../../data/animations/campfire.json';
import * as gentlesparkle from '../../data/animations/gentlesparkle.json';
import * as gentlewaterfall from '../../data/animations/gentlewaterfall.json';
import * as gentlesplash from '../../data/animations/gentlesplash.json';
import * as windmill from '../../data/animations/windmill.json';

const animations: Record<string, { spritesheet: any; url: string }> = {
  'campfire.json': { spritesheet: campfire, url: '/assets/spritesheets/campfire.png' },
  'gentlesparkle.json': {
    spritesheet: gentlesparkle,
    url: '/assets/spritesheets/gentlesparkle32.png',
  },
  'gentlewaterfall.json': {
    spritesheet: gentlewaterfall,
    url: '/assets/spritesheets/gentlewaterfall32.png',
  },
  'windmill.json': { spritesheet: windmill, url: '/assets/spritesheets/windmill.png' },
  'gentlesplash.json': {
    spritesheet: gentlesplash,
    url: '/assets/spritesheets/gentlewaterfall32.png',
  },
};

const StaticMapTiles = memo(({ map, textures }: { map: WorldMap; textures: PIXI.Texture[] }) => {
  const sprites: JSX.Element[] = [];
  const allLayers = [...map.bgTiles, ...map.objectTiles];
  for (let layerIndex = 0; layerIndex < allLayers.length; layerIndex++) {
    const layer = allLayers[layerIndex];
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tileIndex = layer[x][y];
        if (tileIndex !== -1 && textures[tileIndex]) {
          sprites.push(
            <Sprite
              key={`tile-${layerIndex}-${x}-${y}`}
              texture={textures[tileIndex]}
              x={x * map.tileDim}
              y={y * map.tileDim}
              zIndex={layerIndex}
            />,
          );
        }
      }
    }
  }
  return <>{sprites}</>;
});
StaticMapTiles.displayName = 'StaticMapTiles';

const AnimatedMapSprites = memo(({ map }: { map: WorldMap }) => {
  const [sheets, setSheets] = useState<Record<string, PIXI.Spritesheet | null>>({});

  useEffect(() => {
    let isMounted = true;
    const loadSheets = async () => {
      const loadedSheets: Record<string, PIXI.Spritesheet | null> = {};
      const sheetPromises = Object.entries(animations).map(async ([sheetName, animData]) => {
        try {
          const texture = await PIXI.Assets.load(animData.url);
          const spritesheet = new PIXI.Spritesheet(texture.baseTexture, animData.spritesheet);
          await spritesheet.parse();
          loadedSheets[sheetName] = spritesheet;
        } catch (e) {
          console.error(`Failed to load spritesheet ${sheetName}`, e);
          loadedSheets[sheetName] = null;
        }
      });
      await Promise.all(sheetPromises);
      if (isMounted) setSheets(loadedSheets);
    };
    loadSheets();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <>
      {map.animatedSprites.map((spriteData, i) => {
        const sheet = sheets[spriteData.sheet];
        if (!sheet) return null;
        const animation = sheet.animations[spriteData.animation];
        if (!animation) return null;
        return (
          <PixiAnimatedSprite
            key={`anim-${i}`}
            textures={animation}
            isPlaying={true}
            animationSpeed={0.1}
            x={spriteData.x}
            y={spriteData.y}
            width={spriteData.w}
            height={spriteData.h}
            zIndex={spriteData.layer}
          />
        );
      })}
    </>
  );
});
AnimatedMapSprites.displayName = 'AnimatedMapSprites';

export const PixiStaticMap = (props: { map: WorldMap; [k: string]: any }) => {
  const { map, ...containerProps } = props;
  const textures = useMemo(() => {
    let tilesetUrl = map.tileSetUrl;
    if (!tilesetUrl.startsWith('http') && !tilesetUrl.startsWith('/') && !tilesetUrl.startsWith('.')) {
      tilesetUrl = `/${tilesetUrl}`;
    }
    const baseTexture = PIXI.BaseTexture.from(tilesetUrl, {
      scaleMode: PIXI.SCALE_MODES.NEAREST,
    });
    const textures: PIXI.Texture[] = [];
    const numXTiles = Math.floor(map.tileSetDimX / map.tileDim);
    const numYTiles = Math.floor(map.tileSetDimY / map.tileDim);
    for (let y = 0; y < numYTiles; y++) {
      for (let x = 0; x < numXTiles; x++) {
        textures.push(
          new PIXI.Texture(
            baseTexture,
            new PIXI.Rectangle(x * map.tileDim, y * map.tileDim, map.tileDim, map.tileDim),
          ),
        );
      }
    }
    return textures;
  }, [map]);

  return (
    <Container
      {...containerProps}
      sortableChildren={true}
      interactive={true}
      hitArea={new PIXI.Rectangle(0, 0, map.width * map.tileDim, map.height * map.tileDim)}
    >
      <StaticMapTiles map={map} textures={textures} />
      <AnimatedMapSprites map={map} />
    </Container>
  );
};
