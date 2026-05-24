import { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useChallengeSetup } from '../contexts/ChallengeContext';
import { useToast } from '../contexts/ToastContext';
import ResultsModal from '../components/ResultsModal';
import DuelPanel from '../components/DuelPanel';
import GeneratingModal from '../components/GeneratingModal';
import './ChallengePage.css';

const WS_HOST = import.meta.env.VITE_BACKEND_URL;
const WS_PORT = import.meta.env.VITE_BACKEND_PORT || '3000';
const WS_URL = import.meta.env.DEV
    ? `ws://${location.hostname}:${WS_PORT}`    
    : WS_HOST
        ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${WS_HOST}:${WS_PORT}`
        : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;

function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function HintsToggle({ hints }) {
    const [open, setOpen] = useState(false);
    if (!hints || hints.length === 0) return null;
    return (
        <div className="hints-section">
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)}>
                {open ? 'Hide Hints' : 'Show Hints'}
            </button>
            {open && (
                <ul className="hints-list">
                    {hints.map((h, i) => <li key={i}><HighlightedText text={h} /></li>)}
                </ul>
            )}
        </div>
    );
}

// Highlights git terms like branches, commands, files, etc.
function HighlightedText({ text }) {
    if (!text) return null;

    // Regex matches text wrapped in backticks OR common git words
    const parts = text.split(/(`[^`]+`)/g);

    return (
        <span>
            {parts.map((part, i) => {
                if (part.startsWith('`') && part.endsWith('`')) {
                    // Extract the text inside backticks
                    const inner = part.slice(1, -1);
                    let badgeClass = '';
                    if (inner.startsWith('git ')) badgeClass = 'highlight-git';
                    else if (inner.includes('.') || inner.includes('/')) badgeClass = 'highlight-file';
                    else badgeClass = 'highlight-branch';

                    return <code key={i} className={badgeClass}>{inner}</code>;
                }
                return part;
            })}
        </span>
    );
}

// Keyboard shortcut badge component
function KbdBadge({ keys }) {
    return (
        <span className="kbd-badge">
            {keys.map((k, i) => (
                <span key={i}>
                    {i > 0 && <span className="kbd-plus">+</span>}
                    <kbd>{k}</kbd>
                </span>
            ))}
        </span>
    );
}

export default function ChallengePage() {
    const { user } = useAuth();
    const toast = useToast();
    const {
        challenge,
        generating,
        fetchChallenge: fetchContextChallenge,
        clearChallenge,
        elapsed,
        stopTimer
    } = useChallengeSetup();

    // If the URL has ?room= (share link), immediately go to duel mode so DuelPanel mounts
    const [mode, setMode] = useState(() =>
        new URLSearchParams(location.search).has('room') ? 'duel' : 'solo'
    );
    const [difficulty, setDifficulty] = useState('All');
    const [model, setModel] = useState('gemini-2.5-flash');

    const [terminalActive, setTerminalActive] = useState(false);
    const [judging, setJudging] = useState(false);
    const [result, setResult] = useState(null);

    // Resizing Problem Section
    const [leftWidth, setLeftWidth] = useState(380);
    const [isDragging, setIsDragging] = useState(false);

    const termContainerRef = useRef(null);
    const termRef = useRef(null);
    const wsRef = useRef(null);

    // Refs for keyboard shortcut handlers (avoid stale closures)
    const judgingRef = useRef(judging);
    const generatingRef = useRef(generating);
    const challengeRef = useRef(challenge);
    const resultRef = useRef(result);

    useEffect(() => { judgingRef.current = judging; }, [judging]);
    useEffect(() => { generatingRef.current = generating; }, [generating]);
    useEffect(() => { challengeRef.current = challenge; }, [challenge]);
    useEffect(() => { resultRef.current = result; }, [result]);

    // Initialize Terminal exactly once
    useEffect(() => {
        if (!termContainerRef.current) return;
        const term = new Terminal({
            theme: {
                background: '#0a0c10',
                foreground: '#c9d1d9',
                cursor: '#58a6ff',
                cursorAccent: '#0a0c10',
                selectionBackground: 'rgba(56, 139, 253, 0.4)',
                black: '#484f58',
                red: '#ff7b72',
                green: '#3fb950',
                yellow: '#d29922',
                blue: '#58a6ff',
                magenta: '#bc8cff',
                cyan: '#39c5cf',
                white: '#b1bac4',
                brightBlack: '#6e7681',
                brightRed: '#ffa198',
                brightGreen: '#56d364',
                brightYellow: '#e3b341',
                brightBlue: '#79c0ff',
                brightMagenta: '#d2a8ff',
                brightCyan: '#56d4dd',
                brightWhite: '#ffffff',
            },
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 14,
            cursorBlink: true,
        });

        termRef.current = term;
        term.open(termContainerRef.current);

        const fit = new FitAddon();
        term.loadAddon(fit);
        try { term.loadAddon(new WebLinksAddon()); } catch (e) { }

        requestAnimationFrame(() => {
            try { fit.fit(); } catch (_) { }
        });

        term.onData((data) => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'input', data }));
            }
        });

        const handleResize = () => {
            try {
                fit.fit();
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({
                        type: 'resize',
                        cols: term.cols,
                        rows: term.rows
                    }));
                }
            } catch (_) { }
        };
        window.addEventListener('resize', handleResize);

        // Connect WebSocket
        const connectWs = () => {
            const ws = new WebSocket(WS_URL);
            ws.onmessage = (msg) => {
                const data = JSON.parse(msg.data);
                if (data.type === 'output') {
                    term.write(data.data);
                }
            };
            ws.onopen = () => {
                setTerminalActive(true);
                ws.send(JSON.stringify({ type: 'solo-init' }));
                handleResize(); // this makes sure that the backend knows our terminal size on initial connection, in case it changed since last connection
            };
            ws.onclose = () => {
                setTerminalActive(false);
                setTimeout(connectWs, 2000);
            };
            wsRef.current = ws;
        };
        connectWs();

        return () => {
            window.removeEventListener('resize', handleResize);
            term.dispose();
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.close();
            }
        };
    }, []);

    // Handle Drag Resizing
    useEffect(() => { 
        if (!isDragging) return;

        const handleMouseMove = (e) => {
            // Keep width between 250px and 60% of window width roughly
            const newWidth = Math.max(250, Math.min(e.clientX - 20, window.innerWidth * 0.7));
            setLeftWidth(newWidth);
            // Trigger term fit for smooth resizing
            requestAnimationFrame(() => {
                if (termRef.current) {
                    try { termRef.current.element.parentElement.style.opacity = 1; window.dispatchEvent(new Event('resize')); } catch (_) { }
                }
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            window.dispatchEvent(new Event('resize')); // Final fit
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    // Re-fit terminal when challenge appears (placeholder is removed, xterm needs new dimensions)
    useEffect(() => {
        if (challenge && termRef.current) {
            // Wait for DOM to update (placeholder removed) then fit
            requestAnimationFrame(() => {
                window.dispatchEvent(new Event('resize'));
            });
            // Second fit after a short delay to catch any race conditions
            const timer = setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
                termRef.current?.focus();
            }, 200);
            return () => clearTimeout(timer);
        }
    }, [challenge]);

    const handleFetchChallenge = useCallback(async () => {
        termRef.current?.clear();
        const success = await fetchContextChallenge(difficulty, model);
        if (success && wsRef.current?.readyState === WebSocket.OPEN && termRef.current) {
            wsRef.current.send(JSON.stringify({ type: 'resize', cols: termRef.current.cols, rows: termRef.current.rows }));
            toast.success('Challenge ready — good luck! ⚡');
        } else if (!success) {
            toast.error('Failed to generate challenge');
        }
    }, [difficulty, model, fetchContextChallenge, toast]);

    // DRY principle to be applied
    const handleJudge = useCallback(async () => {
        if (!challengeRef.current) return;
        setJudging(true);
        stopTimer();
        try {
            const res = await api.post('/challenge/judge', { model, elapsed });
            setResult({ ...res.data, timeMs: elapsed });
        } catch (err) {
            console.error(err);
            toast.error('Judging failed — please try again');
        } finally {
            setJudging(false);
        }
    }, [model, elapsed, stopTimer, toast]);

    const handleReReview = async () => {
        setJudging(true);
        try {
            const res = await api.post('/judge/review', { model: model });
            setResult({ ...res.data, timeMs: elapsed, isReReview: true });
            toast.info('Re-review complete');
        } catch (err) {
            console.error(err);
            toast.error('Re-review failed');
        } finally {
            setJudging(false);
        }
    };

    const handleNext = () => {
        setResult(null);
        handleFetchChallenge();
    };

    // ── Keyboard Shortcuts ──
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Ctrl+Enter → Judge
            if (e.ctrlKey && e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (challengeRef.current && !judgingRef.current && !generatingRef.current) {
                    handleJudge();
                }
                return;
            }

            // Ctrl+Shift+N → New Challenge
            if (e.ctrlKey && e.shiftKey && (e.key === 'N' || e.key === 'n')) {
                e.preventDefault();
                if (!judgingRef.current && !generatingRef.current) {
                    handleFetchChallenge();
                }
                return;
            }

            // Escape → Close result modal
            if (e.key === 'Escape') {
                if (resultRef.current) {
                    e.preventDefault();
                    setResult(null);
                }
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleJudge, handleFetchChallenge]);

    if (mode === 'duel') {
        return (
            <div className="challenge-page">
                <div className="challenge-topbar">
                    <div className="challenge-topbar__stats">
                        <div className="mini-stat">
                            <span className="mini-stat__value">{user?.stats?.solved || 0}</span>
                            <span className="mini-stat__label">Completed</span>
                        </div>
                        <div className="mini-stat">
                            <span className="mini-stat__value">{user?.stats?.avgScore?.toFixed(2) || 0}</span>
                            <span className="mini-stat__label">Avg Score</span>
                        </div>
                    </div>
                    <div className="challenge-topbar__controls">
                        <div className="mode-group">
                            <button className="mode-btn" onClick={() => setMode('solo')}>🎯 Solo</button>
                            <button className="mode-btn mode-btn--active">⚔️ Duel</button>
                        </div>
                        <div className="model-select-wrapper">
                            <span className="model-select-icon">🧠</span>
                            <select className="model-select-custom" value={model} onChange={e => setModel(e.target.value)}>
                                <option value="gemini-3-flash-preview">Gemini 3.0 Flash</option>
                                <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro P</option>
                                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                            </select>
                        </div>
                    </div>
                </div>
                <DuelPanel model={model} onSwitchMode={() => setMode('solo')} user={user} />
            </div>
        );
    }

    return (
        <div className="challenge-page">
            {/* Topbar */}
            <div className="challenge-topbar">
                <div className="challenge-topbar__stats">
                    <div className="mini-stat">
                        <span className="mini-stat__value">{user?.stats?.solved || 0}</span>
                        <span className="mini-stat__label">Completed</span>
                    </div>
                    <div className="mini-stat">
                        <span className="mini-stat__value">{user?.stats?.avgScore?.toFixed(2) || 0}</span>
                        <span className="mini-stat__label">Avg Score</span>
                    </div>
                </div>

                <div className="challenge-topbar__controls">
                    <div className="diff-group">
                        {['All', 'Beginner', 'Intermediate', 'Advanced'].map(d => (
                            <button
                                key={d}
                                className={`diff-btn ${difficulty === d ? 'diff-btn--active' : ''}`}
                                onClick={() => setDifficulty(d)}
                            >
                                {d === 'Beginner' && '🟢 '}
                                {d === 'Intermediate' && '🟡 '}
                                {d === 'Advanced' && '🔴 '}
                                {d}
                            </button>
                        ))}
                    </div>
                    <div className="mode-group">
                        <button className="mode-btn mode-btn--active">🎯 Solo</button>
                        <button className="mode-btn" onClick={() => setMode('duel')}>⚔️ Duel</button>
                    </div>
                    <div className="model-select-wrapper">
                        <span className="model-select-icon">🧠</span>
                        <select className="model-select-custom" value={model} onChange={e => setModel(e.target.value)}>
                            <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                            <option value="gemini-3-flash-preview">Gemini 3.0 Flash</option>
                            <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro P</option>
                            <option value="gemini-3.1-flash-live-preview">Gemini 3.1 Flash live</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Main Split */}
            <div className="challenge-layout">
                {/* Left: Challenge Info */}
                <section className="challenge-panel card" style={{ width: leftWidth, flex: 'none', transition: isDragging ? 'none' : 'width 0.1s' }}>
                    <div className="panel-header">
                        <h2 className="panel-title">Challenge</h2>
                        {challenge?.isAIGenerated && (
                            <span className="badge badge--ai">🤖 AI</span>
                        )}
                        {challenge && (
                            <span className={`badge badge--diff badge--diff-${challenge?.difficulty?.toLowerCase() || 'beginner'}`}>
                                {challenge?.difficulty?.toUpperCase() || 'BEGINNER'}
                            </span>
                        )}
                    </div>

                    {!challenge ? (
                        <div className="challenge-empty">
                            <div className="challenge-empty__icon">⚡</div>
                            <h3>Ready to Test Your Git Skills?</h3>
                            <p>Click <strong>Play</strong> to get a Git challenge. Solve it in the terminal, then click <strong>Judge Me</strong>.</p>
                        </div>
                    ) : (
                        <div className="challenge-content">
                            <h1 className="challenge-title">{challenge.title}</h1>
                            {challenge.isAIGenerated && (
                                <p className="challenge-ai-note">✨ Uniquely crafted by AI just for you</p>
                            )}
                            <div className="challenge-description">
                                <HighlightedText text={challenge.description} />
                            </div>
                            <HintsToggle hints={challenge.hints} />
                        </div>
                    )}
                </section>

                {/* Drag Handle */}
                <div
                    className="resizer-bar"
                    onMouseDown={(e) => { e.preventDefault(); setIsDragging(true); }}
                    style={{ background: isDragging ? 'var(--accent2)' : '' }}
                />

                {/* Right: Terminal */}
                <section className="terminal-panel card">
                    <div className="panel-header">
                        <h2 className="panel-title">Terminal</h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div className="timer-display">
                                ⏱ <span>{formatTime(elapsed)}</span>
                            </div>
                            <div className={`terminal-status ${terminalActive ? 'terminal-status--on' : ''}`}>
                                <span className="terminal-dot" /> {terminalActive ? 'Connected' : 'Disconnected'}
                            </div>
                        </div>
                    </div>
                    <div className="terminal-body" style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                        {!challenge ? (
                            <div className="terminal-placeholder" style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0c10' }}>
                                <p>Start a challenge to open the terminal</p>
                            </div>
                        ) : null}
                        <div ref={termContainerRef} style={{ flex: 1, width: '100%' }} />
                    </div>
                </section>
            </div>

            {/* Action Bar */}
            <div className="action-bar">
                <button
                    className={`btn btn-primary ${generating ? 'btn-loading' : ''}`}
                    onClick={handleFetchChallenge}
                    disabled={judging || generating}
                >
                    {generating ? '✨ AI Generating...' : '▶ Play'}
                    {!generating && <KbdBadge keys={['Ctrl', '⇧', 'N']} />}
                </button>
                <button
                    className={`btn btn-success ${judging ? 'btn-loading' : ''}`}
                    onClick={handleJudge}
                    disabled={!challenge || judging || generating}
                >
                    {judging ? '⚖️ AI Analyzing Code...' : '⚖️ Judge Me'}
                    {!judging && <KbdBadge keys={['Ctrl', '↵']} />}
                </button>
                <button
                    className="btn btn-ghost"
                    onClick={() => {
                        clearChallenge();
                        termRef.current?.clear();
                    }}
                    disabled={!challenge || judging}
                >
                    ⏭ Skip
                </button>
            </div>

            {/* Generating Modal */}
            <GeneratingModal visible={generating} />

            {/* Result Modal */}
            {result && (
                <ResultsModal
                    result={result}
                    challenge={challenge}
                    judging={judging}
                    onNext={handleNext}
                    onClose={() => setResult(null)}
                    onReReview={handleReReview}
                />
            )}
        </div>
    );
}
