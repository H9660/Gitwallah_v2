import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useContest } from '../contexts/ContestContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import ProblemBuilder, { createEmptyProblem } from '../components/ProblemBuilder';
import api from '../api';
import './ContestPage.css';

// ── Time helpers ──────────────────────────────────────────
function formatDateTime(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
        ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatCountdown(ms) {
    if (ms <= 0) return '00:00:00';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function getStatus(contest) {
    const now = Date.now();
    if (now < new Date(contest.startTime).getTime()) return 'upcoming';
    if (now <= new Date(contest.endTime).getTime()) return 'live';
    return 'ended';
}

function useCountdowns(contests) {
    const [, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(id);
    }, []);
    return contests;
}

// ══════════════════════════════════════════════════════════
// ── Contest Card ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════
function ContestCard({ contest, onJoin, onLeaderboard, onManage, isCreator }) {
    const status = getStatus(contest);
    const msUntilStart = Math.max(0, new Date(contest.startTime).getTime() - Date.now());
    const problems = contest.problems || contest.challenges || [];
    const participantCount = contest.leaderboard?.length || 0;
    const diffBadgeClass = {
        Beginner: 'badge-beginner', Intermediate: 'badge-intermediate',
        Advanced: 'badge-advanced', Mixed: 'badge-ai',
    }[contest.difficulty] || 'badge-ai';

    return (
        <div className={`card contest-card contest-card--${status}`}>
            <div className="contest-card__header">
                <h3 className="contest-card__title">{contest.title}</h3>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexShrink: 0 }}>
                    {isCreator && (
                        <span className="creator-badge">👑 Your Contest</span>
                    )}
                    <span className={`status-badge status-badge--${status}`}>
                        <span className="status-dot" />
                        {status === 'live' ? 'Live' : status === 'upcoming' ? 'Upcoming' : 'Ended'}
                    </span>
                </div>
            </div>

            {contest.description && <p className="contest-card__desc">{contest.description}</p>}

            <div className="contest-card__meta">
                <span className="contest-card__meta-item">📅 {formatDateTime(contest.startTime)}</span>
                <span className="contest-card__meta-item">→ {formatDateTime(contest.endTime)}</span>
                <span className="contest-card__meta-item">📝 {problems.length} problems</span>
                <span className="contest-card__meta-item participant-count">
                    👥 {participantCount} participant{participantCount !== 1 ? 's' : ''}
                </span>
            </div>

            <div className="contest-card__footer">
                <span className={`badge ${diffBadgeClass}`}>{contest.difficulty}</span>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {status === 'upcoming' && <div className="countdown">⏳ {formatCountdown(msUntilStart)}</div>}
                    {status === 'live' && (
                        <>
                            <button className="btn btn-ghost btn-sm" onClick={() => onLeaderboard(contest._id)}>🏆 Leaderboard</button>
                            <button className="btn btn-green btn-sm" onClick={() => onJoin(contest._id)}>🚀 Join Contest</button>
                        </>
                    )}
                    {status === 'ended' && (
                        <button className="btn btn-ghost btn-sm" onClick={() => onLeaderboard(contest._id)}>🏆 Leaderboard</button>
                    )}
                    {isCreator && (
                        <button className="btn btn-secondary btn-sm" onClick={() => onManage(contest)}>⚙ Manage</button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════
// ── Admin Panel Modal ────────────────────────────────────
// ══════════════════════════════════════════════════════════
function AdminPanel({ contest, onClose, onRefresh }) {
    const toast = useToast();
    const {
        updateContestDetails, deleteContestAction, endContestAction,
        resetLeaderboardAction, removeParticipantAction, fetchParticipants,
    } = useContest();
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState('details');
    const [participants, setParticipants] = useState([]);
    const [loadingParticipants, setLoadingParticipants] = useState(false);

    // Edit form state
    const [editTitle, setEditTitle] = useState(contest.title);
    const [editDesc, setEditDesc] = useState(contest.description || '');
    const [editDifficulty, setEditDifficulty] = useState(contest.difficulty);
    const [saving, setSaving] = useState(false);

    // Confirmation states
    const [confirmEnd, setConfirmEnd] = useState(false);
    const [confirmReset, setConfirmReset] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const status = getStatus(contest);

    const loadParticipants = useCallback(async () => {
        setLoadingParticipants(true);
        const res = await fetchParticipants(contest._id);
        if (res.ok) setParticipants(res.participants);
        setLoadingParticipants(false);
    }, [contest._id, fetchParticipants]);

    useEffect(() => {
        if (activeTab === 'participants') loadParticipants();
    }, [activeTab, loadParticipants]);

    const handleSaveDetails = async () => {
        setSaving(true);
        const res = await updateContestDetails(contest._id, {
            title: editTitle, description: editDesc, difficulty: editDifficulty,
        });
        setSaving(false);
        if (res.ok) { toast.success('Contest updated'); onRefresh(); }
        else toast.error(res.error);
    };

    const handleEndContest = async () => {
        const res = await endContestAction(contest._id);
        if (res.ok) { toast.success('Contest ended'); onRefresh(); onClose(); }
        else toast.error(res.error);
    };

    const handleResetLeaderboard = async () => {
        const res = await resetLeaderboardAction(contest._id);
        if (res.ok) { toast.success('Leaderboard reset'); setConfirmReset(false); loadParticipants(); }
        else toast.error(res.error);
    };

    const handleDeleteContest = async () => {
        const res = await deleteContestAction(contest._id);
        if (res.ok) { toast.success('Contest deleted'); onRefresh(); onClose(); }
        else toast.error(res.error);
    };

    const handleRemoveUser = async (userId, username) => {
        if (!window.confirm(`Remove ${username} from this contest?`)) return;
        const res = await removeParticipantAction(contest._id, userId);
        if (res.ok) { toast.success(`Removed ${username}`); loadParticipants(); }
        else toast.error(res.error);
    };

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal admin-panel-modal" style={{ maxWidth: 640, maxHeight: '85vh' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <h2 className="modal__title" style={{ marginBottom: 0 }}>⚙ Manage: {contest.title}</h2>
                    <span className={`status-badge status-badge--${status}`}>
                        <span className="status-dot" />{status === 'live' ? 'Live' : status === 'upcoming' ? 'Upcoming' : 'Ended'}
                    </span>
                </div>

                {/* Tab nav */}
                <div className="admin-tabs">
                    {['details', 'participants', 'danger'].map(tab => (
                        <button key={tab}
                            className={`admin-tab ${activeTab === tab ? 'admin-tab--active' : ''} ${tab === 'danger' ? 'admin-tab--danger' : ''}`}
                            onClick={() => setActiveTab(tab)}>
                            {tab === 'details' && '📝 Details'}
                            {tab === 'participants' && `👥 Participants (${contest.leaderboard?.length || 0})`}
                            {tab === 'danger' && '⚠ Danger Zone'}
                        </button>
                    ))}
                </div>

                {/* ── Details tab ── */}
                {activeTab === 'details' && (
                    <div className="admin-tab-content">
                        <div className="field">
                            <label className="label">Title</label>
                            <input className="input" value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                        </div>
                        <div className="field">
                            <label className="label">Description</label>
                            <textarea className="input" rows={3} value={editDesc}
                                onChange={e => setEditDesc(e.target.value)} style={{ resize: 'vertical' }} />
                        </div>
                        <div className="field">
                            <label className="label">Difficulty</label>
                            <select className="input" value={editDifficulty} onChange={e => setEditDifficulty(e.target.value)}>
                                <option>Mixed</option><option>Beginner</option>
                                <option>Intermediate</option><option>Advanced</option>
                            </select>
                        </div>
                        <div className="admin-info-row">
                            <span className="text-muted">Start: {formatDateTime(contest.startTime)}</span>
                            <span className="text-muted">End: {formatDateTime(contest.endTime)}</span>
                        </div>
                        <button className="btn btn-primary" onClick={handleSaveDetails} disabled={saving}>
                            {saving ? '⏳ Saving...' : '💾 Save Changes'}
                        </button>
                    </div>
                )}

                {/* ── Participants tab ── */}
                {activeTab === 'participants' && (
                    <div className="admin-tab-content">
                        {loadingParticipants ? (
                            <div style={{ textAlign: 'center', padding: '2rem' }}><div className="spinner spinner-lg" style={{ margin: '0 auto' }} /></div>
                        ) : participants.length === 0 ? (
                            <p className="text-muted" style={{ textAlign: 'center', padding: '2rem' }}>No participants yet.</p>
                        ) : (
                            <div className="admin-participants-list">
                                {participants.map(p => (
                                    <div key={p.userId} className="admin-participant-row">
                                        <div className="admin-participant-info">
                                            <span className="admin-participant-name">{p.username}</span>
                                            <span className="admin-participant-stats">
                                                Score: {p.totalScore} · Solved: {p.solvedCount} · Submissions: {p.submissionCount}
                                            </span>
                                        </div>
                                        <button className="btn btn-danger btn-sm"
                                            onClick={() => handleRemoveUser(p.userId, p.username)}>
                                            ✕ Remove
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Danger zone tab ── */}
                {activeTab === 'danger' && (
                    <div className="admin-tab-content">
                        {status === 'live' && (
                            <div className="danger-action">
                                <div>
                                    <h4>End Contest Now</h4>
                                    <p className="text-muted">Immediately end this contest. All submissions will be locked.</p>
                                </div>
                                {!confirmEnd ? (
                                    <button className="btn btn-danger btn-sm" onClick={() => setConfirmEnd(true)}>🛑 End Contest</button>
                                ) : (
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button className="btn btn-danger btn-sm" onClick={handleEndContest}>Confirm End</button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => setConfirmEnd(false)}>Cancel</button>
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="danger-action">
                            <div>
                                <h4>Reset Leaderboard</h4>
                                <p className="text-muted">Clear all participant scores and submissions.</p>
                            </div>
                            {!confirmReset ? (
                                <button className="btn btn-danger btn-sm" onClick={() => setConfirmReset(true)}>🔄 Reset</button>
                            ) : (
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button className="btn btn-danger btn-sm" onClick={handleResetLeaderboard}>Confirm Reset</button>
                                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmReset(false)}>Cancel</button>
                                </div>
                            )}
                        </div>
                        <div className="danger-action danger-action--critical">
                            <div>
                                <h4>Delete Contest</h4>
                                <p className="text-muted">Permanently delete this contest and all data. This cannot be undone.</p>
                            </div>
                            {!confirmDelete ? (
                                <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>🗑 Delete</button>
                            ) : (
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button className="btn btn-danger btn-sm" onClick={handleDeleteContest}>Confirm Delete</button>
                                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="modal__actions">
                    <button className="btn btn-ghost" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════
// ── Create Contest Modal (Full Problem Builder) ──────────
// ══════════════════════════════════════════════════════════
function CreateContestModal({ onClose, onCreated }) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [difficulty, setDifficulty] = useState('Mixed');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [mode, setMode] = useState('custom'); // 'custom' | 'static'
    const [problems, setProblems] = useState([createEmptyProblem()]);
    const [selectedIds, setSelectedIds] = useState([]);
    const [available, setAvailable] = useState([]);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');
    const [previewOpen, setPreviewOpen] = useState(false);

    useEffect(() => {
        api.get('/contests/challenges').then(r => setAvailable(r.data.challenges || [])).catch(() => {});
    }, []);

    const toggleChallenge = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        setError('');
        if (!title.trim()) return setError('Title is required');
        if (!startTime || !endTime) return setError('Start and end times are required');
        if (new Date(endTime) <= new Date(startTime)) return setError('End time must be after start time');

        if (mode === 'custom') {
            const invalid = problems.find(p => !p.title.trim() || !p.description.trim());
            if (invalid) return setError('Each problem needs a title and description');
            if (problems.length === 0) return setError('Add at least one problem');
        } else {
            if (selectedIds.length === 0) return setError('Select at least one challenge');
        }

        setCreating(true);
        try {
            const body = {
                title: title.trim(),
                description: description.trim(),
                difficulty,
                startTime: new Date(startTime).toISOString(),
                endTime: new Date(endTime).toISOString(),
            };

            if (mode === 'custom') {
                body.problems = problems;
            } else {
                body.challengeIds = selectedIds;
            }

            await api.post('/contests', body);
            onCreated();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to create contest');
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal create-contest-modal" style={{ maxWidth: 860, maxHeight: '92vh' }}>
                <h2 className="modal__title">🏆 Create Contest</h2>

                <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Contest meta */}
                    <div className="builder-row">
                        <div className="field">
                            <label className="label">Contest Title *</label>
                            <input className="input" placeholder="e.g. Git Mastery Sprint" value={title}
                                onChange={e => setTitle(e.target.value)} required />
                        </div>
                        <div className="field">
                            <label className="label">Difficulty</label>
                            <select className="input" value={difficulty} onChange={e => setDifficulty(e.target.value)}>
                                <option>Mixed</option><option>Beginner</option>
                                <option>Intermediate</option><option>Advanced</option>
                            </select>
                        </div>
                    </div>

                    <div className="field">
                        <label className="label">Description (optional)</label>
                        <textarea className="input" placeholder="Describe the contest..."
                            value={description} onChange={e => setDescription(e.target.value)}
                            rows={2} style={{ resize: 'vertical' }} />
                    </div>

                    <div className="builder-row">
                        <div className="field">
                            <label className="label">Start Time *</label>
                            <input className="input" type="datetime-local" value={startTime}
                                onChange={e => setStartTime(e.target.value)} required />
                        </div>
                        <div className="field">
                            <label className="label">End Time *</label>
                            <input className="input" type="datetime-local" value={endTime}
                                onChange={e => setEndTime(e.target.value)} required />
                        </div>
                    </div>

                    {/* Mode switch */}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button type="button" className={`filter-btn ${mode === 'custom' ? 'filter-btn--active' : ''}`}
                            onClick={() => setMode('custom')}>
                            ✏️ Custom Problems
                        </button>
                        <button type="button" className={`filter-btn ${mode === 'static' ? 'filter-btn--active' : ''}`}
                            onClick={() => setMode('static')}>
                            📦 Pick from Existing
                        </button>
                    </div>

                    {/* ── Custom Problem Builder ── */}
                    {mode === 'custom' && (
                        <div>
                            <label className="label" style={{ marginBottom: '0.5rem', display: 'block' }}>
                                Problems ({problems.length})
                            </label>
                            <ProblemBuilder problems={problems} onChange={setProblems} />
                        </div>
                    )}

                    {/* ── Static challenge picker (legacy) ── */}
                    {mode === 'static' && (
                        <div className="field">
                            <label className="label">Select Challenges ({selectedIds.length} selected)</label>
                            <div className="challenge-picker">
                                {available.map(c => (
                                    <label key={c.id}
                                        className={`challenge-pick-item ${selectedIds.includes(c.id) ? 'challenge-pick-item--selected' : ''}`}>
                                        <input type="checkbox" checked={selectedIds.includes(c.id)}
                                            onChange={() => toggleChallenge(c.id)} />
                                        <span className="challenge-pick-item__title">{c.title}</span>
                                        <span className={`badge badge-${c.difficulty.toLowerCase()}`}>{c.difficulty}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Preview */}
                    {mode === 'custom' && problems.length > 0 && (
                        <div>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPreviewOpen(!previewOpen)}>
                                {previewOpen ? '🔽 Hide Preview' : '👁️ Preview Contest'}
                            </button>
                            {previewOpen && (
                                <div style={{ marginTop: '0.75rem', padding: '1rem', background: 'var(--bg-card2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', maxHeight: '250px', overflowY: 'auto' }}>
                                    <h4 style={{ marginBottom: '0.5rem', color: 'var(--accent2)' }}>{title || 'Untitled Contest'}</h4>
                                    {description && <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>{description}</p>}
                                    {problems.map((p, i) => (
                                        <div key={i} style={{ padding: '0.5rem 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>#{i + 1} {p.title || 'Untitled'}</span>
                                                <span className={`badge badge-${p.difficulty.toLowerCase()}`}>{p.difficulty}</span>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.points} pts</span>
                                            </div>
                                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                {p.description?.slice(0, 100) || 'No description'}{p.description?.length > 100 ? '…' : ''}
                                            </p>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>
                                                {(p.terminalConfig?.files || []).length} files · {(p.testCases || []).length} test cases · {(p.hints || []).length} hints
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {error && <div style={{ color: 'var(--red)', fontSize: '0.85rem' }}>{error}</div>}

                    <div className="modal__actions">
                        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={creating}>
                            {creating ? '⏳ Creating...' : '🏆 Create Contest'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════
// ── Leaderboard Modal ────────────────────────────────────
// ══════════════════════════════════════════════════════════
function LeaderboardModal({ contestId, onClose }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();

    useEffect(() => {
        api.get(`/contests/${contestId}/leaderboard`)
            .then(r => setData(r.data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, [contestId]);

    // Auto-refresh leaderboard every 10s
    useEffect(() => {
        const interval = setInterval(() => {
            api.get(`/contests/${contestId}/leaderboard`)
                .then(r => setData(r.data))
                .catch(() => {});
        }, 10000);
        return () => clearInterval(interval);
    }, [contestId]);

    const trophies = ['🥇', '🥈', '🥉'];

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ maxWidth: 600 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <h2 className="modal__title" style={{ marginBottom: 0 }}>🏆 {data?.title || 'Contest'} — Leaderboard</h2>
                    <span className="live-indicator">● Live</span>
                </div>

                {loading && (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                        <div className="spinner spinner-lg" />
                    </div>
                )}

                {!loading && data?.leaderboard?.length === 0 && (
                    <p className="text-muted text-center" style={{ padding: '2rem' }}>No participants yet.</p>
                )}

                {!loading && data?.leaderboard?.length > 0 && (
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
                                {data.leaderboard.map(entry => {
                                    const isMe = user && entry.userId === user.id;
                                    const secs = Math.round(entry.totalTime / 1000);
                                    const timeLabel = `${Math.floor(secs / 60)}m ${secs % 60}s`;
                                    return (
                                        <tr key={entry.userId} style={{
                                            borderBottom: '1px solid var(--border)',
                                            background: isMe ? 'var(--accent-dim)' : undefined,
                                        }}>
                                            <td style={tdStyle}>{entry.rank <= 3 ? trophies[entry.rank - 1] : entry.rank}</td>
                                            <td style={{ ...tdStyle, textAlign: 'left', fontWeight: isMe ? 700 : 500 }}>
                                                {entry.username} {isMe && <span style={{ color: 'var(--accent2)' }}>(you)</span>}
                                            </td>
                                            <td style={{ ...tdStyle, fontWeight: 700, color: 'var(--accent2)' }}>{entry.totalScore}</td>
                                            <td style={tdStyle}>{entry.solvedCount}</td>
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
                    <button className="btn btn-ghost" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
}

const thStyle = { padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' };
const tdStyle = { padding: '0.6rem 0.75rem', textAlign: 'center' };

// ══════════════════════════════════════════════════════════
// ── Main ContestPage ─────────────────────────────────────
// ══════════════════════════════════════════════════════════
export default function ContestPage() {
    const { contests, fetchContests, loading, joinContest, isContestCreator } = useContest();
    const { user } = useAuth();
    const toast = useToast();
    const navigate = useNavigate();

    const [showCreate, setShowCreate] = useState(false);
    const [filter, setFilter] = useState('all');
    const [leaderboardId, setLeaderboardId] = useState(null);
    const [managingContest, setManagingContest] = useState(null);

    useEffect(() => { fetchContests(); }, [fetchContests]);
    useCountdowns(contests);

    const filtered = useMemo(() => {
        if (filter === 'all') return contests;
        return contests.filter(c => getStatus(c) === filter);
    }, [contests, filter]);

    const handleJoin = async (contestId) => {
        if (!user) {
            toast.warning('Sign in to join contests');
            navigate('/auth');
            return;
        }
        const ok = await joinContest(contestId);
        if (ok) {
            toast.success('Joined contest! 🏆');
            navigate(`/contests/${contestId}`);
        } else {
            toast.error('Failed to join contest');
        }
    };

    const handleCreated = () => {
        setShowCreate(false);
        fetchContests();
        toast.success('Contest created! 🎉');
    };

    const statusCounts = useMemo(() => {
        const counts = { all: contests.length, live: 0, upcoming: 0, ended: 0 };
        contests.forEach(c => { counts[getStatus(c)]++; });
        return counts;
    }, [contests]);

    return (
        <div className="page">
            <div className="contest-page-header">
                <div>
                    <h1 className="page-title">🏆 Contests</h1>
                    <p className="page-subtitle">Compete in timed Git challenges</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                    ➕ Create Contest
                </button>
            </div>

            <div className="contest-filters" style={{ marginBottom: '1.5rem' }}>
                {['all', 'live', 'upcoming', 'ended'].map(f => (
                    <button key={f}
                        className={`filter-btn ${filter === f ? 'filter-btn--active' : ''}`}
                        onClick={() => setFilter(f)}>
                        {f === 'live' && '🟢 '}{f === 'upcoming' && '🟡 '}{f === 'ended' && '⚫ '}
                        {f.charAt(0).toUpperCase() + f.slice(1)} ({statusCounts[f]})
                    </button>
                ))}
            </div>

            {loading && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
                    <div className="spinner spinner-lg" />
                </div>
            )}

            {!loading && filtered.length === 0 && (
                <div className="contest-empty">
                    <div className="contest-empty__icon">🏆</div>
                    <h3 style={{ marginBottom: '0.5rem' }}>No contests found</h3>
                    <p>Create one to get started!</p>
                </div>
            )}

            {!loading && filtered.length > 0 && (
                <div className="contest-grid">
                    {filtered.map(c => (
                        <ContestCard key={c._id} contest={c}
                            isCreator={isContestCreator(c)}
                            onJoin={handleJoin}
                            onLeaderboard={setLeaderboardId}
                            onManage={setManagingContest} />
                    ))}
                </div>
            )}

            {showCreate && <CreateContestModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />}
            {leaderboardId && <LeaderboardModal contestId={leaderboardId} onClose={() => setLeaderboardId(null)} />}
            {managingContest && (
                <AdminPanel
                    contest={managingContest}
                    onClose={() => setManagingContest(null)}
                    onRefresh={() => { fetchContests(); setManagingContest(null); }}
                />
            )}
        </div>
    );
}
