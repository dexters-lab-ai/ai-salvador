import { SpritesheetData } from './types';

export const data: SpritesheetData = {
  frames: {
    'walk-down-0': { frame: { x: 0, y: 0, w: 32, h: 32 }, sourceSize: { w: 32, h: 32 }, spriteSourceSize: { x: 0, y: 0 } },
    'walk-down-1': { frame: { x: 32, y: 0, w: 32, h: 32 }, sourceSize: { w: 32, h: 32 }, spriteSourceSize: { x: 0, y: 0 } },
    'walk-down-2': { frame: { x: 64, y: 0, w: 32, h: 32 }, sourceSize: { w: 32, h: 32 }, spriteSourceSize: { x: 0, y: 0 } },
    'walk-down-3': { frame: { x: 96, y: 0, w: 32, h: 32 }, sourceSize: { w: 32, h: 32 }, spriteSourceSize: { x: 0, y: 0 } },

    'walk-up-0': { frame: { x: 0, y: 32, w: 32, h: 32 }, sourceSize: { w: 32, h: 32 }, spriteSourceSize: { x: 0, y: 0 } },
    'walk-up-1': { frame: { x: 32, y: 32, w: 32, h: 32 }, sourceSize: { w: 32, h: 32 }, spriteSourceSize: { x: 0, y: 0 } },
    'walk-up-2': { frame: { x: 64, y: 32, w: 32, h: 32 }, sourceSize: { w: 32, h: 32 }, spriteSourceSize: { x: 0, y: 0 } },
    'walk-up-3': { frame: { x: 96, y: 32, w: 32, h: 32 }, sourceSize: { w: 32, h: 32 }, spriteSourceSize: { x: 0, y: 0 } },

    'walk-left-0': { frame: { x: 0, y: 64, w: 32, h: 32 }, sourceSize: { w: 32, h: 32 }, spriteSourceSize: { x: 0, y: 0 } },
    'walk-left-1': { frame: { x: 32, y: 64, w: 32, h: 32 }, sourceSize: { w: 32, h: 32 }, spriteSourceSize: { x: 0, y: 0 } },
    'walk-left-2': { frame: { x: 64, y: 64, w: 32, h: 32 }, sourceSize: { w: 32, h: 32 }, spriteSourceSize: { x: 0, y: 0 } },
    'walk-left-3': { frame: { x: 96, y: 64, w: 32, h: 32 }, sourceSize: { w: 32, h: 32 }, spriteSourceSize: { x: 0, y: 0 } },

    'walk-right-0': { frame: { x: 0, y: 96, w: 32, h: 32 }, sourceSize: { w: 32, h: 32 }, spriteSourceSize: { x: 0, y: 0 } },
    'walk-right-1': { frame: { x: 32, y: 96, w: 32, h: 32 }, sourceSize: { w: 32, h: 32 }, spriteSourceSize: { x: 0, y: 0 } },
    'walk-right-2': { frame: { x: 64, y: 96, w: 32, h: 32 }, sourceSize: { w: 32, h: 32 }, spriteSourceSize: { x: 0, y: 0 } },
    'walk-right-3': { frame: { x: 96, y: 96, w: 32, h: 32 }, sourceSize: { w: 32, h: 32 }, spriteSourceSize: { x: 0, y: 0 } },
  },
  animations: {
    'walk-down': ['walk-down-0', 'walk-down-1', 'walk-down-2', 'walk-down-3'],
    'walk-up': ['walk-up-0', 'walk-up-1', 'walk-up-2', 'walk-up-3'],
    'walk-left': ['walk-left-0', 'walk-left-1', 'walk-left-2', 'walk-left-3'],
    'walk-right': ['walk-right-0', 'walk-right-1', 'walk-right-2', 'walk-right-3'],

    'idle-down': ['walk-down-0'],
    'idle-up': ['walk-up-0'],
    'idle-left': ['walk-left-0'],
    'idle-right': ['walk-right-0'],
  },
  meta: {
    scale: '1',
  },
};

