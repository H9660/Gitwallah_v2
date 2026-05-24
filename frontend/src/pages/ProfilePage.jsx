import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';
import './ProfilePage.css';

const DIFFICULTY_COLORS = { Beginner: 'badge-beginner', Intermediate: 'badge-intermediate', Advanced: 'badge-advanced' };

function StatCard({ icon, value, label, sub }) {
    return (
        <div className="stat-card card">
            <div className="stat-card__icon">{icon}</div>
            <div className="stat-card__value">{value ?? '—'}</div>
            <div className="stat-card__label">{label}</div>
            {sub && <div className="stat-card__sub">{sub}</div>}
        </div>
    );
}

export default function ProfilePage() {
    const { user, logout } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!user) return;
        setLoading(true);
        api.get('/auth/profile')
            .then(r => setData(r.data))
            .catch(e => setError(e.response?.data?.error || 'Failed to load profile'))
            .finally(() => setLoading(false));
    }, [user]);

    if (!user) {
        return (
            <div className="page" style={{ textAlign: 'center', paddingTop: '4rem' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👤</div>
                <h2 style={{ marginBottom: '0.5rem' }}>Sign in to view your profile</h2>
                <p className="text-muted" style={{ marginBottom: '1.5rem' }}>Track your progress, stats, and solve history</p>
                <Link to="/auth" className="btn btn-primary">Sign in / Register</Link>
            </div>
        );
    }

    const stats = data?.user?.stats || {};
    const history = data?.history || [];
    const fastestSecs = stats.fastestSolveMs >= 0 ? Math.round(stats.fastestSolveMs / 1000) : null;
    console.log(stats.fastestSolveMs)
    console.log(fastestSecs)
    const fastestLabel = fastestSecs
        ? `${Math.floor(fastestSecs / 60)}m ${fastestSecs % 60}s`
        : '—';

    return (
        <div className="page">
            {/* Header */}
            <div className="profile-header">
                <div className="profile-avatar">
                    {user.username?.[0]?.toUpperCase()}
                </div>
                <div>
                    <h1 className="profile-username">{user.username}</h1>
                    <p className="text-muted" style={{ fontSize: '0.85rem' }}>{user.email}</p>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={logout} style={{ marginLeft: 'auto' }}>
                    Sign out
                </button>
            </div>

            {loading && <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner spinner-lg" /></div>}
            {error && <div className="profile-error">{error}</div>}

            {data && (
                <>
                    {/* Stats grid */}
                    <div className="grid-4" style={{ marginBottom: '2rem' }}>
                        <StatCard icon="🏆" value={stats.solved ?? 0} label="Challenges Solved" />
                        <StatCard icon="📊" value={`${stats?.avgScore?.toFixed(2) ?? 0}%`} label="Average Score" />
                        <StatCard icon="⚡" value={fastestLabel} label="Fastest Solve" />
                        <StatCard icon="🔥" value={stats.streak ?? 0} label="Current Streak" sub="days" />
                    </div>

                    {/* History table */}
                    <div className="card">
                        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>📜 Recent Solves</h2>
                        {history.length === 0 ? (
                            <p className="text-muted" style={{ textAlign: 'center', padding: '2rem' }}>
                                No challenges solved yet. <Link to="/" style={{ color: 'var(--accent2)' }}>Play now!</Link>
                            </p>
                        ) : (
                            <div className="history-table-wrap">
                                <table className="history-table">
                                    <thead>
                                        <tr>
                                            <th>Challenge</th>
                                            <th>Difficulty</th>
                                            <th>Score</th>
                                            <th>Result</th>
                                            <th>Time</th>
                                            <th>Mode</th>
                                            <th>Date</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {history.map(r => {
                                            const secs = Math.round(r.timeMs / 1000);
                                            const timeLabel = `${Math.floor(secs / 60)}m ${secs % 60}s`;
                                            const date = new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                            return (
                                                <tr key={r._id}>
                                                    <td className="history-title">{r.title}</td>
                                                    <td><span className={`badge ${DIFFICULTY_COLORS[r.difficulty] || ''}`}>{r.difficulty}</span></td>
                                                    <td className={r.score >= 70 ? 'text-green' : 'text-red'} style={{ fontWeight: 700 }}>{r.score}</td>
                                                    <td>{r.passed ? <span className="badge badge-beginner">✅ Pass</span> : <span className="badge" style={{ background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.3)' }}>❌ Fail</span>}</td>
                                                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{timeLabel}</td>
                                                    <td><span className="badge badge-ai">{r.mode}</span></td>
                                                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{date}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
