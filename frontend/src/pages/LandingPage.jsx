import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './LandingPage.css';

const features = [
  {
    icon: '⚡',
    iconClass: 'feature-card__icon--purple',
    title: 'AI-Generated Challenges',
    desc: 'Every challenge is dynamically crafted by AI — from beginner branching exercises to advanced rebase conflict resolution.',
  },
  {
    icon: '⚔️',
    iconClass: 'feature-card__icon--red',
    title: 'Real-Time Duel Mode',
    desc: 'Challenge friends or strangers to live Git duels. First to solve the challenge correctly wins the round.',
  },
  {
    icon: '🏆',
    iconClass: 'feature-card__icon--yellow',
    title: 'Timed Contests',
    desc: 'Compete in structured, time-limited Git contests. Climb leaderboards and prove your mastery under pressure.',
  },
  {
    icon: '📖',
    iconClass: 'feature-card__icon--blue',
    title: 'Interactive Cheat Sheet',
    desc: 'A living reference of every Git command — searchable, categorized, and always one click away.',
  },
  {
    icon: '🧠',
    iconClass: 'feature-card__icon--teal',
    title: 'Smart Problem Builder',
    desc: 'Choose your topic, difficulty, and style. The AI builds a custom repository challenge just for you.',
  },
  {
    icon: '📊',
    iconClass: 'feature-card__icon--green',
    title: 'Skill Progression',
    desc: 'Track every submission, see your accuracy rate, and watch your Git mastery grow over time.',
  },
];

const steps = [
  { num: '01', title: 'Choose a Topic', desc: 'Pick branching, merging, rebasing, history, or let AI surprise you.' },
  { num: '02', title: 'Get a Challenge', desc: 'A real Git repo scenario is generated with context and objectives.' },
  { num: '03', title: 'Run Commands', desc: 'Type your Git commands in the built-in terminal and execute them live.' },
  { num: '04', title: 'Get Instant Feedback', desc: 'AI validates your repo state and scores your solution in real time.' },
];

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="landing">
      {/* Ambient orbs */}
      <div className="landing__orb landing__orb--1" />
      <div className="landing__orb landing__orb--2" />
      <div className="landing__orb landing__orb--3" />

      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero__eyebrow">
          <span className="hero__eyebrow-dot" />
          The Git Training Ground for Developers
        </div>

        <h1 className="hero__headline">
          Master Git through{' '}
          <span className="hero__headline-gradient">
            real challenges,
          </span>
          <br />
          not just theory.
        </h1>

        <p className="hero__sub">
          GitDojo is an AI-powered interactive platform where you practice Git commands
          in live repo scenarios, compete in real-time duels, and level up your version
          control skills through hands-on battle.
        </p>

        <div className="hero__cta">
          {user ? (
            <>
              <Link to="/practice" className="btn-hero-primary">
                ⚡ Start Practicing
              </Link>
              <Link to="/contests" className="btn-hero-secondary">
                🏆 View Contests
              </Link>
            </>
          ) : (
            <>
              <Link to="/auth" className="btn-hero-primary">
                🚀 Get Started Free
              </Link>
              <Link to="/practice" className="btn-hero-secondary">
                👀 Try a Challenge
              </Link>
            </>
          )}
        </div>

        {/* Terminal Demo */}
        <div className="hero__demo">
          <div className="demo__titlebar">
            <span className="demo__dot demo__dot--red" />
            <span className="demo__dot demo__dot--yellow" />
            <span className="demo__dot demo__dot--green" />
            <span className="demo__title">gitdojo — bash — 80×24</span>
          </div>
          <div className="demo__body">
            <div className="demo__line">
              <span className="demo__prompt">$</span>
              <span className="demo__cmd">git log --oneline --graph</span>
            </div>
            <div className="demo__line">
              <span className="demo__out-muted">* a3f9c2e (HEAD → feature/auth) Add JWT middleware</span>
            </div>
            <div className="demo__line">
              <span className="demo__out-muted">* 7b21d8f Scaffold auth routes</span>
            </div>
            <div className="demo__line">
              <span className="demo__out-muted">| * c4e91a0 (main) Fix login redirect bug</span>
            </div>
            <div className="demo__line">
              <span className="demo__out-muted">|/</span>
            </div>
            <div className="demo__line">
              <span className="demo__out-muted">* 18ad3b1 Initial commit</span>
            </div>
            <div className="demo__line" style={{ marginTop: '0.5rem' }}>
              <span className="demo__prompt">$</span>
              <span className="demo__cmd">git rebase main</span>
            </div>
            <div className="demo__line">
              <span className="demo__out-good">✓ Successfully rebased and updated refs/heads/feature/auth</span>
            </div>
            <div className="demo__line" style={{ marginTop: '0.5rem' }}>
              <span className="demo__prompt">$</span>
              <span className="demo__cursor" />
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <div className="stats-strip">
        <div className="stat-item">
          <span className="stat-item__number">50+</span>
          <span className="stat-item__label">Challenge Topics</span>
        </div>
        <div className="stat-item">
          <span className="stat-item__number">3</span>
          <span className="stat-item__label">Difficulty Levels</span>
        </div>
        <div className="stat-item">
          <span className="stat-item__number">∞</span>
          <span className="stat-item__label">AI-Generated Scenarios</span>
        </div>
        <div className="stat-item">
          <span className="stat-item__number">Live</span>
          <span className="stat-item__label">Duel Mode</span>
        </div>
      </div>

      {/* ── FEATURES ── */}
      <section className="features">
        <div className="section-label">Features</div>
        <h2 className="section-title">
          Everything you need to <span>dominate Git</span>
        </h2>
        <p className="section-sub">
          From AI-generated challenges to live competitive duels — GitDojo has every tool
          to transform you from a beginner to a Git black belt.
        </p>

        <div className="features__grid">
          {features.map((f, i) => (
            <div
              key={f.title}
              className={`feature-card fade-up fade-up-${Math.min(i + 1, 6)}`}
            >
              <div className={`feature-card__icon ${f.iconClass}`}>{f.icon}</div>
              <h3 className="feature-card__title">{f.title}</h3>
              <p className="feature-card__desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="how-it-works">
        <div className="how-it-works__inner">
          <div className="section-label">How It Works</div>
          <h2 className="section-title">
            From zero to <span>Git hero</span> in minutes
          </h2>
          <div className="steps">
            {steps.map((s, i) => (
              <div key={s.num} className={`step fade-up fade-up-${i + 1}`}>
                <div className="step__num">{s.num}</div>
                <div className="step__title">{s.title}</div>
                <div className="step__desc">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DUEL MODE CALLOUT ── */}
      <section className="duel-callout">
        <div className="duel-callout__card">
          <div>
            <div className="section-label">Duel Mode</div>
            <h2 className="duel-callout__title">
              Challenge your friends to a <span>real-time Git duel</span>
            </h2>
            <p className="duel-callout__desc">
              Share a link, connect across your network, and race to solve the same Git
              challenge. First to produce a correct repo state wins bragging rights.
            </p>

            <div className="duel-callout__features">
              {[
                'Real-time WebSocket synchronization',
                'Share via room link — no accounts needed',
                'Identical challenges for fair competition',
                'Live opponent progress tracking',
              ].map(feat => (
                <div key={feat} className="duel-feat">
                  <div className="duel-feat__icon">✓</div>
                  <span>{feat}</span>
                </div>
              ))}
            </div>

            <Link to="/practice" className="btn-hero-primary" style={{ display: 'inline-flex' }}>
              ⚔️ Try Duel Mode
            </Link>
          </div>

          <div>
            <div className="duel-vs-display">
              <div className="duel-player">
                <div className="duel-player__avatar duel-player__avatar--left">🥷</div>
                <div className="duel-player__name">You</div>
              </div>
              <div className="duel-vs-badge">
                <div className="duel-vs-badge__text">VS</div>
                <div className="duel-vs-badge__sub">live duel</div>
              </div>
              <div className="duel-player">
                <div className="duel-player__avatar duel-player__avatar--right">🏴‍☠️</div>
                <div className="duel-player__name">Opponent</div>
              </div>
            </div>
            <div className="duel-terminal-preview">
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                Challenge: Resolve the merge conflict on branch "feature/login"
              </div>
              <div style={{ color: 'var(--accent2)' }}>$ <span style={{ color: 'var(--text)' }}>git merge main</span></div>
              <div style={{ color: 'var(--red)' }}>CONFLICT (content): Merge conflict in src/auth.js</div>
              <div style={{ color: 'var(--accent2)' }}>$ <span style={{ color: 'var(--text)' }}>git add src/auth.js && git commit -m "resolve"</span></div>
              <div style={{ color: 'var(--green)' }}>✓ Opponent solved in 43s — your turn!</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="cta-section">
        <div className="cta-section__inner">
          <h2 className="cta-section__title">
            Ready to level up your <span>Git game?</span>
          </h2>
          <p className="cta-section__sub">
            Join GitDojo today and start solving real scenarios, competing in live duels,
            and becoming the developer everyone on the team relies on.
          </p>
          <div className="cta-section__btns">
            {user ? (
              <>
                <Link to="/practice" className="btn-hero-primary">⚡ Start Practicing</Link>
                <Link to="/contests" className="btn-hero-secondary">🏆 Enter a Contest</Link>
              </>
            ) : (
              <>
                <Link to="/auth" className="btn-hero-primary">🚀 Create Free Account</Link>
                <Link to="/practice" className="btn-hero-secondary">👀 Try Without Signing In</Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="landing-footer">
        <div className="landing-footer__brand">
          Git<span>Dojo</span>
        </div>
        <div className="landing-footer__copy">
          © {new Date().getFullYear()} GitDojo. All rights reserved.
        </div>
        <div className="landing-footer__links">
          <Link to="/practice">Practice</Link>
          <Link to="/contests">Contests</Link>
          <Link to="/cheatsheet">Cheat Sheet</Link>
          <Link to="/profile">Profile</Link>
        </div>
      </footer>
    </div>
  );
}
