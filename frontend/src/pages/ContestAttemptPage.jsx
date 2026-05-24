import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useContest } from '../contexts/ContestContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import api from '../api';
import './ContestAttemptPage.css';

const WS_HOST = import.meta.env.VITE_BACKEND_URL;
const WS_PORT = import.meta.env.VITE_BACKEND_PORT || '3000';
const WS_URL = import.meta.env.DEV
    ? `ws://${location.hostname}:${WS_PORT}`
    : WS_HOST
        ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${WS_HOST}:${WS_PORT}`
        : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;

function formatTimer(ms) {
    if (!isFinite(ms) || ms <= 0) return '00:00:00';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function ContestAttemptPage() {
    const { contestId } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const { user } = useAuth();
    const {
        activeContest, challenges, activeChallengeIndex,
        setActiveChallengeIndex, submissions, setSubmissions,
        remaining, isContestOver, joinContest, setupChallenge, leaveContest,
        liveLeaderboard, setLiveLeaderboard,
    } = useContest();

    const [judging, setJudging] = useState(false);
    const [settingUp, setSettingUp] = useState(false);
    const [totalScore, setTotalScore] = useState(0);
    const [model, setModel] = useState('gemini-2.5-flash');
    const availableModels = [
        { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
        { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
        { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
        { value: 'gemini-3-flash-preview', label: 'Gemini 3.0 Flash P' },
    ];
    const [challengeStartTime, setChallengeStartTime] = useState(Date.now());
    const [showLeaderboard, setShowLeaderboard] = useState(false);
    const [leaderboard, setLeaderboard] = useState([]);
    const [leaderboardAutoRefresh, setLeaderboardAutoRefresh] = useState(true);

    const termContainerRef = useRef(null);
    const termRef = useRef(null);
    const fitRef = useRef(null);
    const wsRef = useRef(null);

    // ── Join on mount if not already ──
    useEffect(() => {
        if (!user) {
            navigate('/auth');
            return;
        }
        if (!activeContest || activeContest.id !== contestId) {
            joinContest(contestId).then(ok => {
                if (!ok) {
                    toast.error('Failed to join contest');
                    navigate('/contests');
                }
            });
        }
    }, []);

    // ── Terminal init with per-user contest WS ──
    useEffect(() => {
        if (!termContainerRef.current || termRef.current) return;

        console.log('Initializing terminal and connecting to contest WebSocket...');
        const term = new Terminal({
            theme: {
                background: '#0a0c10', foreground: '#c9d1d9',
                cursor: '#58a6ff', cursorAccent: '#0a0c10',
                selectionBackground: 'rgba(56, 139, 253, 0.4)',
                black: '#484f58', red: '#ff7b72', green: '#3fb950',
                yellow: '#d29922', blue: '#58a6ff', magenta: '#bc8cff',
                cyan: '#39c5cf', white: '#b1bac4',
            },
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 14, cursorBlink: true,
        });

        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(termContainerRef.current);
        requestAnimationFrame(() => { try { fit.fit(); } catch (_) { } });

        term.onData(data => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'input', data }));
            }
        });

        termRef.current = term;
        fitRef.current = fit;

        // Connect WS with per-user contest authentication
        const token = localStorage.getItem('GitWallah_token');
        console.log('Connecting to contest WebSocket with token:', !!token);
        const connectWs = () => {
            const ws = new WebSocket(WS_URL);
            ws.onmessage = (msg) => {
                const d = JSON.parse(msg.data);
                if (d.type === 'output') {
                    console.log('Received terminal output:', d.data);
                    term.write(d.data);
                } else if (d.type === 'leaderboard-update') {
                    // Real-time leaderboard from WebSocket
                    setLiveLeaderboard(d.leaderboard || []);
                    setLeaderboard(d.leaderboard || []);
                } else if (d.type === 'contest-ended') {
                    toast.warning('Contest has been ended by the creator');
                } else if (d.type === 'removed-from-contest') {
                    toast.error('You have been removed from this contest');
                    leaveContest();
                    navigate('/contests');
                } else if (d.type === 'contest-connected') {
                    requestAnimationFrame(() => { try { fit.fit(); } catch (_) { } });
                }
            };
            ws.onopen = () => {
                // Send contest-init with JWT for per-user sandbox routing
                console.log('WebSocket connected, sending contest-init with token:', !!token);
                ws.send(JSON.stringify({
                    type: 'contest-init',
                    contestId,
                    token,
                }));
                requestAnimationFrame(() => { try { fit.fit(); } catch (_) { } });
            };
            ws.onclose = () => {
                // Reconnect logic
                setTimeout(() => {
                    if (termRef.current) {
                        const ws2 = connectWs();
                        wsRef.current = ws2;
                    }
                }, 2000);
            };
            wsRef.current = ws;
            return ws;
        };

        connectWs();

        const handleResize = () => {
            try {
                fit.fit();
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
                }
            } catch (_) { }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            term.dispose();
            termRef.current = null;
            if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
        };
    }, [activeContest, contestId]);

    // ── Setup challenge when selecting a problem ──
    const handleSelectProblem = useCallback(async (index) => {
        if (settingUp || isContestOver) return;
        setSettingUp(true);
        termRef.current?.clear();

        const ok = await setupChallenge(contestId, index);
        if (ok) {
            setActiveChallengeIndex(index);
            setChallengeStartTime(Date.now());
            // Resize terminal after sandbox setup
            setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
                termRef.current?.focus();
            }, 300);
        } else {
            toast.error('Failed to set up challenge');
        }
        setSettingUp(false);
    }, [contestId, setupChallenge, setActiveChallengeIndex, settingUp, isContestOver, toast]);

    // Setup first challenge when challenges load
    useEffect(() => {
        if (challenges.length > 0 && !settingUp) {
            handleSelectProblem(0);
        }
    }, [challenges.length]);

    // ── Judge ──
    const handleJudge = useCallback(async () => {
        if (isContestOver || judging) return;
        setJudging(true);
        try {
            const timeMs = Date.now() - challengeStartTime;
            const res = await api.post(`/contests/${contestId}/judge`, {
                challengeIndex: activeChallengeIndex,
                model,
                timeMs,
            });
            setSubmissions(prev => ({
                ...prev,
                [activeChallengeIndex]: res.data,
            }));
            setTotalScore(res.data.totalScore || 0);

            if (res.data.passed && res.data.score >= 70) {
                toast.success(`Challenge passed! +${res.data.contestScore} pts 🎉`);
            } else {
                toast.info(`Score: ${res.data.score}/100 — keep trying! 💪`);
            }
        } catch (err) {
            toast.error(err.response?.data?.error || 'Judge failed');
        } finally {
            setJudging(false);
        }
    }, [contestId, activeChallengeIndex, model, challengeStartTime, isContestOver, judging, toast]);

    // ── Keyboard shortcuts ──
    useEffect(() => {
        const handleKey = (e) => {
            if (e.ctrlKey && e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleJudge();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [handleJudge]);

    // ── Leaderboard ──
    const fetchLeaderboard = async () => {
        try {
            const res = await api.get(`/contests/${contestId}/leaderboard`);
            // we can use redis for this 
            setLeaderboard(res.data.leaderboard || []);
            setShowLeaderboard(true);
        } catch (err) {
            toast.error('Failed to load leaderboard');
        }
    };

    // Auto-refresh leaderboard when panel is open
    useEffect(() => {
        if (!showLeaderboard || !leaderboardAutoRefresh) return;
        const interval = setInterval(async () => {
            try {
                const res = await api.get(`/contests/${contestId}/leaderboard`);
                setLeaderboard(res.data.leaderboard || []);
            } catch (err) {
                toast.error('Failed to refresh leaderboard');
            }
        }, 10000);
        return () => clearInterval(interval);
    }, [showLeaderboard, leaderboardAutoRefresh, contestId]);

    // Update leaderboard from live WS data
    useEffect(() => {
        if (liveLeaderboard.length > 0 && showLeaderboard) {
            setLeaderboard(liveLeaderboard);
        }
    }, [liveLeaderboard, showLeaderboard]);

    const handleLeave = () => {
        leaveContest();
        navigate('/contests');
    };

    const activeChallenge = challenges[activeChallengeIndex];
    const timerClass = isFinite(remaining) && remaining < 60000 ? 'contest-timer--danger'
        : isFinite(remaining) && remaining < 300000 ? 'contest-timer--warn' : '';

    const solvedCount = Object.values(submissions).filter(s => s.passed && s.score >= 70).length;

    if (!activeContest) {
        return (
            <div className="page" style={{ textAlign: 'center', paddingTop: '4rem' }}>
                <div className="spinner spinner-lg" style={{ margin: '0 auto 1rem' }} />
                <p className="text-muted">Loading contest...</p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
            {/* ── Top bar ── */}
            <div className="contest-topbar">
                <div className="contest-topbar__left">
                    <button className="btn btn-ghost btn-sm" onClick={handleLeave}>← Leave</button>
                    <span className="contest-topbar__title">🏆 {activeContest.title}</span>
                </div>
                <div className="contest-topbar__right">
                    <div className="contest-score-chip">
                        ⭐ {totalScore} pts · {solvedCount}/{challenges.length} solved
                    </div>
                    <div className={`contest-timer ${timerClass}`}>
                        ⏱ {formatTimer(remaining)}
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={fetchLeaderboard}>🏆 Leaderboard</button>
                </div>
            </div>

            {/* ── Main ── */}
            <div className="contest-layout">
                {/* ── Problem sidebar ── */}
                <div className="contest-sidebar">
                    <div className="contest-sidebar__header">
                        Problems ({challenges.length})
                    </div>
                    {challenges.map((ch, i) => {
                        const sub = submissions[i];
                        const solved = sub?.passed && sub?.score >= 70;
                        const failed = sub && !solved;
                        return (
                            <div key={i}
                                className={`problem-item ${i === activeChallengeIndex ? 'problem-item--active' : ''} ${solved ? 'problem-item--solved' : ''} ${failed ? 'problem-item--failed' : ''}`}
                                onClick={() => handleSelectProblem(i)}>
                                <span className="problem-item__number">
                                    {solved ? '✓' : failed ? '✗' : i + 1}
                                </span>
                                <span className="problem-item__title">{ch.title}</span>
                                <span className="problem-item__score">
                                    {sub ? `${sub.contestScore || 0}/${ch.points}` : `${ch.points}pts`}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* ── Challenge + Terminal ── */}
                <div className="contest-main">
                    <div className="contest-challenge-area">
                        {/* Challenge description */}
                        <div className="contest-challenge-panel">
                            {activeChallenge ? (
                                <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                        <span className={`badge badge-${activeChallenge.difficulty.toLowerCase()}`}>
                                            {activeChallenge.difficulty}
                                        </span>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            {activeChallenge.points} pts
                                        </span>
                                    </div>
                                    <h3>{activeChallenge.title}</h3>
                                    <div className="challenge-description">{activeChallenge.description}</div>
                                    {activeChallenge.hints?.length > 0 && (
                                        <details className="contest-hints">
                                            <summary>Show Hints ({activeChallenge.hints.length})</summary>
                                            <ul>
                                                {activeChallenge.hints.map((h, i) => <li key={i}>{h}</li>)}
                                            </ul>
                                        </details>
                                    )}
                                    {submissions[activeChallengeIndex] && (
                                        <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card2)', border: '1px solid var(--border)' }}>
                                            <div style={{ fontWeight: 700, marginBottom: '0.3rem', color: submissions[activeChallengeIndex].passed ? 'var(--green)' : 'var(--red)' }}>
                                                {submissions[activeChallengeIndex].passed ? '✅ Passed' : '❌ Not passed'} — Score: {submissions[activeChallengeIndex].score}/100
                                            </div>
                                            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                                {submissions[activeChallengeIndex].feedback}
                                            </p>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    Select a problem from the sidebar
                                </div>
                            )}
                        </div>

                        {/* Terminal */}
                        <div className="contest-terminal-panel">
                            <div className="contest-terminal-header">
                                <span style={{ fontWeight: 600 }}>Terminal</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    {settingUp && <span className="text-muted">Setting up sandbox...</span>}
                                    <span className="terminal-user-badge">🔒 Your sandbox</span>
                                </div>
                            </div>
                            <div className="contest-terminal-body" style={{ position: 'relative' }}>
                                <div ref={termContainerRef} style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }} />
                                {isContestOver && (
                                    <div className="contest-over-overlay">
                                        <div style={{ fontSize: '3rem' }}>⏰</div>
                                        <h2>Contest Over!</h2>
                                        <p className="text-muted">Final score: {totalScore} pts</p>
                                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                                            <button className="btn btn-primary" onClick={fetchLeaderboard}>🏆 View Leaderboard</button>
                                            <button className="btn btn-ghost" onClick={handleLeave}>← Back to Contests</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Action bar */}
                    <div className="contest-action-bar">
                        <button
                            className={`btn btn-success ${judging ? 'btn-loading' : ''}`}
                            onClick={handleJudge}
                            disabled={judging || isContestOver || settingUp}>
                            {judging ? '⚖️ Judging...' : '⚖️ Judge'}
                        </button>
                        <div className="model-selector">
                            <label className="model-selector__label">🤖 Model:</label>
                            <select className="model-selector__select"
                                value={model} onChange={e => setModel(e.target.value)}
                                disabled={judging}>
                                {availableModels.map(m => (
                                    <option key={m.value} value={m.value}>{m.label}</option>
                                ))}
                            </select>
                        </div>
                        {activeChallengeIndex < challenges.length - 1 && (
                            <button className="btn btn-ghost btn-sm"
                                onClick={() => handleSelectProblem(activeChallengeIndex + 1)}
                                disabled={settingUp}>
                                Next Problem →
                            </button>
                        )}
                        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Ctrl+Enter to judge
                        </span>
                    </div>
                </div>
            </div>

            {/* ── Leaderboard Modal ── */}
            {showLeaderboard && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowLeaderboard(false)}>
                    <div className="modal" style={{ maxWidth: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                            <h2 className="modal__title" style={{ marginBottom: 0 }}>🏆 Leaderboard</h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={leaderboardAutoRefresh}
                                        onChange={e => setLeaderboardAutoRefresh(e.target.checked)}
                                        style={{ accentColor: 'var(--accent)' }} />
                                    Auto-refresh
                                </label>
                                <span className="live-indicator">● Live</span>
                            </div>
                        </div>
                        {leaderboard.length === 0 ? (
                            <p className="text-muted text-center" style={{ padding: '2rem' }}>No entries yet.</p>
                        ) : (
                            <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                            <th style={thStyle}>#</th>
                                            <th style={{ ...thStyle, textAlign: 'left' }}>Player</th>
                                            <th style={thStyle}>Score</th>
                                            <th style={thStyle}>Solved</th>
                                            <th style={thStyle}>Time</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {leaderboard.map(e => {
                                            const isMe = user && e.userId === user.id;
                                            const trophies = ['🥇', '🥈', '🥉'];
                                            const secs = Math.round((e.totalTime || 0) / 1000);
                                            const timeLabel = `${Math.floor(secs / 60)}m ${secs % 60}s`;
                                            return (
                                                <tr key={e.userId} className="leaderboard-row" style={{
                                                    borderBottom: '1px solid var(--border)',
                                                    background: isMe ? 'var(--accent-dim)' : undefined,
                                                }}>
                                                    <td style={tdStyle}>{e.rank <= 3 ? trophies[e.rank - 1] : e.rank}</td>
                                                    <td style={{ ...tdStyle, textAlign: 'left', fontWeight: isMe ? 700 : 500 }}>
                                                        {e.username} {isMe && <span style={{ color: 'var(--accent2)' }}>(you)</span>}
                                                    </td>
                                                    <td style={{ ...tdStyle, fontWeight: 700, color: 'var(--accent2)' }}>{e.totalScore}</td>
                                                    <td style={tdStyle}>{e.solvedCount}</td>
                                                    <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                        {timeLabel}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <div className="modal__actions">
                            <button className="btn btn-ghost" onClick={() => setShowLeaderboard(false)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const thStyle = { padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' };
const tdStyle = { padding: '0.6rem 0.75rem', textAlign: 'center' };
