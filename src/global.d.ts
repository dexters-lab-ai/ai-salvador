import { AudioContextManager } from './utils/audioContextManager';

declare global {
  interface Window {
    audioContextManager?: AudioContextManager;
  }
}
