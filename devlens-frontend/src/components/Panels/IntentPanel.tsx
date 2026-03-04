import { useAppStore } from '../../store/useAppStore';
import { motion } from 'framer-motion';
import { ANIMATION } from '../../core/AnimationTimings';

export const IntentPanel = () => {
    const { intentData, intentLoading, intentError, selectedFile, setIntentData, setIntentError } = useAppStore();

    const shortName = selectedFile?.split('/').pop() || 'file';

    // Show nothing if no data, not loading, and no error
    if (!intentData && !intentLoading && !intentError) return null;

    return (
        <motion.div
            key="intent-panel"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: ANIMATION.NORMAL, ease: ANIMATION.EASE as any }}
            className="w-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            style={{ maxHeight: '45vh' }}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
                <div>
                    <div className="text-primary text-xs font-mono uppercase tracking-widest opacity-60 mb-1">Architectural Intent</div>
                    <div className="text-text text-sm font-mono truncate max-w-[280px]">{shortName}</div>
                </div>
                <button
                    onClick={() => { setIntentData(null); setIntentError(null); }}
                    className="text-white/40 hover:text-white text-lg transition-colors cursor-pointer"
                >✕</button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-5">
                {intentLoading && (
                    <div className="space-y-3 animate-pulse">
                        <div className="h-3 bg-white/10 rounded w-full" />
                        <div className="h-3 bg-white/10 rounded w-5/6" />
                        <div className="h-3 bg-white/10 rounded w-4/6" />
                        <div className="h-3 bg-white/10 rounded w-full mt-4" />
                        <div className="h-3 bg-white/10 rounded w-3/4" />
                        <div className="mt-4 text-white/30 text-xs font-mono text-center">Analyzing commit history…</div>
                    </div>
                )}

                {intentError && !intentLoading && (
                    <div className="flex flex-col items-center gap-3 py-4">
                        <div className="text-red-400/80 text-2xl">⚠</div>
                        <div className="text-red-400/70 text-xs font-mono text-center leading-relaxed">{intentError}</div>
                    </div>
                )}

                {intentData && !intentLoading && (
                    <div className="space-y-4">
                        <div className="text-text/80 text-sm leading-relaxed whitespace-pre-wrap font-mono">
                            {intentData.intent_summary}
                        </div>
                        <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                            <div className="w-2 h-2 rounded-full bg-primary/60" />
                            <span className="text-white/40 text-xs font-mono">
                                {intentData.commits_analyzed} commits analyzed
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
};
