import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../../store/useAppStore';
import { apiClient } from '../../core/apiClient';
import { ANIMATION } from '../../core/AnimationTimings';

export const AuthModal = () => {
    const { showAuthModal, setShowAuthModal } = useAppStore();

    return (
        <AnimatePresence>
            {showAuthModal && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: ANIMATION.NORMAL }}
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                    onClick={() => setShowAuthModal(false)}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: ANIMATION.NORMAL, ease: ANIMATION.EASE as any }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-[380px] bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-6"
                    >
                        <div className="text-primary text-xs font-mono uppercase tracking-widest opacity-60 mb-2">
                            Sign In
                        </div>
                        <div className="text-text text-sm font-mono mb-6 leading-relaxed">
                            Sign in with GitHub to get a Skill Fingerprint, save your progress, and unlock personalized search.
                        </div>
                        <a
                            href={apiClient.githubLoginUrl()}
                            className="block text-center bg-primary/20 hover:bg-primary/30 text-primary border border-primary/40 rounded-xl py-3 font-mono text-sm uppercase tracking-widest transition-colors"
                        >
                            Continue with GitHub
                        </a>
                        <button
                            onClick={() => setShowAuthModal(false)}
                            className="w-full mt-3 text-white/40 hover:text-white text-xs font-mono uppercase tracking-widest py-2 transition-colors cursor-pointer"
                        >
                            Cancel
                        </button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
