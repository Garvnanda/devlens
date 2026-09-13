import { useAppStore } from '../../store/useAppStore';
import { motion } from 'framer-motion';
import { ANIMATION } from '../../core/AnimationTimings';

export const SkillFingerprintPanel = () => {
    const { skillFingerprint, fingerprintLoading, setSkillFingerprint } = useAppStore();

    if (!skillFingerprint && !fingerprintLoading) return null;

    const topLanguages = skillFingerprint
        ? Object.entries(skillFingerprint.language_distribution)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
        : [];

    return (
        <motion.div
            key="skill-fingerprint-panel"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: ANIMATION.NORMAL, ease: ANIMATION.EASE as any }}
            className="w-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
                <div className="text-primary text-xs font-mono uppercase tracking-widest opacity-60">
                    Skill Fingerprint
                </div>
                {skillFingerprint && (
                    <button
                        onClick={() => setSkillFingerprint(null)}
                        className="text-white/40 hover:text-white text-lg transition-colors cursor-pointer"
                    >✕</button>
                )}
            </div>

            <div className="p-5">
                {fingerprintLoading && (
                    <div className="text-white/30 text-xs font-mono text-center py-2">Computing your fingerprint…</div>
                )}

                {skillFingerprint && !fingerprintLoading && (
                    <div className="space-y-3">
                        {topLanguages.map(([lang, pct]) => (
                            <div key={lang}>
                                <div className="flex justify-between text-xs font-mono text-text/70 mb-1">
                                    <span>{lang}</span>
                                    <span>{Math.round(pct * 100)}%</span>
                                </div>
                                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                    <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct * 100}%` }} />
                                </div>
                            </div>
                        ))}
                        <div className="pt-2 border-t border-white/10 text-white/40 text-xs font-mono">
                            Active {skillFingerprint.contribution_recency_days}d ago · complexity {skillFingerprint.avg_repo_complexity.toFixed(2)}
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
};
