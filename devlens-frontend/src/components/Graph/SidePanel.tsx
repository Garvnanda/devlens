import { useAppStore } from '../../store/useAppStore';
import { motion, AnimatePresence } from 'framer-motion';

export const SidePanel = () => {
    const { selectedFile, graphData, mode, setSelectedFile, setBlastTarget } = useAppStore();

    // In focus mode, CodeViewer occupies right-0 — hide SidePanel to avoid overlap
    if (!selectedFile || !graphData || mode === 'focus') return null;

    // Find connections
    const connections = graphData.links.filter((l: any) =>
        l.source === selectedFile || l.target === selectedFile ||
        l.source?.id === selectedFile || l.target?.id === selectedFile
    ).map((l: any) => {
        const connectedNodeId = (l.source?.id || l.source) === selectedFile
            ? (l.target?.id || l.target)
            : (l.source?.id || l.source);
        return {
            id: connectedNodeId,
            weight: l.weight || 1
        };
    });

    const handleClose = () => {
        setSelectedFile(null);
        setBlastTarget(null);
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ x: '100%', opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '100%', opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="absolute top-0 right-0 h-full w-[400px] bg-background/90 backdrop-blur-2xl border-l border-white/10 z-50 p-6 flex flex-col text-text shadow-2xl overflow-y-auto"
            >
                <button
                    onClick={handleClose}
                    className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors"
                >
                    ✕
                </button>

                <h2 className="text-xl font-mono text-cyan-400 mb-2 truncate pr-8">{selectedFile}</h2>
                <div className="text-sm opacity-50 uppercase tracking-widest mb-8 border-b border-white/10 pb-4">
                    Architectural Details
                </div>

                <div className="flex-1">
                    <h3 className="text-sm font-semibold opacity-80 mb-4">Direct Dependencies ({connections.length})</h3>
                    <div className="space-y-3">
                        {connections.length === 0 ? (
                            <div className="opacity-40 italic">No direct connections.</div>
                        ) : (
                            connections.map((conn: any) => (
                                <div key={conn.id} className="bg-white/5 p-3 rounded-lg border border-white/5 hover:border-cyan-500/50 cursor-pointer transition-colors"
                                    onClick={() => {
                                        setSelectedFile(conn.id);
                                        setBlastTarget(conn.id);
                                    }}
                                >
                                    <div className="font-mono text-sm">{conn.id}</div>
                                    <div className="text-xs opacity-50 mt-1">Weight: {conn.weight}</div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};
