import { useState, useEffect, useRef } from 'react';
import './GeneratingModal.css';

const GIT_FACTS = [
    "Git was created by Linus Torvalds in 2005 to manage the Linux kernel development.",
    "The name 'Git' is British slang for a foolish person — Linus named it after himself!",
    "Git stores snapshots of your project, not differences between file versions.",
    "The first Git commit message was: 'Initial revision of \"git\", the information manager from hell'.",
    "GitHub has over 100 million developers and 420+ million repositories.",
    "A single Git repository can theoretically store up to 4GB of data per file.",
    "Git uses SHA-1 hashes to uniquely identify every commit, tree, and blob.",
    "The `.git` folder contains the entire history of your repository.",
    "You can sign your Git commits with GPG keys to verify your identity.",
    "`git bisect` uses binary search to find the commit that introduced a bug.",
    "Git's merge algorithm is based on the 3-way merge strategy.",
    "The `git reflog` command is your safety net — it tracks every HEAD movement.",
    "`git stash` temporarily shelves changes so you can work on something else.",
    "Git hooks let you run custom scripts at various points in the Git workflow.",
    "The `--amend` flag lets you modify the most recent commit without creating a new one.",
    "Git LFS (Large File Storage) handles versioning of large binary files efficiently.",
    "You can use `git cherry-pick` to apply a specific commit from another branch.",
    "Interactive rebase (`git rebase -i`) lets you rewrite commit history like a pro.",
    "The `git blame` command shows who last modified each line of a file.",
    "Git worktrees let you check out multiple branches simultaneously in separate directories.",
    "A detached HEAD means you're not on any branch — just viewing a specific commit.",
    "`git diff --cached` shows changes that are staged but not yet committed.",
    "The `git shortlog` command summarizes commit activity by author.",
    "You can configure Git to use different merge strategies with `git merge -s`.",
    "Git was designed to be fast — most operations run in milliseconds.",
    "The `.gitignore` file supports glob patterns and negation with `!`.",
    "`git log --graph --oneline` gives you a beautiful ASCII art of your branch history.",
    "Git submodules let you include external repositories inside your project.",
    "The `git clean` command removes untracked files from your working directory.",
    "You can create lightweight tags (just a name) or annotated tags (with metadata) in Git.",
];

const LOADING_PHASES = [
    { text: "Initializing AI model...", icon: "🧠" },
    { text: "Crafting your challenge...", icon: "⚡" },
    { text: "Setting up Git scenario...", icon: "🔧" },
    { text: "Building repository...", icon: "📦" },
    { text: "Almost ready...", icon: "✨" },
];

export default function GeneratingModal({ visible }) {
    const [currentFact, setCurrentFact] = useState('');
    const [factIndex, setFactIndex] = useState(0);
    const [phaseIndex, setPhaseIndex] = useState(0);
    const [fadeClass, setFadeClass] = useState('fact-enter');
    const usedIndices = useRef(new Set());

    // Pick a random fact that hasn't been shown yet
    const getNextFact = () => {
        if (usedIndices.current.size >= GIT_FACTS.length) {
            usedIndices.current.clear();
        }
        let idx;
        do {
            idx = Math.floor(Math.random() * GIT_FACTS.length);
        } while (usedIndices.current.has(idx));
        usedIndices.current.add(idx);
        return { fact: GIT_FACTS[idx], index: idx };
    };

    // Initialize with a random fact when modal becomes visible
    useEffect(() => {
        if (visible) {
            usedIndices.current.clear();
            setPhaseIndex(0);
            const { fact, index } = getNextFact();
            setCurrentFact(fact);
            setFactIndex(index);
            setFadeClass('fact-enter');
        }
    }, [visible]);

    // Cycle facts every 4 seconds with fade animation
    useEffect(() => {
        if (!visible) return;

        const interval = setInterval(() => {
            setFadeClass('fact-exit');

            setTimeout(() => {
                const { fact, index } = getNextFact();
                setCurrentFact(fact);
                setFactIndex(index);
                setFadeClass('fact-enter');
            }, 400);
        }, 4500);

        return () => clearInterval(interval);
    }, [visible]);

    // Cycle through loading phases
    useEffect(() => {
        if (!visible) return;

        const interval = setInterval(() => {
            setPhaseIndex(prev => (prev + 1) % LOADING_PHASES.length);
        }, 3000);

        return () => clearInterval(interval);
    }, [visible]);

    if (!visible) return null;

    const phase = LOADING_PHASES[phaseIndex];

    return (
        <div className="gen-modal-overlay">
            <div className="gen-modal">
                {/* Animated background particles */}
                <div className="gen-modal__particles">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className={`particle particle--${i + 1}`} />
                    ))}
                </div>

                {/* Custom loader animation */}
                <div className="gen-modal__loader">
                    <div className="git-orb">
                        <div className="git-orb__core" />
                        <div className="git-orb__ring git-orb__ring--1" />
                        <div className="git-orb__ring git-orb__ring--2" />
                        <div className="git-orb__ring git-orb__ring--3" />
                        <div className="git-orb__pulse" />
                    </div>
                </div>

                {/* Loading phase text */}
                <div className="gen-modal__phase">
                    <span className="phase-icon">{phase.icon}</span>
                    <span className="phase-text">{phase.text}</span>
                </div>

                {/* Progress dots */}
                <div className="gen-modal__dots">
                    {LOADING_PHASES.map((_, i) => (
                        <div
                            key={i}
                            className={`progress-dot ${i <= phaseIndex ? 'progress-dot--active' : ''} ${i === phaseIndex ? 'progress-dot--current' : ''}`}
                        />
                    ))}
                </div>

                {/* Fun fact section */}
                <div className="gen-modal__fact-section">
                    <div className="fact-label">
                        <span className="fact-label__icon">💡</span>
                        <span>Did you know?</span>
                    </div>
                    <p className={`fact-text ${fadeClass}`}>
                        {currentFact}
                    </p>
                </div>

                {/* Bottom shimmer bar */}
                <div className="gen-modal__shimmer-bar">
                    <div className="shimmer-track">
                        <div className="shimmer-fill" />
                    </div>
                </div>
            </div>
        </div>
    );
}
