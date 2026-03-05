import { registerCommand } from '../CommandRegistry';
import { useAppStore } from '../../store/useAppStore';
import { StateMachine } from '../StateMachine';
import { apiClient } from '../apiClient';

/** Helper: fuzzy-match a file query against graph nodes */
function findNode(query: string, writeOutput: (t: string, c?: string) => void): any | null {
    const store = useAppStore.getState();
    if (!store.graphData?.nodes?.length) {
        writeOutput('No graph data. Run ingest and map first.', '#EF4444');
        return null;
    }
    const q = query.toLowerCase();
    const allNodes = store.graphData.nodes;
    let match = allNodes.find((n: any) => n.id === q);
    if (!match) {
        const matches = allNodes.filter((n: any) => n.id.toLowerCase().includes(q));
        if (matches.length === 1) {
            match = matches[0];
        } else if (matches.length > 1) {
            writeOutput(`Multiple matches for '${query}':`);
            matches.slice(0, 10).forEach((m: any) => writeOutput(`  ${m.id}`));
            if (matches.length > 10) writeOutput(`  ... and ${matches.length - 10} more`);
            writeOutput('Specify a more precise name.');
            return null;
        }
    }
    if (!match) {
        writeOutput(`No node matching '${query}' found.`, '#EF4444');
        return null;
    }
    return match;
}

/** Extract owner/repo from stored URL */
function getOwnerRepo(): { owner: string; repo: string } | null {
    const url = useAppStore.getState().repoUrl;
    if (!url) return null;
    const m = url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!m) return null;
    let repo = m[2];
    if (repo.endsWith('.git')) repo = repo.slice(0, -4);
    return { owner: m[1], repo };
}

export const initCommands = () => {
    registerCommand({
        name: 'help',
        description: 'List all available commands',
        execute: ({ writeOutput }) => {
            writeOutput('Available commands:');
            writeOutput('  help           - Show this help message');
            writeOutput('  ingest <url>   - Ingest a GitHub repository');
            writeOutput('  map            - View the molecular dependency graph');
            writeOutput('  home           - Return to the Feature Explorer map');
            writeOutput('  blast <file>   - Trigger blast animation on a file node');
            writeOutput('  focus <file>   - Open code viewer for a file');
            writeOutput('  intent <file>  - Show architectural intent from commits');
            writeOutput('  explain <file> - Jargon buster: simplify code concepts');
            writeOutput('  clear          - Clear terminal output');
        }
    });

    registerCommand({
        name: 'clear',
        description: 'Clear terminal output',
        execute: ({ writeOutput }) => {
            writeOutput('\x1b[2J\x1b[3J\x1b[H');
        }
    });

    registerCommand({
        name: 'home',
        description: 'Return to the Feature Explorer map',
        execute: async ({ writeOutput }) => {
            const store = useAppStore.getState();
            if (store.mode === 'feature-explorer') {
                writeOutput('Already on the Feature Explorer page.', '#EF4444');
                return;
            }
            if (store.mode === 'ingesting') {
                writeOutput('Cannot navigate while ingesting.', '#EF4444');
                return;
            }
            writeOutput('Returning to Feature Explorer map...');

            // Clean up selections
            store.setSelectedFile(null);
            store.setBlastTarget(null);
            store.setFocusFileContent(null);

            StateMachine.transition('feature-explorer');
        }
    });

    registerCommand({
        name: 'map',
        description: 'View the molecular dependency graph',
        execute: async ({ writeOutput }) => {
            const store = useAppStore.getState();
            if (!store.repoUrl) {
                writeOutput('No repository ingested. Run ingest <url> first.', '#EF4444');
                return;
            }

            try {
                const ids = getOwnerRepo();
                if (!ids) throw new Error('Invalid stored github URL.');

                writeOutput('Connecting to graph database...');
                const data = await apiClient.get(`/repository/graph/${ids.owner}/${ids.repo}`);

                if (data && data.nodes) {
                    const links = (data.edges || []).map((e: any) => ({
                        source: e.source,
                        target: e.target,
                        weight: e.weight || 1
                    }));

                    store.setGraphData({ nodes: data.nodes, links });
                    writeOutput('Graph synchronized. Transferring to cockpit control...');
                    StateMachine.transition('cockpit');
                } else {
                    writeOutput('Graph data malformed.', '#EF4444');
                }
            } catch (e: any) {
                writeOutput(`Map failed: ${e.message}`, '#EF4444');
            }
        }
    });

    registerCommand({
        name: 'ingest',
        description: 'Ingest a repository',
        execute: async ({ args, writeOutput }) => {
            if (args.length === 0) {
                throw new Error('Usage: ingest <url>');
            }

            const url = args[0].replace(/^<|>$/g, '').trim();
            const store = useAppStore.getState();

            if (StateMachine.transition('ingesting')) {
                store.setRepoUrl(url);
                writeOutput(`Initiating ingestion for ${url}...`);

                try {
                    writeOutput('Connecting to pipeline...');
                    await apiClient.post('/repository/ingest', { github_url: url });

                    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
                    if (!match) throw new Error('Invalid GitHub URL format.');
                    const owner = match[1];
                    let repo = match[2];
                    if (repo.endsWith('.git')) repo = repo.slice(0, -4);

                    let isParsing = true;
                    while (isParsing) {
                        await new Promise(r => setTimeout(r, 2000));
                        const statusRes = await apiClient.get(`/repository/status/${owner}/${repo}`);

                        if (statusRes.status === 'completed') {
                            writeOutput('Vectorization complete.');
                            isParsing = false;
                        } else if (statusRes.status === 'failed' || statusRes.status === 'error') {
                            throw new Error('Pipeline parser failed.');
                        } else if (statusRes.status === 'not_found') {
                            throw new Error('Repository tracking lost.');
                        } else {
                            writeOutput('Parsing AST and vectorizing source code...');
                        }
                    }

                    writeOutput("Ingestion complete. Use 'map' to view dependency graph.");
                    StateMachine.transition('landing');
                } catch (e: any) {
                    writeOutput(`Ingestion failed: ${e.message}`, '#EF4444');
                    StateMachine.transition('landing');
                }
            }
        }
    });

    registerCommand({
        name: 'blast',
        description: 'Trigger blast animation on a file node',
        execute: ({ args, writeOutput }) => {
            const store = useAppStore.getState();
            if (!store.graphData?.nodes?.length) {
                writeOutput('No graph data. Run ingest and map first.', '#EF4444');
                return;
            }
            if (store.mode === 'landing' || store.mode === 'ingesting') {
                StateMachine.transition('cockpit');
            }
            if (args.length === 0) {
                writeOutput('Usage: blast <filename>');
                return;
            }

            const match = findNode(args.join(' '), writeOutput);
            if (!match) return;

            writeOutput(`Initiating blast sequence for ${match.id}...`);
            store.setBlastTarget(match.id);
            store.setSelectedFile(match.id);
        }
    });

    // ─── Phase 3 Commands ───

    registerCommand({
        name: 'focus',
        description: 'Open code viewer for a file',
        execute: async ({ args, writeOutput }) => {
            if (args.length === 0) {
                writeOutput('Usage: focus <filename>');
                return;
            }
            const store = useAppStore.getState();
            const ids = getOwnerRepo();
            if (!ids) {
                writeOutput('No repository ingested.', '#EF4444');
                return;
            }

            const match = findNode(args.join(' '), writeOutput);
            if (!match) return;

            writeOutput(`Focusing on ${match.id}...`);
            store.setSelectedFile(match.id);

            // Fetch raw file content from GitHub
            try {
                const rawUrl = `https://raw.githubusercontent.com/${ids.owner}/${ids.repo}/main/${match.id}`;
                const resp = await fetch(rawUrl);
                if (!resp.ok) {
                    // Try master branch
                    const resp2 = await fetch(rawUrl.replace('/main/', '/master/'));
                    if (!resp2.ok) throw new Error('Could not fetch file from GitHub.');
                    store.setFocusFileContent(await resp2.text());
                } else {
                    store.setFocusFileContent(await resp.text());
                }
                writeOutput('Code loaded. Entering focus mode...');
                StateMachine.transition('focus');
            } catch (e: any) {
                writeOutput(`Focus failed: ${e.message}`, '#EF4444');
            }
        }
    });

    registerCommand({
        name: 'intent',
        description: 'Show architectural intent from commit history',
        execute: async ({ args, writeOutput }) => {
            if (args.length === 0) {
                writeOutput('Usage: intent <filename>');
                return;
            }
            const ids = getOwnerRepo();
            if (!ids) {
                writeOutput('No repository ingested.', '#EF4444');
                return;
            }

            const match = findNode(args.join(' '), writeOutput);
            if (!match) return;

            const store = useAppStore.getState();
            // Clear previous + show loading panel immediately
            store.setIntentData(null);
            store.setIntentError(null);
            store.setIntentLoading(true);
            store.setSelectedFile(match.id);

            writeOutput(`Analyzing architectural intent for ${match.id}...`);
            try {
                const data = await apiClient.post('/intent', {
                    owner: ids.owner,
                    repo: ids.repo,
                    file_path: match.id,
                });
                store.setIntentLoading(false);
                store.setIntentData(data);
                writeOutput(`Intent analysis complete — ${data.commits_analyzed} commits analyzed.`);
            } catch (e: any) {
                store.setIntentLoading(false);
                store.setIntentError(e.message || 'Intent analysis failed.');
                writeOutput(`Intent failed: ${e.message}`, '#EF4444');
            }
        }
    });

    registerCommand({
        name: 'explain',
        description: 'Jargon buster: simplify code concepts',
        execute: async ({ args, writeOutput }) => {
            if (args.length === 0) {
                writeOutput('Usage: explain <filename>');
                return;
            }
            const store = useAppStore.getState();
            const ids = getOwnerRepo();
            if (!ids) {
                writeOutput('No repository ingested.', '#EF4444');
                return;
            }

            const match = findNode(args.join(' '), writeOutput);
            if (!match) return;

            // Clear previous + show loading panel immediately
            store.setExplainData(null);
            store.setExplainError(null);
            store.setExplainLoading(true);
            store.setSelectedFile(match.id);

            writeOutput(`Fetching ${match.id} for explanation...`);

            // Get file content
            let content: string;
            try {
                const rawUrl = `https://raw.githubusercontent.com/${ids.owner}/${ids.repo}/main/${match.id}`;
                const resp = await fetch(rawUrl);
                if (!resp.ok) {
                    const resp2 = await fetch(rawUrl.replace('/main/', '/master/'));
                    if (!resp2.ok) throw new Error('Could not fetch file from GitHub.');
                    content = await resp2.text();
                } else {
                    content = await resp.text();
                }
            } catch (e: any) {
                store.setExplainLoading(false);
                store.setExplainError(`Could not fetch file: ${e.message}`);
                writeOutput(`Fetch failed: ${e.message}`, '#EF4444');
                return;
            }

            writeOutput('Sending to AI for jargon analysis...');
            try {
                const data = await apiClient.post('/explain', {
                    content: content.slice(0, 6000),
                    language: store.userProfile.language === 'hinglish' ? 'Hinglish' :
                        store.userProfile.language === 'hindi' ? 'Hindi' : 'English'
                });
                store.setExplainLoading(false);
                store.setExplainData(data);
                writeOutput('Explanation ready — panel opened.');
            } catch (e: any) {
                store.setExplainLoading(false);
                store.setExplainError(e.message || 'Jargon analysis failed.');
                writeOutput(`Explain failed: ${e.message}`, '#EF4444');
            }
        }
    });
};
