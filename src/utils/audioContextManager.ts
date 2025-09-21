// Audio context manager to handle browser autoplay policies
class AudioContextManager {
  private static instance: AudioContextManager;
  private audioContext: AudioContext | null = null;
  private isUnlocked = false;

  private constructor() {
    this.setupAudioContext();
    this.setupUnlockHandlers();
  }

  public static getInstance(): AudioContextManager {
    if (!AudioContextManager.instance) {
      AudioContextManager.instance = new AudioContextManager();
    }
    return AudioContextManager.instance;
  }

  private setupAudioContext() {
    try {
      // @ts-ignore - Safari uses webkitAudioContext
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContext();
      console.log('AudioContext created');
    } catch (e) {
      console.error('Web Audio API is not supported in this browser', e);
    }
  }

  private setupUnlockHandlers() {
    if (typeof window === 'undefined') return;

    const unlock = () => {
      if (!this.audioContext || this.isUnlocked) return;

      // Create empty buffer
      const buffer = this.audioContext.createBuffer(1, 1, 22050);
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioContext.destination);
      
      // Play the empty buffer
      source.start(0);
      
      // Set a flag to indicate the context is unlocked
      this.isUnlocked = true;
      
      // Clean up
      if (source) {
        source.disconnect();
      }
      
      console.log('AudioContext unlocked');
    };

    // Unlock on any user interaction
    const events = ['touchstart', 'touchend', 'mousedown', 'keydown'];
    const unlockHandler = () => {
      if (this.isUnlocked) {
        events.forEach(event => {
          document.removeEventListener(event, unlockHandler, false);
        });
        return;
      }
      unlock();
    };

    events.forEach(event => {
      document.addEventListener(event, unlockHandler, false);
    });
  }

  public getAudioContext(): AudioContext | null {
    if (!this.audioContext) {
      this.setupAudioContext();
    }
    return this.audioContext;
  }

  public resumeContext(): Promise<void> {
    if (!this.audioContext) {
      return Promise.reject('AudioContext not available');
    }
    return this.audioContext.resume().then(
      () => {
        console.log('AudioContext resumed successfully');
        this.isUnlocked = true;
      },
      (err) => {
        console.error('Failed to resume AudioContext:', err);
        this.isUnlocked = false;
      }
    );
  }

  public get isContextUnlocked(): boolean {
    return this.isUnlocked;
  }
}

export const audioContextManager = AudioContextManager.getInstance();
