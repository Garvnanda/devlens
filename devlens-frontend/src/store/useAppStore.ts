import { create } from 'zustand';

export type AppMode =
    | "landing"
    | "ingesting"
    | "cockpit"
    | "focus"
    | "architect";

export interface AppStore {
    mode: AppMode;
    repoUrl: string | null;
    graphData: any | null;
    selectedFile: string | null;
    blastTarget: string | null;
    cliHistory: string[];
    missionState: {
        active: boolean;
        issueNumber: number | null;
        steps: string[];
    };
    userProfile: {
        level: "student" | "junior" | "senior";
        language: "english" | "hindi" | "hinglish";
        goal: "learning" | "contributing";
    };
    setMode: (mode: AppMode) => void;
    setRepoUrl: (url: string) => void;
    setGraphData: (data: any) => void;
    setSelectedFile: (file: string | null) => void;
    setBlastTarget: (target: string | null) => void;
    addCliHistory: (entry: string) => void;
}

export const useAppStore = create<AppStore>((set) => ({
    mode: "landing",
    repoUrl: null,
    graphData: null,
    selectedFile: null,
    blastTarget: null,
    cliHistory: [],
    missionState: {
        active: false,
        issueNumber: null,
        steps: [],
    },
    userProfile: {
        level: "student",
        language: "english",
        goal: "learning",
    },
    setMode: (mode) => set({ mode }),
    setRepoUrl: (repoUrl) => set({ repoUrl }),
    setGraphData: (graphData) => set({ graphData }),
    setSelectedFile: (selectedFile) => set({ selectedFile }),
    setBlastTarget: (blastTarget) => set({ blastTarget }),
    addCliHistory: (entry) => set((state) => ({ cliHistory: [...state.cliHistory, entry] })),
}));
