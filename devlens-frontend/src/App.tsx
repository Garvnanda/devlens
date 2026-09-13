import { Terminal } from './components/CLI/Terminal';
import { ClickSpark } from './components/ClickSpark';
import { AuthModal } from './components/Modal/AuthModal';
import { OnboardingModal } from './components/Modal/OnboardingModal';
import { DotField } from './components/Onboarding/DotField';
import { CockpitScene } from './scenes/CockpitScene';
import { OnboardingScene } from './scenes/OnboardingScene';
import { useAppStore } from './store/useAppStore';

function App() {
  const mode = useAppStore((state) => state.mode);
  const showTerminalBackdrop = mode === 'landing' || mode === 'ingesting';

  return (
    <div className="w-screen h-screen bg-background relative overflow-hidden flex items-center justify-center">
      {showTerminalBackdrop && (
        <>
          <div className="pointer-events-none absolute inset-0 z-0 grid-field" aria-hidden />
          <div className="pointer-events-none absolute inset-0 z-0 opacity-60" aria-hidden>
            <DotField dotSpacing={26} dotRadius={1.1} />
          </div>
        </>
      )}

      {/* No exit animation: a fading overlay would swallow the first clicks/keys meant for the terminal. */}
      {mode === 'feature-explorer' && <OnboardingScene />}

      <CockpitScene />

      <AuthModal />
      <OnboardingModal />

      {/* Primary Interaction Layer (Z-Index 100) */}
      <Terminal />

      <ClickSpark />
    </div>
  );
}

export default App;
