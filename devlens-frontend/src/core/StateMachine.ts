import { useAppStore } from '../store/useAppStore';
import type { AppMode } from '../store/useAppStore';

const ALLOWED_TRANSITIONS: Record<AppMode, AppMode[]> = {
    landing: ["ingesting", "cockpit"],
    ingesting: ["cockpit", "landing"],
    cockpit: ["focus", "architect", "landing"],
    architect: ["cockpit"],
    focus: ["cockpit"]
};

export const StateMachine = {
    transition: (to: AppMode): boolean => {
        const store = useAppStore.getState();
        const currentMode = store.mode;

        if (ALLOWED_TRANSITIONS[currentMode]?.includes(to)) {
            store.setMode(to);
            return true;
        }

        console.error(`Illegal transition blocked: ${currentMode} -> ${to}`);
        return false;
    }
};
