import { useState, useMemo } from 'react';
import './CheatSheetPage.css';

const GIT_COMMANDS = [
    // Setup & Config
    { cmd: 'git init', desc: 'Initialize a new git repository in the current directory', category: 'Setup', example: 'git init' },
    { cmd: 'git clone <url>', desc: 'Clone a remote repository locally', category: 'Setup', example: 'git clone https://github.com/user/repo.git' },
    { cmd: 'git config --global user.name "Name"', desc: 'Set your global git username', category: 'Setup', example: 'git config --global user.name "John Doe"' },
    { cmd: 'git config --global user.email "email"', desc: 'Set your global git email', category: 'Setup', example: 'git config --global user.email "john@example.com"' },
    { cmd: 'git config --list', desc: 'Show all git configuration settings', category: 'Setup', example: 'git config --list' },

    // Staging & Committing
    { cmd: 'git status', desc: 'Show which files are staged, unstaged, or untracked', category: 'Staging', example: 'git status' },
    { cmd: 'git add <file>', desc: 'Stage a specific file for the next commit', category: 'Staging', example: 'git add README.md' },
    { cmd: 'git add .', desc: 'Stage all changed files in the current directory', category: 'Staging', example: 'git add .' },
    { cmd: 'git add -p', desc: 'Interactively stage chunks (hunks) of changes', category: 'Staging', example: 'git add -p' },
    { cmd: 'git commit -m "msg"', desc: 'Commit staged changes with a message', category: 'Staging', example: 'git commit -m "Add login feature"' },
    { cmd: 'git commit --amend', desc: 'Modify the most recent commit (message or files)', category: 'Staging', example: 'git commit --amend -m "Fixed typo"' },
    { cmd: 'git diff', desc: 'Show unstaged changes in working directory', category: 'Staging', example: 'git diff' },
    { cmd: 'git diff --staged', desc: 'Show staged changes (ready to commit)', category: 'Staging', example: 'git diff --staged' },

    // History
    { cmd: 'git log', desc: 'Show commit history', category: 'History', example: 'git log' },
    { cmd: 'git log --oneline', desc: 'Compact one-line per commit view', category: 'History', example: 'git log --oneline' },
    { cmd: 'git log --graph --all', desc: 'Visualize branch history as a graph', category: 'History', example: 'git log --oneline --graph --all' },
    { cmd: 'git show <commit>', desc: 'Show details of a specific commit', category: 'History', example: 'git show abc1234' },
    { cmd: 'git blame <file>', desc: 'Show who changed each line of a file', category: 'History', example: 'git blame app.js' },
    { cmd: 'git reflog', desc: 'Show history of HEAD movements (great for recovery)', category: 'History', example: 'git reflog' },

    // Branching
    { cmd: 'git branch', desc: 'List all local branches', category: 'Branching', example: 'git branch' },
    { cmd: 'git branch -a', desc: 'List all local and remote branches', category: 'Branching', example: 'git branch -a' },
    { cmd: 'git branch <name>', desc: 'Create a new branch', category: 'Branching', example: 'git branch feature/login' },
    { cmd: 'git checkout <branch>', desc: 'Switch to an existing branch', category: 'Branching', example: 'git checkout main' },
    { cmd: 'git checkout -b <name>', desc: 'Create and switch to a new branch in one step', category: 'Branching', example: 'git checkout -b feature/signup' },
    { cmd: 'git switch <branch>', desc: 'Modern way to switch branches', category: 'Branching', example: 'git switch feature/login' },
    { cmd: 'git branch -d <name>', desc: 'Delete a merged branch', category: 'Branching', example: 'git branch -d feature/old' },
    { cmd: 'git branch -D <name>', desc: 'Force delete a branch (even if unmerged)', category: 'Branching', example: 'git branch -D feature/abandoned' },

    // Merging & Rebasing
    { cmd: 'git merge <branch>', desc: 'Merge another branch into the current branch', category: 'Merging', example: 'git merge feature/login' },
    { cmd: 'git merge --no-ff <branch>', desc: 'Merge with a merge commit (no fast-forward)', category: 'Merging', example: 'git merge --no-ff feature/login' },
    { cmd: 'git merge --abort', desc: 'Abort an in-progress merge with conflicts', category: 'Merging', example: 'git merge --abort' },
    { cmd: 'git rebase <branch>', desc: 'Reapply commits on top of another branch', category: 'Merging', example: 'git rebase main' },
    { cmd: 'git rebase -i HEAD~n', desc: 'Interactive rebase to squash, reword, or reorder commits', category: 'Merging', example: 'git rebase -i HEAD~3' },
    { cmd: 'git rebase --abort', desc: 'Abort an in-progress rebase', category: 'Merging', example: 'git rebase --abort' },
    { cmd: 'git rebase --continue', desc: 'Continue a rebase after resolving conflicts', category: 'Merging', example: 'git rebase --continue' },
    { cmd: 'git cherry-pick <commit>', desc: 'Apply a single commit from another branch', category: 'Merging', example: 'git cherry-pick abc1234' },

    // Remote
    { cmd: 'git remote -v', desc: 'List remote connections', category: 'Remote', example: 'git remote -v' },
    { cmd: 'git remote add <name> <url>', desc: 'Add a new remote connection', category: 'Remote', example: 'git remote add origin https://github.com/user/repo.git' },
    { cmd: 'git fetch', desc: 'Download remote changes without merging', category: 'Remote', example: 'git fetch origin' },
    { cmd: 'git pull', desc: 'Fetch and merge remote changes into current branch', category: 'Remote', example: 'git pull origin main' },
    { cmd: 'git pull --rebase', desc: 'Fetch and rebase instead of merging', category: 'Remote', example: 'git pull --rebase origin main' },
    { cmd: 'git push', desc: 'Push current branch to remote', category: 'Remote', example: 'git push origin feature/login' },
    { cmd: 'git push -u origin <branch>', desc: 'Push and set upstream tracking branch', category: 'Remote', example: 'git push -u origin main' },
    { cmd: 'git push --force-with-lease', desc: 'Safe force push (fails if remote changed)', category: 'Remote', example: 'git push --force-with-lease' },

    // Undoing
    { cmd: 'git reset HEAD <file>', desc: 'Unstage a file (keep changes in working dir)', category: 'Undoing', example: 'git reset HEAD app.js' },
    { cmd: 'git reset --soft HEAD~1', desc: 'Undo last commit, keep changes staged', category: 'Undoing', example: 'git reset --soft HEAD~1' },
    { cmd: 'git reset --mixed HEAD~1', desc: 'Undo last commit, keep changes unstaged', category: 'Undoing', example: 'git reset --mixed HEAD~1' },
    { cmd: 'git reset --hard HEAD~1', desc: 'Undo last commit and discard all changes', category: 'Undoing', example: 'git reset --hard HEAD~1' },
    { cmd: 'git revert <commit>', desc: 'Create a new commit that undoes a past commit', category: 'Undoing', example: 'git revert abc1234' },
    { cmd: 'git restore <file>', desc: 'Discard unstaged changes to a file', category: 'Undoing', example: 'git restore app.js' },
    { cmd: 'git restore --staged <file>', desc: 'Unstage a file', category: 'Undoing', example: 'git restore --staged app.js' },

    // Stashing
    { cmd: 'git stash', desc: 'Temporarily save uncommitted changes', category: 'Stash', example: 'git stash' },
    { cmd: 'git stash push -m "msg"', desc: 'Stash with a descriptive message', category: 'Stash', example: 'git stash push -m "WIP login"' },
    { cmd: 'git stash list', desc: 'List all stashes', category: 'Stash', example: 'git stash list' },
    { cmd: 'git stash pop', desc: 'Apply and remove the latest stash', category: 'Stash', example: 'git stash pop' },
    { cmd: 'git stash apply stash@{n}', desc: 'Apply a specific stash without removing it', category: 'Stash', example: 'git stash apply stash@{1}' },
    { cmd: 'git stash drop stash@{n}', desc: 'Delete a specific stash', category: 'Stash', example: 'git stash drop stash@{0}' },
    { cmd: 'git stash clear', desc: 'Remove all stashes', category: 'Stash', example: 'git stash clear' },

    // Tags
    { cmd: 'git tag', desc: 'List all tags', category: 'Tags', example: 'git tag' },
    { cmd: 'git tag <name>', desc: 'Create a lightweight tag at HEAD', category: 'Tags', example: 'git tag v1.0.0' },
    { cmd: 'git tag -a <name> -m "msg"', desc: 'Create an annotated tag with a message', category: 'Tags', example: 'git tag -a v1.0.0 -m "First release"' },
    { cmd: 'git push origin --tags', desc: 'Push all tags to remote', category: 'Tags', example: 'git push origin --tags' },
    { cmd: 'git tag -d <name>', desc: 'Delete a local tag', category: 'Tags', example: 'git tag -d v0.9.0' },

    // Advanced
    { cmd: 'git bisect start', desc: 'Start a binary search through commits to find a bug', category: 'Advanced', example: 'git bisect start\ngit bisect bad\ngit bisect good v1.0' },
    { cmd: 'git bisect good/bad', desc: 'Mark a commit as good or bad during bisect', category: 'Advanced', example: 'git bisect good\ngit bisect bad' },
    { cmd: 'git worktree add <path> <branch>', desc: 'Check out a branch in a separate directory', category: 'Advanced', example: 'git worktree add ../hotfix hotfix/critical' },
    { cmd: 'git submodule add <url>', desc: 'Add a repository as a submodule', category: 'Advanced', example: 'git submodule add https://github.com/user/lib.git' },
    { cmd: 'git archive --format=zip HEAD > out.zip', desc: 'Export repository as a zip without .git', category: 'Advanced', example: 'git archive --format=zip HEAD > project.zip' },
];

const CATEGORIES = ['All', ...Array.from(new Set(GIT_COMMANDS.map(c => c.category)))];

const CATEGORY_ICONS = {
    Setup: '⚙️', Staging: '📦', History: '📜', Branching: '🌿',
    Merging: '🔀', Remote: '🌐', Undoing: '↩️', Stash: '🗂️',
    Tags: '🏷️', Advanced: '🔬', All: '🔍',
};

export default function CheatSheetPage() {
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('All');
    const [copied, setCopied] = useState('');

    const filtered = useMemo(() => {
        return GIT_COMMANDS.filter(c => {
            const matchCat = category === 'All' || c.category === category;
            const q = search.toLowerCase();
            const matchSearch = !q || c.cmd.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q);
            return matchCat && matchSearch;
        });
    }, [search, category]);

    const copyCmd = (cmd) => {
        navigator.clipboard.writeText(cmd);
        setCopied(cmd);
        setTimeout(() => setCopied(''), 1500);
    };

    return (
        <div className="page">
            <div className="page-header">
                <h1 className="page-title">📖 Git Cheat Sheet</h1>
                <p className="page-subtitle">Quick reference for {GIT_COMMANDS.length} essential Git commands</p>
            </div>

            {/* Controls */}
            <div className="cheatsheet-controls">
                <input
                    className="input cheatsheet-search"
                    placeholder="🔍 Search commands or descriptions…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <div className="category-tabs">
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat}
                            className={`cat-tab${category === cat ? ' cat-tab--active' : ''}`}
                            onClick={() => setCategory(cat)}
                        >
                            {CATEGORY_ICONS[cat] || '📌'} {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Results count */}
            <p className="cheatsheet-count text-muted">
                {filtered.length} command{filtered.length !== 1 ? 's' : ''}
                {search && ` matching "${search}"`}
                {category !== 'All' && ` in ${category}`}
            </p>

            {/* Commands grid */}
            <div className="cheatsheet-grid">
                {filtered.map((c, i) => (
                    <div key={i} className="cmd-card card">
                        <div className="cmd-card__header">
                            <code className="cmd-card__cmd">{c.cmd}</code>
                            <button
                                className="btn btn-ghost btn-icon btn-sm cmd-copy"
                                onClick={() => copyCmd(c.cmd)}
                                title="Copy command"
                            >
                                {copied === c.cmd ? '✅' : '📋'}
                            </button>
                        </div>
                        <p className="cmd-card__desc">{c.desc}</p>
                        {c.example && c.example !== c.cmd && (
                            <pre className="cmd-card__example">{c.example}</pre>
                        )}
                        <span className="cmd-card__cat badge badge-ai">
                            {CATEGORY_ICONS[c.category]} {c.category}
                        </span>
                    </div>
                ))}
            </div>

            {filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: '2rem' }}>🔍</div>
                    <p style={{ marginTop: '0.5rem' }}>No commands found. Try a different search.</p>
                </div>
            )}
        </div>
    );
}
