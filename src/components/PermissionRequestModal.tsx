import { useEffect, useRef } from 'react';

interface PermissionRequestModalProps {
  onGranted: () => void;
  onDismiss: () => void;
}

export const PermissionRequestModal = ({ onGranted, onDismiss }: PermissionRequestModalProps) => {
  const modalRef = useRef<HTMLDivElement>(null);

  const requestAudioPermission = async () => {
    try {
      // 1. First, request microphone permission (helps with autoplay policies)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // 2. Create and play a silent audio element to unlock autoplay
      const unlockAudio = () => {
        try {
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          const source = audioContext.createBufferSource();
          source.buffer = audioContext.createBuffer(1, 1, 22050);
          source.connect(audioContext.destination);
          source.start(0);
          source.stop(0.1);
          source.onended = () => {
            source.disconnect();
            audioContext.close();
          };
        } catch (e) {
          console.log('AudioContext unlock failed:', e);
        }
      };

      // 3. Also try HTML5 audio element approach
      const playDummyAudio = () => {
        const audio = new Audio();
        audio.muted = true;
        audio.play().catch(e => console.log('Dummy audio play failed:', e));
        setTimeout(() => audio.remove(), 1000);
      };

      // 4. Execute both methods to maximize compatibility
      unlockAudio();
      playDummyAudio();
      
      // 5. Stop all tracks to release the microphone
      stream.getTracks().forEach(track => track.stop());
      
      // 6. Set a flag in localStorage for future visits
      localStorage.setItem('audioPermissionsGranted', 'true');
      
      // 7. Notify parent component
      onGranted();
      
    } catch (err) {
      console.warn('Audio permission denied:', err);
      // Even if permissions are denied, we'll still try to proceed
      // as some browsers might still allow autoplay without explicit permissions
      onGranted();
    }
  };

  // Add animation on mount
  useEffect(() => {
    if (modalRef.current) {
      modalRef.current.style.opacity = '1';
      modalRef.current.style.transform = 'translate(-50%, -50%) scale(1)';
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div 
        ref={modalRef}
        className="relative w-full max-w-md p-8 text-center transition-all duration-500 transform -translate-x-1/2 -translate-y-1/2 opacity-0 bg-gradient-to-br from-white/10 to-white/5 rounded-2xl backdrop-blur-xl border border-white/20 shadow-2xl scale-90 top-1/2 left-1/2"
        style={{
          boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
        }}
      >
        <h2 className="mb-4 text-2xl font-bold text-white">Audio Permission Needed</h2>
        <p className="mb-8 text-white/80">
          To fully experience AI Town, we need your permission to play audio and music. 
          This will enable background music and sound effects.
        </p>
        
        <div className="flex flex-col space-y-4 sm:flex-row sm:space-y-0 sm:space-x-4">
          <button
            onClick={onDismiss}
            className="px-6 py-3 font-medium text-white transition-all duration-300 bg-white/10 hover:bg-white/20 rounded-xl backdrop-blur-sm"
          >
            Maybe Later
          </button>
          <button
            onClick={requestAudioPermission}
            className="px-6 py-3 font-medium text-white transition-all duration-300 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rounded-xl shadow-lg hover:shadow-blue-500/30"
          >
            Allow Audio
          </button>
        </div>
        
        <div className="absolute inset-0 -z-10 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-600/20" />
      </div>
    </div>
  );
};

export default PermissionRequestModal;
