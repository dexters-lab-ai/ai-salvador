/*
import { useEffect, useState } from 'react';
import { audioContextManager } from '../utils/audioContextManager';

export default function AudioPermissionOverlay() {
  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    // Check if we've shown the overlay before
    const hasShownOverlay = localStorage.getItem('hasShownAudioOverlay') === 'true';
    if (!hasShownOverlay) {
      setShowOverlay(true);
    }
  }, []);

  const handleEnableAudio = async () => {
    try {
      // Try to resume audio context (this will trigger the browser's permission prompt)
      await audioContextManager.resume();
      
      // Store that we've shown the overlay
      localStorage.setItem('hasShownAudioOverlay', 'true');
      setShowOverlay(false);
      
      // Notify parent components that audio is ready
      const event = new CustomEvent('audioReady');
      window.dispatchEvent(event);
    } catch (error) {
      console.error('Error enabling audio:', error);
      alert('Could not enable audio. Please check your browser permissions.');
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('hasShownAudioOverlay', 'true');
    setShowOverlay(false);
  };

  if (!showOverlay) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 max-w-md w-full border border-white/20 shadow-2xl">
        <h2 className="text-2xl font-bold text-white mb-4 font-display">Enable Audio Experience</h2>
        <p className="text-white/90 mb-6">
          For the best experience, we'd like to enable audio. This includes background music and sound effects that bring the virtual world to life.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleEnableAudio}
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
          >
            Enable Audio
          </button>
          <button
            onClick={handleDismiss}
            className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors"
          >
            Maybe Later
          </button>
        </div>
        <p className="text-xs text-white/50 mt-4">
          You can change this later in your browser settings.
        </p>
      </div>
    </div>
  );
}
*/