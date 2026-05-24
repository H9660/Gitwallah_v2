import { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import './ResultsModal.css';

const CIRCUMFERENCE = 2 * Math.PI * 52; // r=52

// AI sometimes returns fields as objects instead of strings — safely convert
function toStr(val) {
    if (val == null) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'object') {
        return Object.entries(val).map(([k, v]) => `${k}: ${v}`).join('\n');
    }
    return String(val);
}

// Easing function for smooth count-up
function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

function useAnimatedScore(targetScore, duration = 1200) {
    const [displayScore, setDisplayScore] = useState(0);
    const rafRef = useRef(null);

    useEffect(() => {
        const startTime = performance.now();

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = easeOutCubic(progress);
            const current = Math.round(easedProgress * targetScore);

            setDisplayScore(current);

            if (progress < 1) {
                rafRef.current = requestAnimationFrame(animate);
            }
        };

        rafRef.current = requestAnimationFrame(animate);

        return () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, [targetScore, duration]);

    return displayScore;
}

function fireConfetti() {
    // Multi-burst confetti for a premium feel
    const colors = ['#6c63ff', '#a78bfa', '#22c55e', '#eab308', '#8b5cf6', '#ffffff'];

    // Center burst
    confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors,
        zIndex: 1000,
    });

    // Left cannon
    setTimeout(() => {
        confetti({
            particleCount: 50,
            angle: 60,
            spread: 55,
            origin: { x: 0, y: 0.65 },
            colors,
            zIndex: 1000,
        });
    }, 150);

    // Right cannon
    setTimeout(() => {
        confetti({
            particleCount: 50,
            angle: 120,
            spread: 55,
            origin: { x: 1, y: 0.65 },
            colors,
            zIndex: 1000,
        });
    }, 300);

    // Stars burst
    setTimeout(() => {
        confetti({
            particleCount: 30,
            spread: 360,
            ticks: 80,
            gravity: 0.3,
            decay: 0.94,
            startVelocity: 20,
            shapes: ['star'],
            colors: ['#ffd700', '#ffec3d', '#fff7c2'],
            origin: { y: 0.5 },
            zIndex: 1000,
        });
    }, 500);
}

export default function ResultsModal({ result, challenge, onNext, onClose, onReReview, judging }) {
    const [showReviewNote, setShowReviewNote] = useState(false);
    const confettiFired = useRef(false);

    const score = result?.score ?? 0;
    const passed = result?.passed;
    const strokeColor = score >= 70 ? '#22c55e' : score >= 40 ? '#eab308' : '#ef4444';

    // Animated score
    const animatedScore = useAnimatedScore(score, 1400);
    const animatedOffset = CIRCUMFERENCE - (animatedScore / 100) * CIRCUMFERENCE;

    // Fire confetti on pass
    useEffect(() => {
        if (passed && !confettiFired.current) {
            confettiFired.current = true;
            // Slight delay so the modal has time to appear
            setTimeout(() => fireConfetti(), 400);
        }
        return () => { confettiFired.current = false; };
    }, [passed]);

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && (onClose ? onClose() : onNext())}>
            <div className={`modal results-modal ${passed ? 'results-modal--pass-glow' : 'results-modal--fail-glow'}`}>
                {/* Score ring */}
                <div className="score-ring-wrap">
                    <svg viewBox="0 0 120 120" className="score-ring">
                        <circle cx="60" cy="60" r="52" className="score-ring__bg" />
                        <circle
                            cx="60" cy="60" r="52"
                            className="score-ring__fill"
                            stroke={strokeColor}
                            strokeDasharray={CIRCUMFERENCE}
                            strokeDashoffset={animatedOffset}
                        />
                        <text x="60" y="60" className="score-text">{animatedScore}</text>
                    </svg>
                </div>

                {/* Verdict */}
                <div className={`results-verdict ${passed ? 'results-verdict--pass' : 'results-verdict--fail'}`}>
                    {passed ? '🏆 Challenge Passed!' : '❌ Not Quite Yet'}
                </div>

                {result.isReReview && (
                    <div className="results-re-review-badge">🔄 Re-reviewed</div>
                )}

                {/* Time */}
                {result.timeMs && (
                    <div className="results-time">
                        ⏱ {Math.floor(result.timeMs / 60000)}m {Math.round((result.timeMs % 60000) / 1000)}s
                    </div>
                )}

                {/* Feedback — AI sometimes returns objects instead of strings, guard against that */}
                <div className="results-feedback">
                    <p className="results-feedback__text">
                        {toStr(result.feedback)}
                    </p>
                    {result.details && (
                        <details className="results-details">
                            <summary>View Details</summary>
                            <p>{toStr(result.details)}</p>
                        </details>
                    )}
                    {result.reviewNote && (
                        <div className="results-review-note">
                            <strong>Review note:</strong> {toStr(result.reviewNote)}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="modal__actions">
                    <button className="btn btn-primary" onClick={onNext}>
                        ▶ Next Challenge
                    </button>
                    {/* Re-review: only show if not already a re-review */}
                    {!result.isReReview && (
                        <button
                            className="btn btn-secondary"
                            onClick={onReReview}
                            disabled={judging}
                            title="If the AI gave a wrong verdict, ask it to review again with a more careful model"
                        >
                            {judging ? '⏳ Re-reviewing…' : '🔄 Request Re-review'}
                        </button>
                    )}
                    <button className="btn btn-ghost" onClick={onClose || onNext}>Close</button>
                </div>
            </div>
        </div>
    );
}
