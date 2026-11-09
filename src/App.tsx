import React, { useState } from 'react';
import { WelcomeView } from './components/WelcomeView';
import { BrainView } from './components/BrainView';

export default function App() {
  const [currentView, setCurrentView] = useState<'welcome' | 'brain'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1' || params.get('view') === 'brain') {
        return 'brain';
      }
    }
    return 'welcome';
  });
  const [userLabel, setUserLabel] = useState<string>('Local Developer');
  const [initialBrain, setInitialBrain] = useState<string>('coding');

  // Cinematic Warp Transition State
  const [isWarping, setIsWarping] = useState(false);
  const [veilActive, setVeilActive] = useState(false);
  const [brainRevealed, setBrainRevealed] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1' || params.get('view') === 'brain') {
        return true;
      }
    }
    return false;
  });

  const handleEnterBrain = (selectedBrain?: string, label?: string) => {
    if (selectedBrain) setInitialBrain(selectedBrain);
    if (label) setUserLabel(label);

    setIsWarping(true);

    setTimeout(() => {
      setVeilActive(true);
    }, 350);

    setTimeout(() => {
      setCurrentView('brain');
      requestAnimationFrame(() => {
        setBrainRevealed(true);
      });
    }, 550);

    setTimeout(() => {
      setVeilActive(false);
    }, 700);

    setTimeout(() => {
      setIsWarping(false);
    }, 1200);
  };

  const handleSwitchToWelcome = () => {
    setBrainRevealed(false);
    setCurrentView('welcome');
  };

  return (
    <div className="relative min-h-screen w-full bg-[#03040a] font-sans text-white overflow-hidden">
      <div className="relative h-screen w-screen">
        {currentView === 'welcome' ? (
          <WelcomeView onEnterBrain={handleEnterBrain} isEnteringExternal={isWarping} />
        ) : (
          <div
            className={`h-full w-full transition-all duration-500 ease-out ${
              brainRevealed ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
            }`}
          >
            <BrainView
              userEmail={userLabel}
              initialBrainName={initialBrain}
              onSwitchToLogin={handleSwitchToWelcome}
            />
          </div>
        )}
      </div>

      {/* Celestial Warp Light Flare Bridge */}
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed inset-0 z-50 transition-opacity duration-500 ease-out ${
          veilActive ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          background:
            'radial-gradient(circle at 62% 50%, rgba(255, 255, 255, 0.95) 0%, rgba(180, 205, 255, 0.75) 35%, rgba(127, 119, 221, 0.45) 60%, rgba(3, 4, 10, 0.9) 100%)',
        }}
      />
    </div>
  );
}
