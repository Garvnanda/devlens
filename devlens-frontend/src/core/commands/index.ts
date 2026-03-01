import { registerCommand } from '../CommandRegistry';
import { useAppStore } from '../../store/useAppStore';
import { StateMachine } from '../StateMachine';
import { apiClient } from '../apiClient';

export const initCommands = () => {
    registerCommand({
        name: 'help',
        description: 'List all available commands',
        execute: ({ writeOutput }) => {
            writeOutput('Available commands:');
            writeOutput('  help           - Show this help message');
            writeOutput('  ingest <url>   - Ingest a GitHub repository');
            writeOutput('  map            - View the molecular dependency graph');
            writeOutput('  blast <file>   - Trigger blast animation on a file node');
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
        name: 'map',
        description: 'View the molecular dependency graph',
        execute: async ({ writeOutput }) => {
            const store = useAppStore.getState();
            if (!store.repoUrl) {
                writeOutput('No repository ingested. Run ingest <url> first.', '#EF4444');
                return;
            }

            try {
                // Determine owner/repo from URL
                const url = store.repoUrl;
                const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
                if (!match) throw new Error('Invalid stored github URL.');
                const owner = match[1];
                const repo = match[2];

                writeOutput('Connecting to graph database...');
                const data = await apiClient.get(`/repository/graph/${owner}/${repo}`);

                if (data && data.nodes) {
                    // Transform edges to links for ForceGraph3D
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

            // Remove angle brackets if user copy-pasted them
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

                    writeOutput("Ingestion complete. Use 'map' command to view graph.");
                    StateMachine.transition('landing'); // Return to landing so user can type map
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

            if (!store.graphData || !store.graphData.nodes || store.graphData.nodes.length === 0) {
                writeOutput('No graph data. Run ingest and map first.', '#EF4444');
                return;
            }

            // If in landing/ingesting, auto-transition to cockpit if graph exists
            if (store.mode === 'landing' || store.mode === 'ingesting') {
                StateMachine.transition('cockpit');
            }

            if (args.length === 0) {
                writeOutput('Usage: blast <filename>');
                writeOutput('Examples: blast App.tsx, blast BookReader');
                return;
            }

            const query = args.join(' ').toLowerCase();
            const allNodes = store.graphData.nodes;

            // Try exact match first
            let match = allNodes.find((n: any) => n.id === query);

            // Then try partial match (filename contains query)
            if (!match) {
                const matches = allNodes.filter((n: any) =>
                    n.id.toLowerCase().includes(query)
                );

                if (matches.length === 1) {
                    match = matches[0];
                } else if (matches.length > 1) {
                    writeOutput(`Multiple matches for '${query}':`);
                    matches.slice(0, 10).forEach((m: any) => {
                        writeOutput(`  ${m.id}`);
                    });
                    if (matches.length > 10) {
                        writeOutput(`  ... and ${matches.length - 10} more`);
                    }
                    writeOutput('Specify a more precise name.');
                    return;
                }
            }

            if (!match) {
                writeOutput(`No node matching '${query}' found.`, '#EF4444');
                return;
            }

            writeOutput(`Initiating blast sequence for ${match.id}...`);
            store.setBlastTarget(match.id);
            store.setSelectedFile(match.id);
        }
    });
};
