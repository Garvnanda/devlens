import { create } from 'zustand';

export type AppMode =
    | "landing"
    | "ingesting"
    | "feature-explorer"
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
    // Phase 3
    focusFileContent: string | null;
    intentData: { intent_summary: string; commits_analyzed: number } | null;
    intentLoading: boolean;
    intentError: string | null;
    explainData: { explanation: string; jargon_terms: { term: string; technical_definition: string; student_analogy: string }[] } | null;
    explainLoading: boolean;
    explainError: string | null;
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
    setFocusFileContent: (content: string | null) => void;
    setIntentData: (data: AppStore['intentData']) => void;
    setIntentLoading: (loading: boolean) => void;
    setIntentError: (error: string | null) => void;
    setExplainData: (data: AppStore['explainData']) => void;
    setExplainLoading: (loading: boolean) => void;
    setExplainError: (error: string | null) => void;
}

export const useAppStore = create<AppStore>((set) => ({
    mode: "feature-explorer",
    repoUrl: null,
    graphData: null,
    selectedFile: null,
    blastTarget: null,
    cliHistory: [],
    focusFileContent: null,
    intentData: null,
    intentLoading: false,
    intentError: null,
    explainData: null,
    explainLoading: false,
    explainError: null,
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
    setFocusFileContent: (focusFileContent) => set({ focusFileContent }),
    setIntentData: (intentData) => set({ intentData }),
    setIntentLoading: (intentLoading) => set({ intentLoading }),
    setIntentError: (intentError) => set({ intentError }),
    setExplainData: (explainData) => set({ explainData }),
    setExplainLoading: (explainLoading) => set({ explainLoading }),
    setExplainError: (explainError) => set({ explainError }),
}));
