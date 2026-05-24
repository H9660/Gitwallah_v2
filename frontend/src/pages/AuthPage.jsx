import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './AuthPage.css';

export default function AuthPage() {
    const { login, register, user } = useAuth();
    const navigate = useNavigate();
    const [tab, setTab] = useState('login');
    const [form, setForm] = useState({ username: '', email: '', password: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    if (user) {
        return (
            <div className="page" style={{ textAlign: 'center', paddingTop: '4rem' }}>
                <p>You are already signed in as <strong>{user.username}</strong>.</p>
                <Link to="/" className="btn btn-primary mt-md">Go to Challenges</Link>
            </div>
        );
    }

    const handle = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            if (tab === 'login') {
                await login(form.email, form.password);
            } else {
                await register(form.username, form.email, form.password);
            }
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.error || 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            {/* Floating Git snippets background */}
            <div className="auth-bg-snippets" aria-hidden="true">
                <div className="auth-snippet auth-snippet--1">git commit -m "init"</div>
                <div className="auth-snippet auth-snippet--2">git push origin main</div>
                <div className="auth-snippet auth-snippet--3">git checkout -b feature</div>
                <div className="auth-snippet auth-snippet--4">git merge --no-ff</div>
                <div className="auth-snippet auth-snippet--5">git rebase -i HEAD~3</div>
                <div className="auth-snippet auth-snippet--6">git stash pop</div>
                <div className="auth-snippet auth-snippet--7">git log --oneline</div>
                <div className="auth-snippet auth-snippet--8">git cherry-pick abc123</div>
                <div className="auth-snippet auth-snippet--9">git diff --staged</div>
                <div className="auth-snippet auth-snippet--10">git reset --soft HEAD~1</div>
                {/* Git branch tree SVG */}
                <svg className="auth-branch-tree" viewBox="0 0 200 500" fill="none" aria-hidden="true">
                    <path d="M100 0 L100 150" stroke="rgba(108,99,255,0.15)" strokeWidth="2" />
                    <path d="M100 150 L100 350" stroke="rgba(108,99,255,0.12)" strokeWidth="2" />
                    <path d="M100 350 L100 500" stroke="rgba(108,99,255,0.08)" strokeWidth="2" />
                    <path d="M100 80 Q130 80 150 120 L150 200" stroke="rgba(167,139,250,0.12)" strokeWidth="2" />
                    <path d="M100 200 Q60 200 40 250 L40 320 Q40 350 70 360 L100 350" stroke="rgba(34,197,94,0.1)" strokeWidth="2" />
                    <path d="M150 150 Q170 160 180 200 L180 260 Q180 290 150 300 L100 310" stroke="rgba(234,179,8,0.08)" strokeWidth="2" />
                    <circle cx="100" cy="0" r="4" fill="rgba(108,99,255,0.25)" />
                    <circle cx="100" cy="80" r="4" fill="rgba(108,99,255,0.2)" />
                    <circle cx="150" cy="120" r="3" fill="rgba(167,139,250,0.2)" />
                    <circle cx="100" cy="150" r="4" fill="rgba(108,99,255,0.2)" />
                    <circle cx="100" cy="200" r="4" fill="rgba(108,99,255,0.18)" />
                    <circle cx="40" cy="250" r="3" fill="rgba(34,197,94,0.18)" />
                    <circle cx="150" cy="200" r="3" fill="rgba(167,139,250,0.15)" />
                    <circle cx="180" cy="260" r="3" fill="rgba(234,179,8,0.15)" />
                    <circle cx="100" cy="310" r="4" fill="rgba(108,99,255,0.15)" />
                    <circle cx="100" cy="350" r="4" fill="rgba(108,99,255,0.12)" />
                    <circle cx="40" cy="320" r="3" fill="rgba(34,197,94,0.12)" />
                </svg>
            </div>

            <div className="auth-card card card--glow">
                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🥋</div>
                    <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>
                        {tab === 'login' ? 'Welcome back' : 'Join GitWallah'}
                    </h1>
                    <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                        {tab === 'login' ? 'Sign in to track your progress' : 'Create an account to save your stats'}
                    </p>
                </div>

                {/* Tab toggle */}
                <div className="auth-tabs">
                    <button className={`auth-tab${tab === 'login' ? ' auth-tab--active' : ''}`} onClick={() => setTab('login')}>
                        Sign In
                    </button>
                    <button className={`auth-tab${tab === 'register' ? ' auth-tab--active' : ''}`} onClick={() => setTab('register')}>
                        Register
                    </button>
                </div>

                <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {tab === 'register' && (
                        <div className="field">
                            <label className="label">Username</label>
                            <input
                                className="input" placeholder="e.g. gitmaster42" required
                                value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                                minLength={2} maxLength={30}
                            />
                        </div>
                    )}
                    <div className="field">
                        <label className="label">Email</label>
                        <input
                            className="input" type="email" placeholder="you@example.com" required
                            value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                        />
                    </div>
                    <div className="field">
                        <label className="label">Password</label>
                        <input
                            className="input" type="password" placeholder="••••••••" required
                            value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                            minLength={6}
                        />
                    </div>

                    {error && <div className="auth-error">{error}</div>}

                    <button className="btn btn-primary w-full" type="submit" disabled={loading}>
                        {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> {tab === 'login' ? 'Signing in…' : 'Creating account…'}</> : (tab === 'login' ? 'Sign In' : 'Create Account')}
                    </button>
                </form>

                <p className="text-muted text-center" style={{ fontSize: '0.8rem', marginTop: '1rem' }}>
                    {tab === 'login' ? "Don't have an account? " : 'Already have an account? '}
                    <button
                        className="auth-link"
                        onClick={() => setTab(tab === 'login' ? 'register' : 'login')}
                    >
                        {tab === 'login' ? 'Register' : 'Sign in'}
                    </button>
                </p>

                <p className="text-muted text-center" style={{ fontSize: '0.75rem', marginTop: '1rem' }}>
                    You can also <Link to="/" style={{ color: 'var(--accent2)' }}>practice without an account</Link> — stats save locally.
                </p>
            </div>
        </div>
    );
}
