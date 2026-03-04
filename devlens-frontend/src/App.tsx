import { Terminal } from './components/CLI/Terminal';
import { CockpitScene } from './scenes/CockpitScene';
import { useAppStore } from './store/useAppStore';
import Particles from 'react-tsparticles';
import { loadSlim } from 'tsparticles-slim';
import type { Engine } from 'tsparticles-engine';
import { useCallback } from 'react';

import { FeatureExplorerScene } from './scenes/FeatureExplorerScene';

function App() {
  const { mode } = useAppStore(state => state);

  const particlesInit = useCallback(async (engine: Engine) => {
    await loadSlim(engine);
  }, []);

  const showParticles = mode === 'landing' || mode === 'ingesting' || mode === 'feature-explorer';

  return (
    <div className="w-screen h-screen bg-background relative overflow-hidden flex items-center justify-center">
      {showParticles && (
        <Particles
          id="tsparticles"
          init={particlesInit}
          options={{
            background: { color: { value: "transparent" } },
            fpsLimit: 60,
            particles: {
              color: { value: "#ffffff" },
              links: { enable: false },
              move: { enable: true, speed: 0.5, direction: "none", random: true, straight: false, outModes: "out" },
              number: { value: 100, density: { enable: true, area: 800 } },
              opacity: { value: { min: 0.1, max: 0.8 }, animation: { enable: true, speed: 1, sync: false } },
              size: { value: { min: 1, max: 3 } },
              shape: { type: "circle" },
            },
            detectRetina: true,
          }}
          className="absolute inset-0 z-0 pointer-events-none"
        />
      )}

      {mode === 'feature-explorer' && <FeatureExplorerScene />}

      <CockpitScene />

      {/* Primary Interaction Layer (Z-Index 100) */}
      <Terminal />
    </div>
  );
}

export default App;
