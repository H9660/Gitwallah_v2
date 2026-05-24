import { useEffect, useRef } from 'react';

// xterm and addons loaded via CDN in index.html
// But here we import them dynamically if the npm package is used
// For Vite, install: npm i xterm xterm-addon-fit xterm-addon-web-links

let Terminal, FitAddon, WebLinksAddon;
try {
    ({ Terminal } = await import('xterm'));
    ({ FitAddon } = await import('xterm-addon-fit'));
    ({ WebLinksAddon } = await import('xterm-addon-web-links'));
} catch (_) {
    // Fallback: globals from CDN (if loaded via index.html)
    Terminal = window.Terminal;
    FitAddon = window.FitAddon;
    WebLinksAddon = window.WebLinksAddon;
}

export default function TerminalComponent({ wsRef, onReady }) {
    const containerRef = useRef(null);
    const termRef = useRef(null);
    const fitRef = useRef(null);

    useEffect(() => {
        if (!containerRef.current || termRef.current) return;

        const term = new Terminal({
            theme: {
                background: '#0a0c10',
                foreground: '#e2e8f0',
                cursor: '#6c63ff',
                cursorAccent: '#0a0c10',
                black: '#1e222a',
                brightBlack: '#64748b',
                red: '#ef4444',
                green: '#22c55e',
                yellow: '#eab308',
                blue: '#6c63ff',
                magenta: '#a78bfa',
                cyan: '#22d3ee',
                white: '#e2e8f0',
                brightWhite: '#f8fafc',
            },
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 13,
            lineHeight: 1.5,
            cursorBlink: true,
            cursorStyle: 'bar',
            scrollback: 3000,
            cols: 120,
            rows: 30,
        });

        const fit = new FitAddon();
        const webLinks = new WebLinksAddon();
        term.loadAddon(fit);
        term.loadAddon(webLinks);

        term.open(containerRef.current);
        fit.fit();

        term.onData((data) => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'input', data }));
            }
        });

        termRef.current = term;
        fitRef.current = fit;
        if (onReady) onReady(term, fit);

        const resizeObserver = new ResizeObserver(() => {
            try {
                fit.fit();
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
                }
            } catch (_) { }
        });
        resizeObserver.observe(containerRef.current);

        return () => {
            resizeObserver.disconnect();
            term.dispose();
            termRef.current = null;
        };
    }, []);

    return (
        <div
            ref={containerRef}
            style={{ width: '100%', height: '100%', minHeight: '400px' }}
        />
    );
}
