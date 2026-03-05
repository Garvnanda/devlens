import { useEffect, useRef } from 'react';
import { Terminal as XTerminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { useAppStore } from '../../store/useAppStore';
import { executeCommand } from '../../core/CommandParser';
import { motion } from 'framer-motion';

export const Terminal = () => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTerminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const inputBuffer = useRef<string>('');
    const historyIndex = useRef<number>(-1);
    const { mode } = useAppStore();

    useEffect(() => {
        if (!terminalRef.current || xtermRef.current) return;

        const term = new XTerminal({
            fontFamily: 'monospace',
            fontSize: 14,
            theme: {
                background: '#00000000', // transparent
                foreground: '#E2E8F0',
                cursor: '#E2E8F0',
            },
            cursorBlink: true,
            scrollback: 1000,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        term.open(terminalRef.current);
        fitAddon.fit();

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        term.writeln('DevLens OS [Version 1.0.0]');
        term.writeln('(c) DevLens Corporation. All rights reserved.\r\n');
        prompt(term);

        term.onData((data) => {
            const state = useAppStore.getState();

            // Handle pasting (multiple characters at once)
            if (data.length > 1 && !data.startsWith('\x1b')) {
                const cleanData = data.replace(/[\r\n]+/g, '');
                inputBuffer.current += cleanData;
                term.write(cleanData);
                return;
            }

            // Handle special single characters
            switch (data) {
                case '\r': { // Enter
                    const textToExecute = inputBuffer.current;
                    inputBuffer.current = '';
                    term.write('\r\n');

                    const writeOutput = (text: string, color?: string) => {
                        if (color === '#EF4444') {
                            term.writeln(`\x1b[31m${text}\x1b[0m`);
                        } else {
                            term.writeln(text);
                        }
                    };

                    if (textToExecute.trim()) {
                        executeCommand(textToExecute, writeOutput).then(() => {
                            historyIndex.current = -1;
                            prompt(term);
                        });
                    } else {
                        prompt(term);
                    }
                    break;
                }

                case '\x7F': // Backspace
                case '\b':
                    if (inputBuffer.current.length > 0) {
                        inputBuffer.current = inputBuffer.current.slice(0, -1);
                        term.write('\b \b');
                    }
                    break;

                case '\x1b[A': { // Up Arrow
                    const inputsUp = state.cliHistory.filter(h => h.startsWith('> ')).map(h => h.substring(2));
                    if (inputsUp.length > 0) {
                        if (historyIndex.current < inputsUp.length - 1) {
                            historyIndex.current++;
                        }
                        const prev = inputsUp[inputsUp.length - 1 - historyIndex.current];
                        if (prev) {
                            clearInput(term, inputBuffer.current);
                            inputBuffer.current = prev;
                            term.write(prev);
                        }
                    }
                    break;
                }

                case '\x1b[B': { // Down Arrow
                    const inputsDown = state.cliHistory.filter(h => h.startsWith('> ')).map(h => h.substring(2));
                    if (historyIndex.current > 0) {
                        historyIndex.current--;
                        const next = inputsDown[inputsDown.length - 1 - historyIndex.current];
                        clearInput(term, inputBuffer.current);
                        inputBuffer.current = next;
                        term.write(next);
                    } else if (historyIndex.current === 0) {
                        historyIndex.current = -1;
                        clearInput(term, inputBuffer.current);
                        inputBuffer.current = '';
                    }
                    break;
                }

                case '\x1b[C': // Right Arrow — ignore
                case '\x1b[D': // Left Arrow — ignore
                    break;

                case '\x03': // Ctrl+C
                    inputBuffer.current = '';
                    term.write('^C\r\n');
                    prompt(term);
                    break;

                case '\x16': // Ctrl+V — read clipboard and inject
                    navigator.clipboard.readText().then(text => {
                        if (text) {
                            const clean = text.replace(/[\r\n]+/g, '');
                            inputBuffer.current += clean;
                            term.write(clean);
                        }
                    }).catch(() => { });
                    break;

                default:
                    // Printable characters
                    if (data >= String.fromCharCode(0x20) && data <= String.fromCharCode(0x7E) || data >= '\u00a0') {
                        inputBuffer.current += data;
                        term.write(data);
                    }
            }
        });

        const terminalEl = terminalRef.current;
        const resizeObserver = new ResizeObserver(() => {
            fitAddon.fit();
        });
        resizeObserver.observe(terminalEl);

        // Auto-focus terminal on click so keyboard input always works
        terminalEl.addEventListener('click', () => term.focus());

        return () => {
            resizeObserver.disconnect();
            term.dispose();
            xtermRef.current = null;
        };
    }, []);

    const prompt = (term: XTerminal) => {
        term.write('\r\n$ ');
    };

    const clearInput = (term: XTerminal, _currentInput: string) => {
        term.write('\r$ \x1b[K');
    };

    const isCenter = mode === 'landing' || mode === 'ingesting';
    const isFocus = mode === 'focus';
    const isFeatureExplorer = mode === 'feature-explorer';

    const layout = isCenter
        ? { width: '80vw', height: '80vh', left: '10vw', bottom: '10vh', top: '10vh', borderRadius: '16px', opacity: 1, scale: 1, pointerEvents: 'auto' as any }
        : isFeatureExplorer
            ? { width: '80vw', height: '80vh', left: '10vw', bottom: '10vh', top: '10vh', borderRadius: '24px', opacity: 0, scale: 0, pointerEvents: 'none' as any }
            : isFocus
                ? { width: '100vw', height: '120px', left: '0px', bottom: '0px', top: 'auto', borderRadius: '0px', opacity: 1, scale: 1, pointerEvents: 'auto' as any }
                : { width: '400px', height: '300px', left: '24px', bottom: '24px', top: 'auto', borderRadius: '16px', opacity: 1, scale: 1, pointerEvents: 'auto' as any };

    return (
        <motion.div
            initial={false}
            animate={layout}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="absolute z-[100] bg-background/80 backdrop-blur-xl border border-white/20 shadow-2xl overflow-hidden flex flex-col"
        >
            <div className="flex-1 w-full h-full p-4 text-text" ref={terminalRef} />
        </motion.div>
    );
};
