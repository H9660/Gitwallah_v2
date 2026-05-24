import { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import api from '../api';
import './DuelPanel.css';

/**
 * Build a WebSocket URL for a given server host.
 * If the user opened the app via a ?server= param (joining from another device),
 * we use that host. Otherwise we fall back to the Vite proxy / production host.
 */
function buildWsUrl(serverHost) {
    if (serverHost) {
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        return `${proto}://${serverHost}:3000`;
    }
    return import.meta.env.DEV
        ? `ws://${location.hostname}:3000`
        : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
}

/**
 * Build an axios instance for a given server host.
 * When joining from another device we call the backend directly (bypassing Vite proxy).
 */
function buildApiClient(serverHost) {
    if (serverHost) {
        return axios.create({ baseURL: `http://${serverHost}:3000/api` });
    }
    return api;
}

export default function DuelPanel({ model, onSwitchMode, user, initialRoomId }) {
    const [phase, setPhase] = useState('lobby'); // lobby | creating | waiting | join | playing | finished
    const [roomId, setRoomId] = useState(null);
    const [playerName, setPlayerName] = useState(user?.username || '');
    const [opponentName, setOpponentName] = useState('');
    const [challenge, setChallenge] = useState(null);
    const [result, setResult] = useState(null);
    const [duelResult, setDuelResult] = useState(null);
    const [judging, setJudging] = useState(false);
    const [difficulty, setDifficulty] = useState('Random');
    const [role, setRole] = useState('host');
    const [joinRoomId, setJoinRoomId] = useState('');
    const [shareLink, setShareLink] = useState('');
    const [copied, setCopied] = useState(false);
    // remoteServer is the LAN IP of the host machine, read from ?server= URL param.
    const [remoteServer, setRemoteServer] = useState(null);

    // Resizable layout state (same pattern as ChallengePage)
    const [leftWidth, setLeftWidth] = useState(380);
    const [isDragging, setIsDragging] = useState(false);

    const wsRef = useRef(null);
    const termRef = useRef(null);
    const fitRef = useRef(null);
    const termContainerRef = useRef(null);

    // ── Read URL params on mount ──────────────────────────────
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        // Support both ?room= query param (old links) and initialRoomId prop (new /duel/:roomId path)
        const rid = params.get('room') || initialRoomId;
        const srv = params.get('server');
        if (rid) {
            setJoinRoomId(rid);
            if (srv) setRemoteServer(srv);
            setPhase('join');
        }
    }, [initialRoomId]);

    // ── Init terminal when entering playing phase ─────────────
    useEffect(() => {
        if (phase === 'playing' && termContainerRef.current && !termRef.current) {
            import('@xterm/xterm').then(({ Terminal }) =>
                import('@xterm/addon-fit').then(({ FitAddon }) =>
                    import('@xterm/xterm/css/xterm.css').then(() => {
                        const term = new Terminal({
                            theme: {
                                background: '#0a0c10',
                                foreground: '#e2e8f0',
                                cursor: '#6c63ff',
                                cursorAccent: '#0a0c10',
                                selectionBackground: 'rgba(108, 99, 255, 0.35)',
                                black: '#484f58', red: '#ff7b72', green: '#3fb950',
                                yellow: '#d29922', blue: '#58a6ff', magenta: '#bc8cff',
                                cyan: '#39c5cf', white: '#b1bac4',
                            },
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 13,
                            lineHeight: 1.5,
                            cursorBlink: true,
                            cursorStyle: 'bar',
                            scrollback: 5000,
                        });
                        const fit = new FitAddon();
                        term.loadAddon(fit);
                        term.open(termContainerRef.current);

                        requestAnimationFrame(() => {
                            try { fit.fit(); } catch (_) {}
                        });

                        term.onData(data => {
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
                                        rows: term.rows,
                                    }));
                                }
                            } catch (_) {}
                        };
                        window.addEventListener('resize', handleResize);

                        termRef.current = term;
                        fitRef.current = fit;

                        // Cleanup on unmount
                        return () => window.removeEventListener('resize', handleResize);
                    })
                )
            );
        }
    }, [phase]);

    // ── Drag-resize handler (same as ChallengePage) ───────────
    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e) => {
            const newWidth = Math.max(250, Math.min(e.clientX - 20, window.innerWidth * 0.65));
            setLeftWidth(newWidth);
            requestAnimationFrame(() => {
                try { window.dispatchEvent(new Event('resize')); } catch (_) {}
            });
        };
        const handleMouseUp = () => {
            setIsDragging(false);
            window.dispatchEvent(new Event('resize'));
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    // Re-fit terminal when leftWidth changes (drag resize)
    useEffect(() => {
        if (phase === 'playing') {
            requestAnimationFrame(() => {
                try { fitRef.current?.fit(); } catch (_) {}
            });
        }
    }, [leftWidth, phase]);

    // ── WebSocket connection ──────────────────────────────────
    const connectDuelWS = useCallback((rid, r, pName, srv) => {
        const wsUrl = buildWsUrl(srv);
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            ws.send(JSON.stringify({ type: 'duel-join', roomId: rid, role: r, playerName: pName, userId: user?.id }));
        };

        ws.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            if (msg.type === 'output') termRef.current?.write(msg.data);
            if (msg.type === 'opponent-joined') setOpponentName(msg.opponentName);
            if (msg.type === 'joined-room') {
                setOpponentName(msg.hostName);
                setPhase('waiting');
            }
            if (msg.type === 'duel-start') {
                setChallenge(msg.challenge);
                setPhase('playing');
            }
            if (msg.type === 'duel-result') {
                setDuelResult(msg);
                setPhase('finished');
            }
            if (msg.type === 'opponent-judging') setOpponentName(n => n.replace(' ✍️', '') + ' ✍️');
            if (msg.type === 'opponent-judge-failed') setOpponentName(n => n.replace(' ✍️', ''));
            if (msg.type === 'opponent-disconnected') setOpponentName(n => n + ' 💨');
            if (msg.type === 'error') console.error('WS error:', msg.error);
        };

        wsRef.current = ws;
    }, [user?.id]);

    // ── Handlers ─────────────────────────────────────────────
    const handleCreateDuel = async () => {
        setPhase('creating');
        try {
            const chosenDifficulty = difficulty === 'Random'
                ? ['Beginner', 'Intermediate', 'Advanced'][Math.floor(Math.random() * 3)]
                : difficulty;

            const r = await api.post('/duel/create', { difficulty: chosenDifficulty, playerName: playerName || 'Player 1', model });
            const rid = r.data.roomId;
            setRoomId(rid);
            setRole('host');

            // Get real LAN IP for the share link
            let shareOrigin = location.origin;
            try {
                const info = await api.get('/server-info');
                const { ip } = info.data;
                const frontendPort = import.meta.env.DEV ? '5173' : location.port;
                shareOrigin = `http://${ip}${frontendPort ? `:${frontendPort}` : ''}`;
            } catch (_) {}

            const serverParam = shareOrigin.replace(/^https?:\/\//, '').split(':')[0];
            // Use /duel/:roomId path so the recipient lands directly on the join screen
            setShareLink(`${shareOrigin}/duel/${rid}?server=${serverParam}`);

            setPhase('waiting');
            connectDuelWS(rid, 'host', playerName || 'Player 1', null);
        } catch (e) { setPhase('lobby'); }
    };

    const handleJoinDuel = async () => {
        const rid = joinRoomId.trim().toUpperCase();
        if (!rid) return;
        const srv = remoteServer || new URLSearchParams(location.search).get('server');
        setRoomId(rid);
        setRole('challenger');
        setPhase('waiting');
        connectDuelWS(rid, 'challenger', playerName || 'Player 2', srv);
    };

    const handleAccept = async () => {
        try {
            await buildApiClient(null).post(`/duel/${roomId}/accept`);
        } catch (e) {}
    };

    const handleJudge = async () => {
        setJudging(true);
        try {
            const apiClient = buildApiClient(remoteServer);
            const r = await apiClient.post(`/duel/${roomId}/judge`, { role, model });
            if (!r.data.passed) setResult(r.data);
        } catch (e) {}
        setJudging(false);
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(shareLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const resetToLobby = () => {
        setPhase('lobby');
        setChallenge(null);
        setRoomId(null);
        setDuelResult(null);
        setOpponentName('');
        setResult(null);
        setShareLink('');
        if (termRef.current) { termRef.current.dispose(); termRef.current = null; }
    };

    // ══════════════════════════════════════════════════════════
    // ── JOIN PHASE (from share link) ──────────────────────────
    // ══════════════════════════════════════════════════════════
    if (phase === 'join') return (
        <div className="duel-center-stage">
            <div className="duel-glass-card duel-join-card--centered">
                <div className="duel-swords-icon">⚔️</div>
                <h2 className="duel-card-title">You've Been Challenged!</h2>
                <p className="duel-card-sub">
                    Room <span className="duel-room-code">{joinRoomId}</span>
                    {remoteServer && <> · <span className="duel-server-tag">{remoteServer}</span></>}
                </p>
                <div className="duel-field">
                    <label className="duel-label">Your Name</label>
                    <input
                        className="input"
                        placeholder="Enter your name…"
                        value={playerName}
                        onChange={e => setPlayerName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleJoinDuel()}
                        autoFocus
                    />
                </div>
                <button className="btn btn-primary w-full duel-cta-btn" onClick={handleJoinDuel}>
                    ⚔️ Accept the Challenge
                </button>
            </div>
        </div>
    );

    // ══════════════════════════════════════════════════════════
    // ── LOBBY ─────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════
    if (phase === 'lobby' || phase === 'creating') return (
        <div className="duel-lobby-page page">
            <div className="duel-lobby-header">
                <button className="btn btn-ghost btn-sm" onClick={onSwitchMode}>← Solo</button>
                <div>
                    <h2 className="page-title">⚔️ Duel Mode</h2>
                    <p className="page-subtitle">Challenge a friend to a real-time Git battle</p>
                </div>
            </div>

            <div className="duel-lobby-grid">
                {/* Create card */}
                <div className="card duel-action-card duel-action-card--create">
                    <div className="duel-action-card__icon">🏟️</div>
                    <h3 className="duel-action-card__title">Create a Room</h3>
                    <p className="duel-action-card__desc">Start a new duel and invite a friend</p>
                    <div className="duel-fields">
                        <div className="duel-field">
                            <label className="duel-label">Your Name</label>
                            <input className="input" placeholder="Display name" value={playerName} onChange={e => setPlayerName(e.target.value)} />
                        </div>
                        <div className="duel-field">
                            <label className="duel-label">Difficulty</label>
                            <select className="input" value={difficulty} onChange={e => setDifficulty(e.target.value)}>
                                <option value="Random">🎲 Random</option>
                                <option value="Beginner">🟢 Beginner</option>
                                <option value="Intermediate">🟡 Intermediate</option>
                                <option value="Advanced">🔴 Advanced</option>
                            </select>
                        </div>
                    </div>
                    <button
                        className="btn btn-primary w-full duel-action-card__btn"
                        onClick={handleCreateDuel}
                        disabled={phase === 'creating'}
                    >
                        {phase === 'creating' ? (
                            <><span className="duel-spinner" /> Generating Challenge…</>
                        ) : '⚔️ Create Duel Room'}
                    </button>
                </div>

                {/* Join card */}
                <div className="card duel-action-card duel-action-card--join">
                    <div className="duel-action-card__icon">🔗</div>
                    <h3 className="duel-action-card__title">Join a Room</h3>
                    <p className="duel-action-card__desc">Enter a room code to jump into a duel</p>
                    <div className="duel-fields">
                        <div className="duel-field">
                            <label className="duel-label">Your Name</label>
                            <input className="input" placeholder="Display name" value={playerName} onChange={e => setPlayerName(e.target.value)} />
                        </div>
                        <div className="duel-field">
                            <label className="duel-label">Room Code</label>
                            <input
                                className="input duel-room-input"
                                placeholder="ABC123"
                                value={joinRoomId}
                                onChange={e => setJoinRoomId(e.target.value.toUpperCase())}
                                onKeyDown={e => e.key === 'Enter' && handleJoinDuel()}
                                maxLength={8}
                            />
                        </div>
                    </div>
                    <button
                        className="btn btn-green w-full duel-action-card__btn"
                        onClick={handleJoinDuel}
                        disabled={!joinRoomId}
                    >
                        🎯 Join Room
                    </button>
                </div>
            </div>
        </div>
    );

    // ══════════════════════════════════════════════════════════
    // ── WAITING ───────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════
    if (phase === 'waiting') return (
        <div className="duel-center-stage">
            <div className="duel-glass-card duel-wait-card">
                <div className="duel-swords-icon duel-swords-icon--pulse">⚔️</div>
                <h2 className="duel-card-title">
                    {role === 'host' ? 'Room Created!' : 'Waiting for host…'}
                </h2>
                <p className="duel-card-sub">
                    {role === 'host'
                        ? 'Share the link below. The game starts once your opponent joins.'
                        : 'Hold tight — the host will start the duel soon.'}
                </p>

                {shareLink && (
                    <div className="duel-share-box">
                        <div className="duel-share-label">
                            <span>🔗 Invite Link</span>
                            <span className="duel-room-code-pill">Room: {roomId}</span>
                        </div>
                        <div className="duel-share-row">
                            <input className="input duel-share-input" readOnly value={shareLink} />
                            <button
                                className={`btn ${copied ? 'btn-success' : 'btn-secondary'} duel-copy-btn`}
                                onClick={handleCopy}
                            >
                                {copied ? '✅ Copied!' : '📋 Copy'}
                            </button>
                        </div>
                    </div>
                )}

                {opponentName ? (
                    <div className="duel-opponent-ready">
                        <div className="duel-opponent-badge">
                            <span className="duel-online-dot" />
                            <span>{opponentName} joined!</span>
                        </div>
                        {role === 'host' && (
                            <button className="btn btn-primary w-full duel-cta-btn" onClick={handleAccept}>
                                🚀 Start the Duel!
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="duel-waiting-animation">
                        <div className="duel-pulse-ring" />
                        <div className="duel-pulse-ring duel-pulse-ring--2" />
                        <div className="duel-pulse-ring duel-pulse-ring--3" />
                        <span className="duel-waiting-dots">
                            <span /><span /><span />
                        </span>
                    </div>
                )}
            </div>
        </div>
    );

    // ══════════════════════════════════════════════════════════
    // ── PLAYING ───────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════
    if (phase === 'playing') return (
        <div className="challenge-page">
            {/* Topbar */}
            <div className="challenge-topbar">
                <div className="challenge-topbar__stats">
                    <div className="duel-vs-chip">
                        <span className="duel-online-dot" />
                        <span>⚔️ vs <strong>{opponentName.replace(' ✍️', '').replace(' 💨', '')}</strong></span>
                        {opponentName.includes('✍️') && <span className="duel-judging-badge">judging…</span>}
                        {opponentName.includes('💨') && <span className="duel-dc-badge">disconnected</span>}
                    </div>
                </div>
                <div className="challenge-topbar__controls">
                    <span className={`badge ${
                        challenge?.difficulty === 'Beginner' ? 'badge-beginner' :
                        challenge?.difficulty === 'Intermediate' ? 'badge-intermediate' :
                        'badge-advanced'
                    }`}>{challenge?.difficulty}</span>
                </div>
            </div>

            {/* Main split layout with resizer */}
            <div className="challenge-layout">
                {/* Left: Challenge */}
                <section
                    className="challenge-panel card"
                    style={{ width: leftWidth, flex: 'none', transition: isDragging ? 'none' : 'width 0.1s', overflow: 'auto' }}
                >
                    <div className="panel-header">
                        <h2 className="panel-title">Challenge</h2>
                    </div>
                    {challenge && (
                        <div className="challenge-content">
                            <h1 className="challenge-title">{challenge.title}</h1>
                            <p className="challenge-description">{challenge.description}</p>
                            {challenge.hints?.length > 0 && (
                                <div className="hints-section">
                                    <p className="duel-hints-header">💡 Hints</p>
                                    <ul className="hints-list">
                                        {challenge.hints.map((h, i) => <li key={i}>{h}</li>)}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </section>

                {/* Drag handle */}
                <div
                    className="resizer-bar"
                    onMouseDown={e => { e.preventDefault(); setIsDragging(true); }}
                    style={{ background: isDragging ? 'var(--accent2)' : '' }}
                />

                {/* Right: Terminal */}
                <section className="terminal-panel card">
                    <div className="panel-header">
                        <h2 className="panel-title">Terminal</h2>
                        <div className="duel-terminal-status">
                            <span className="duel-online-dot" />
                            <span>Live</span>
                        </div>
                    </div>
                    <div className="terminal-body" style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                        <div ref={termContainerRef} style={{ flex: 1, width: '100%' }} />
                    </div>
                </section>
            </div>

            {/* Action bar */}
            <div className="action-bar">
                <button className="btn btn-success" onClick={handleJudge} disabled={judging}>
                    {judging ? '⚖️ AI Analyzing…' : '⚖️ Judge Me'}
                </button>
            </div>

            {/* Failed judge toast */}
            {result && !result.passed && (
                <div className="loading-overlay" style={{ background: 'rgba(10,12,16,0.7)', backdropFilter: 'blur(4px)' }}>
                    <div className="card duel-result-popup">
                        <div className="duel-result-popup__icon">❌</div>
                        <p className="duel-result-popup__score">Score: <strong>{result.score}</strong>/100</p>
                        <p className="duel-result-popup__msg">{result.feedback}</p>
                        <button className="btn btn-ghost btn-sm w-full" onClick={() => setResult(null)}>Keep trying →</button>
                    </div>
                </div>
            )}
        </div>
    );

    // ══════════════════════════════════════════════════════════
    // ── FINISHED ──────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════
    if (phase === 'finished') return (
        <div className="duel-center-stage">
            <div className={`duel-glass-card duel-result-card ${duelResult?.won ? 'duel-result-card--win' : 'duel-result-card--lose'}`}>
                <div className="duel-result-trophy">{duelResult?.won ? '🏆' : '😔'}</div>
                <h2 className="duel-result-title">{duelResult?.won ? 'Victory!' : 'You Lost'}</h2>
                {duelResult?.result?.score != null && (
                    <div className="duel-result-score-ring">
                        <span className="duel-result-score-num">{duelResult.result.score}</span>
                        <span className="duel-result-score-label">/ 100</span>
                    </div>
                )}
                {duelResult?.result?.feedback && (
                    <p className="duel-result-feedback">{duelResult.result.feedback}</p>
                )}
                <div className="duel-result-actions">
                    <button className="btn btn-primary" onClick={resetToLobby}>⚔️ New Duel</button>
                    <button className="btn btn-ghost" onClick={onSwitchMode}>← Solo Mode</button>
                </div>
            </div>
        </div>
    );

    return null;
}
