import { useAppStore } from '../../store/useAppStore';
import { motion } from 'framer-motion';
import { ANIMATION } from '../../core/AnimationTimings';

export const ExplainPanel = () => {
    const { explainData, explainLoading, explainError, selectedFile, setExplainData, setExplainError } = useAppStore();

    const shortName = selectedFile?.split('/').pop() || 'file';

    if (!explainData && !explainLoading && !explainError) return null;

    return (
        <motion.div
            key="explain-panel"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: ANIMATION.NORMAL, ease: ANIMATION.EASE as any }}
            className="w-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            style={{ maxHeight: '48vh' }}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
                <div>
                    <div className="text-secondary text-xs font-mono uppercase tracking-widest opacity-60 mb-1">Jargon Buster</div>
                    <div className="text-text text-sm font-mono truncate max-w-[280px]">{shortName}</div>
                </div>
                <button
                    onClick={() => { setExplainData(null); setExplainError(null); }}
                    className="text-white/40 hover:text-white text-lg transition-colors cursor-pointer"
                >✕</button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-5">
                {explainLoading && (
                    <div className="space-y-3 animate-pulse">
                        <div className="h-3 bg-white/10 rounded w-full" />
                        <div className="h-3 bg-white/10 rounded w-5/6" />
                        <div className="h-3 bg-white/10 rounded w-4/6" />
                        <div className="mt-4 space-y-2">
                            <div className="h-16 bg-white/5 rounded-xl border border-white/5" />
                            <div className="h-16 bg-white/5 rounded-xl border border-white/5" />
                        </div>
                        <div className="mt-2 text-white/30 text-xs font-mono text-center">Busting jargon…</div>
                    </div>
                )}

                {explainError && !explainLoading && (
                    <div className="flex flex-col items-center gap-3 py-4">
                        <div className="text-red-400/80 text-2xl">⚠</div>
                        <div className="text-red-400/70 text-xs font-mono text-center leading-relaxed">{explainError}</div>
                    </div>
                )}

                {explainData && !explainLoading && (
                    <div className="space-y-5">
                        <div className="text-text/80 text-sm leading-relaxed">
                            {explainData.explanation}
                        </div>

                        {explainData.jargon_terms.length > 0 && (
                            <div className="space-y-3">
                                <div className="text-white/30 text-xs font-mono uppercase tracking-widest">Key Terms</div>
                                {explainData.jargon_terms.map((term, i) => (
                                    <div key={i} className="bg-white/5 rounded-xl p-4 border border-white/5 space-y-2">
                                        <div className="text-primary font-mono text-sm font-semibold">{term.term}</div>
                                        <div className="text-text/60 text-xs leading-relaxed">
                                            <span className="text-white/30 uppercase text-[10px] tracking-wider">Definition: </span>
                                            {term.technical_definition}
                                        </div>
                                        <div className="text-text/70 text-xs leading-relaxed italic">
                                            <span className="text-white/30 uppercase text-[10px] tracking-wider not-italic">Analogy: </span>
                                            {term.student_analogy}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    );
};
