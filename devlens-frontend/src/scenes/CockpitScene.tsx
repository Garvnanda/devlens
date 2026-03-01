import { MolecularGraph } from '../components/Graph/MolecularGraph';
import { useAppStore } from '../store/useAppStore';
import { SidePanel } from '../components/Graph/SidePanel';
import { StateMachine } from '../core/StateMachine';

export const CockpitScene = () => {
    const { mode, setBlastTarget, setSelectedFile } = useAppStore();

    if (mode === 'landing' || mode === 'ingesting') return null;

    const handleCloseMap = () => {
        setSelectedFile(null);
        setBlastTarget(null);
        StateMachine.transition('landing');
    };

    return (
        <div className="absolute inset-0 w-full h-full pointer-events-auto overflow-hidden">
            <MolecularGraph />

            {/* HUD Info */}
            <div className="absolute top-6 left-6 text-primary tracking-widest text-sm opacity-50 z-50 pointer-events-none uppercase font-mono">
                Sector: Deep Code
            </div>

            {/* Close Map Button */}
            <button
                onClick={handleCloseMap}
                className="absolute top-6 right-6 z-50 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-full p-2 border border-white/10 backdrop-blur-md transition-all flex items-center gap-2 px-6 py-2 shadow-xl font-mono text-sm uppercase tracking-widest cursor-pointer"
            >
                ✕ Close Map
            </button>

            <SidePanel />
        </div>
    );
};
