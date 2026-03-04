import { useState, useEffect } from 'react';

export interface FeatureData {
    id: string;
    title: string;
    description: string;
    /** Parent node id for tree connections */
    parent: string | null;
}

/**
 * Comprehensive feature list covering all backend + frontend phases.
 * Tree structure: DevLens Core → category → features
 */
export const FEATURES: FeatureData[] = [
    // ─── Core Hub ───
    {
        id: "core",
        title: "DevLens Core",
        description: "The central intelligence engine that powers every DevLens feature — from repository ingestion to AI-driven code analysis.",
        parent: null,
    },

    // ─── Category nodes ───
    {
        id: "cat-analysis",
        title: "Code Analysis",
        description: "All features related to understanding, parsing, and analyzing your repository's source code at the structural level.",
        parent: "core",
    },
    {
        id: "cat-ai",
        title: "AI Intelligence",
        description: "AI-powered features using Claude and Titan models to explain, summarize, and reason about your codebase.",
        parent: "core",
    },
    {
        id: "cat-viz",
        title: "Visualization",
        description: "Beautiful interactive visualizations that turn raw code data into explorable 3D graphs and 2D trees.",
        parent: "core",
    },
    {
        id: "cat-workflow",
        title: "Developer Workflow",
        description: "Tools that streamline the developer experience — from onboarding scripts to issue tracking and contribution guidance.",
        parent: "core",
    },

    // ─── Code Analysis children ───
    {
        id: "repo-ingestion",
        title: "Repo Ingestion",
        description: "Clones any public GitHub repository, extracts the file tree, and stores it for downstream analysis and vectorization.",
        parent: "cat-analysis",
    },
    {
        id: "ast-parsing",
        title: "AST Parsing",
        description: "Uses Tree-sitter to parse source code into Abstract Syntax Trees, extracting functions, classes, and import relationships.",
        parent: "cat-analysis",
    },
    {
        id: "dependency-graph",
        title: "Dependency Graph",
        description: "Builds a directed graph of file-to-file import relationships, powering the 3D molecular visualization of your codebase.",
        parent: "cat-analysis",
    },
    {
        id: "vectorization",
        title: "Code Vectorization",
        description: "Chunks code by class and function, then embeds each chunk using Amazon Titan v2 into a ChromaDB vector store for semantic search.",
        parent: "cat-analysis",
    },
    {
        id: "hybrid-search",
        title: "Hybrid Search",
        description: "Combines dense vector similarity with BM25 keyword scoring to find the most relevant code chunks for any natural language query.",
        parent: "cat-analysis",
    },

    // ─── AI Intelligence children ───
    {
        id: "jargon-buster",
        title: "Jargon Buster",
        description: "Sends code to Claude AI which returns plain-English explanations with real-world analogies for every technical term it finds.",
        parent: "cat-ai",
    },
    {
        id: "architectural-intent",
        title: "Architectural Intent",
        description: "Analyzes up to 50 Git commits for any file and uses AI to summarize why the file exists and how it evolved over time.",
        parent: "cat-ai",
    },
    {
        id: "architect-ai",
        title: "Architect AI",
        description: "An AI assistant that understands your entire codebase structure and helps design new features without breaking existing patterns.",
        parent: "cat-ai",
    },
    {
        id: "chatbot",
        title: "AI Chatbot",
        description: "A conversational AI interface that can answer questions about your repository using retrieval-augmented generation over vectorized code.",
        parent: "cat-ai",
    },

    // ─── Visualization children ───
    {
        id: "molecular-map",
        title: "3D Molecular Map",
        description: "An interactive three-dimensional force-directed graph where each file is a glowing sphere and each import is a white connection line.",
        parent: "cat-viz",
    },
    {
        id: "feature-explorer",
        title: "Feature Explorer",
        description: "This very page — a 2D tree showing every DevLens capability at a glance, with hover-to-learn interactions powered by typewriter text.",
        parent: "cat-viz",
    },
    {
        id: "code-viewer",
        title: "Code Viewer",
        description: "A focus-mode panel that fetches and displays raw source code from GitHub with line numbers in a sleek glass-morphic split layout.",
        parent: "cat-viz",
    },
    {
        id: "side-panel",
        title: "Side Panel",
        description: "A detail panel that slides in when you click a node in the 3D graph, showing the file path and connected dependencies.",
        parent: "cat-viz",
    },

    // ─── Developer Workflow children ───
    {
        id: "setup-generator",
        title: "Setup Generator",
        description: "Scans package.json, requirements.txt, and config files to auto-generate Bash and PowerShell onboarding scripts for any repository.",
        parent: "cat-workflow",
    },
    {
        id: "issue-matcher",
        title: "Issue Matcher",
        description: "Fetches 'good first issue' labels from GitHub, checks for linked open PRs, and recommends unclaimed issues for new contributors.",
        parent: "cat-workflow",
    },
    {
        id: "pr-history",
        title: "PR History",
        description: "Uses the GitHub GraphQL API to fetch the last 50 merged pull requests with their associated issues and changed files.",
        parent: "cat-workflow",
    },
    {
        id: "gatekeeper",
        title: "Repo Gatekeeper",
        description: "Evaluates repository health by checking recent commit activity, open issue count, and contributor engagement before you invest time.",
        parent: "cat-workflow",
    },
    {
        id: "cli-engine",
        title: "CLI Engine",
        description: "A terminal-based command interface built on xterm.js — the primary way to interact with every DevLens feature using simple text commands.",
        parent: "cat-workflow",
    },
];

export const useTypewriter = (text: string, speed: number = 40) => {
    const [displayedText, setDisplayedText] = useState('');

    useEffect(() => {
        setDisplayedText('');
        let i = 0;
        const interval = setInterval(() => {
            setDisplayedText(text.slice(0, i + 1));
            i++;
            if (i >= text.length) clearInterval(interval);
        }, speed);
        return () => clearInterval(interval);
    }, [text, speed]);

    return displayedText;
};
