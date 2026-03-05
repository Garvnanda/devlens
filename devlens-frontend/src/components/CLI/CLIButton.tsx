import { useAppStore } from '../../store/useAppStore';
import { StateMachine } from '../../core/StateMachine';
import { motion } from 'framer-motion';

export const CLIButton = () => {
    const { mode } = useAppStore();

    if (mode !== 'feature-explorer') return null;

    const handleLaunch = () => {
        // Transition to landing mode to show the CLI terminal
        StateMachine.transition('landing');
    };

    return (
        <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleLaunch}
            className="fixed bottom-10 right-10 w-16 h-16 rounded-full bg-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.6)] flex items-center justify-center z-[90] cursor-pointer hover:bg-cyan-400 transition-colors"
        >
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-900">
                <polyline points="4 17 10 11 4 5"></polyline>
                <line x1="12" y1="19" x2="20" y2="19"></line>
            </svg>
        </motion.button>
    );
};
