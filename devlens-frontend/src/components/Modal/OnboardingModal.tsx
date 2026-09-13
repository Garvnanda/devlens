import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../../store/useAppStore';
import { apiClient } from '../../core/apiClient';
import { ANIMATION } from '../../core/AnimationTimings';

const LEVELS = ['student', 'junior', 'senior'] as const;
const LANGUAGES = ['english', 'hindi', 'hinglish'] as const;
const GOALS = ['learning', 'contributing'] as const;

export const OnboardingModal = () => {
    const { showOnboardingModal, setShowOnboardingModal, userProfile, setUserProfile, isAuthenticated } = useAppStore();
    const [level, setLevel] = useState(userProfile.level);
    const [language, setLanguage] = useState(userProfile.language);
    const [goal, setGoal] = useState(userProfile.goal);
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        setUserProfile({ level, language, goal });
        if (isAuthenticated) {
            try {
                await apiClient.updateProfile({ level, language, goal });
            } catch {
                // Best-effort — local profile is already updated for this session.
            }
        }
        setSaving(false);
        setShowOnboardingModal(false);
    };

    return (
        <AnimatePresence>
            {showOnboardingModal && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: ANIMATION.NORMAL }}
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                    onClick={() => setShowOnboardingModal(false)}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: ANIMATION.NORMAL, ease: ANIMATION.EASE as any }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-[420px] bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-6"
                    >
                        <div className="text-primary text-xs font-mono uppercase tracking-widest opacity-60 mb-4">
                            Calibrate DevLens
                        </div>

                        <Field label="Skill level" value={level} options={LEVELS} onChange={(v) => setLevel(v as any)} />
                        <Field label="Language" value={language} options={LANGUAGES} onChange={(v) => setLanguage(v as any)} />
                        <Field label="Goal" value={goal} options={GOALS} onChange={(v) => setGoal(v as any)} />

                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="w-full mt-4 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/40 rounded-xl py-3 font-mono text-sm uppercase tracking-widest transition-colors disabled:opacity-50 cursor-pointer"
                        >
                            {saving ? 'Saving...' : 'Save'}
                        </button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

function Field({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void }) {
    return (
        <div className="mb-4">
            <div className="text-text/60 text-xs font-mono uppercase tracking-widest mb-2">{label}</div>
            <div className="flex gap-2">
                {options.map((opt) => (
                    <button
                        key={opt}
                        onClick={() => onChange(opt)}
                        className={`flex-1 py-2 rounded-lg text-xs font-mono capitalize border transition-colors cursor-pointer ${
                            value === opt
                                ? 'bg-primary/20 border-primary/40 text-primary'
                                : 'bg-white/5 border-white/10 text-white/50 hover:text-white/80'
                        }`}
                    >
                        {opt}
                    </button>
                ))}
            </div>
        </div>
    );
}
