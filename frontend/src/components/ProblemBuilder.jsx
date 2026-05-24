import { useState, useCallback } from 'react';
import './ProblemBuilder.css';

// ── Default empty problem template ───────────────────────
function createEmptyProblem() {
    return {
        title: '',
        description: '',
        difficulty: 'Beginner',
        hints: [],
        points: 100,
        terminalConfig: {
            files: [{ path: 'README.md', content: '# Your Repository\n\nWelcome to the challenge!' }],
            setupCommands: [],
            gitBranches: [],
        },
        successCriteria: {
            description: '',
            fileChecks: [],
            gitChecks: { branchExists: '', commitMessageContains: '' },
        },
        testCases: [],
    };
}

// ══════════════════════════════════════════════════════════
// ── Single Problem Editor (collapsible card) ─────────────
// ══════════════════════════════════════════════════════════
function ProblemEditor({ problem, index, onChange, onRemove, expanded, onToggle }) {
    const [activeTab, setActiveTab] = useState('details');

    const update = useCallback((field, value) => {
        onChange(index, { ...problem, [field]: value });
    }, [index, problem, onChange]);

    const updateNested = useCallback((parent, field, value) => {
        onChange(index, {
            ...problem,
            [parent]: { ...problem[parent], [field]: value },
        });
    }, [index, problem, onChange]);

    // ── File management ──
    const addFile = () => {
        const files = [...(problem.terminalConfig?.files || []), { path: '', content: '' }];
        updateNested('terminalConfig', 'files', files);
    };
    const updateFile = (i, key, val) => {
        const files = [...problem.terminalConfig.files];
        files[i] = { ...files[i], [key]: val };
        updateNested('terminalConfig', 'files', files);
    };
    const removeFile = (i) => {
        updateNested('terminalConfig', 'files', problem.terminalConfig.files.filter((_, j) => j !== i));
    };

    // ── Test case management ──
    const addTestCase = () => {
        update('testCases', [...(problem.testCases || []), { input: '', expectedOutput: '', hidden: false }]);
    };
    const updateTestCase = (i, key, val) => {
        const tcs = [...problem.testCases];
        tcs[i] = { ...tcs[i], [key]: val };
        update('testCases', tcs);
    };
    const removeTestCase = (i) => {
        update('testCases', problem.testCases.filter((_, j) => j !== i));
    };

    // ── Hint management ──
    const addHint = () => update('hints', [...(problem.hints || []), '']);
    const updateHint = (i, val) => {
        const h = [...problem.hints]; h[i] = val;
        update('hints', h);
    };
    const removeHint = (i) => update('hints', problem.hints.filter((_, j) => j !== i));

    // ── File check management ──
    const addFileCheck = () => {
        const checks = [...(problem.successCriteria?.fileChecks || []), { path: '', contains: '' }];
        updateNested('successCriteria', 'fileChecks', checks);
    };
    const updateFileCheck = (i, key, val) => {
        const checks = [...problem.successCriteria.fileChecks];
        checks[i] = { ...checks[i], [key]: val };
        updateNested('successCriteria', 'fileChecks', checks);
    };
    const removeFileCheck = (i) => {
        updateNested('successCriteria', 'fileChecks', problem.successCriteria.fileChecks.filter((_, j) => j !== i));
    };

    // ── Setup command management ──
    const addSetupCmd = () => {
        const cmds = [...(problem.terminalConfig?.setupCommands || []), ''];
        updateNested('terminalConfig', 'setupCommands', cmds);
    };
    const updateSetupCmd = (i, val) => {
        const cmds = [...problem.terminalConfig.setupCommands]; cmds[i] = val;
        updateNested('terminalConfig', 'setupCommands', cmds);
    };
    const removeSetupCmd = (i) => {
        updateNested('terminalConfig', 'setupCommands', problem.terminalConfig.setupCommands.filter((_, j) => j !== i));
    };

    // ── Branch management ──
    const addBranch = () => {
        const branches = [...(problem.terminalConfig?.gitBranches || []), ''];
        updateNested('terminalConfig', 'gitBranches', branches);
    };
    const updateBranch = (i, val) => {
        const b = [...problem.terminalConfig.gitBranches]; b[i] = val;
        updateNested('terminalConfig', 'gitBranches', b);
    };
    const removeBranch = (i) => {
        updateNested('terminalConfig', 'gitBranches', problem.terminalConfig.gitBranches.filter((_, j) => j !== i));
    };

    const diffBadge = { Beginner: 'badge-beginner', Intermediate: 'badge-intermediate', Advanced: 'badge-advanced' };
    const tc = problem.terminalConfig || {};
    const sc = problem.successCriteria || {};

    return (
        <div className={`problem-card ${expanded ? 'problem-card--expanded' : ''}`}>
            {/* ── Header ── */}
            <div className="problem-card__header" onClick={onToggle}>
                <span className="problem-card__number">{index + 1}</span>
                <div className="problem-card__info">
                    <div className="problem-card__title-text">
                        {problem.title || `Problem ${index + 1}`}
                    </div>
                    <div className="problem-card__sub">
                        {tc.files?.length || 0} files · {(problem.testCases || []).length} test cases · {problem.points} pts
                    </div>
                </div>
                <div className="problem-card__actions">
                    <span className={`badge ${diffBadge[problem.difficulty] || 'badge-beginner'}`}>
                        {problem.difficulty}
                    </span>
                    <button className="file-entry__delete" onClick={e => { e.stopPropagation(); onRemove(index); }}
                        title="Remove problem">✕</button>
                    <span className="problem-card__chevron">▼</span>
                </div>
            </div>

            {/* ── Body (expanded only) ── */}
            {expanded && (
                <div className="problem-card__body">
                    {/* Tabs */}
                    <div className="builder-tabs">
                        {['details', 'terminal', 'validation', 'tests'].map(tab => (
                            <button key={tab}
                                className={`builder-tab ${activeTab === tab ? 'builder-tab--active' : ''}`}
                                onClick={() => setActiveTab(tab)}>
                                {tab === 'details' && '📝 Details'}
                                {tab === 'terminal' && '💻 Terminal Setup'}
                                {tab === 'validation' && '✅ Success Criteria'}
                                {tab === 'tests' && '🧪 Test Cases'}
                            </button>
                        ))}
                    </div>

                    {/* ════ Details Tab ════ */}
                    {activeTab === 'details' && (
                        <div className="builder-section">
                            <div className="builder-row">
                                <div className="field">
                                    <label className="label">Problem Title *</label>
                                    <input className="input" placeholder="e.g. Create a Feature Branch"
                                        value={problem.title} onChange={e => update('title', e.target.value)} />
                                </div>
                                <div className="builder-row">
                                    <div className="field">
                                        <label className="label">Difficulty</label>
                                        <select className="input" value={problem.difficulty}
                                            onChange={e => update('difficulty', e.target.value)}>
                                            <option>Beginner</option>
                                            <option>Intermediate</option>
                                            <option>Advanced</option>
                                        </select>
                                    </div>
                                    <div className="field">
                                        <label className="label">Points</label>
                                        <input className="input" type="number" min="10" max="500"
                                            value={problem.points} onChange={e => update('points', parseInt(e.target.value) || 100)} />
                                    </div>
                                </div>
                            </div>

                            <div className="field">
                                <label className="label">Description * (What should the user do?)</label>
                                <textarea className="builder-textarea" rows={4}
                                    placeholder="Describe the challenge in detail. You can explain the git scenario, what the user needs to accomplish, and what the expected end state should be."
                                    value={problem.description} onChange={e => update('description', e.target.value)} />
                            </div>

                            {/* Hints */}
                            <div className="field">
                                <label className="label">Hints ({(problem.hints || []).length})</label>
                                {(problem.hints || []).map((h, i) => (
                                    <div className="hint-entry" key={i}>
                                        <input className="input" placeholder={`Hint ${i + 1}...`}
                                            value={h} onChange={e => updateHint(i, e.target.value)} />
                                        <button className="file-entry__delete" onClick={() => removeHint(i)}>✕</button>
                                    </div>
                                ))}
                                <button className="add-btn" onClick={addHint}>+ Add Hint</button>
                            </div>
                        </div>
                    )}

                    {/* ════ Terminal Setup Tab ════ */}
                    {activeTab === 'terminal' && (
                        <div className="builder-section">
                            {/* Initial files */}
                            <div className="field">
                                <label className="builder-section__title">📁 Initial Files</label>
                                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                    These files will exist in the sandbox when the user starts.
                                </p>
                                {(tc.files || []).map((f, i) => (
                                    <div className="file-entry" key={i} style={{ marginBottom: '0.5rem' }}>
                                        <div className="file-entry__header">
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>📄</span>
                                            <input className="file-entry__path" placeholder="path/to/file.txt"
                                                value={f.path} onChange={e => updateFile(i, 'path', e.target.value)} />
                                            <button className="file-entry__delete" onClick={() => removeFile(i)}>✕</button>
                                        </div>
                                        <textarea className="file-entry__content" rows={3}
                                            placeholder="File content..."
                                            value={f.content} onChange={e => updateFile(i, 'content', e.target.value)} />
                                    </div>
                                ))}
                                <button className="add-btn" onClick={addFile}>+ Add File</button>
                            </div>

                            {/* Git branches */}
                            <div className="field">
                                <label className="builder-section__title">🔀 Git Branches</label>
                                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                    Extra branches to create (main is always created).
                                </p>
                                {(tc.gitBranches || []).map((b, i) => (
                                    <div className="hint-entry" key={i}>
                                        <input className="input" placeholder="branch-name"
                                            value={b} onChange={e => updateBranch(i, e.target.value)} />
                                        <button className="file-entry__delete" onClick={() => removeBranch(i)}>✕</button>
                                    </div>
                                ))}
                                <button className="add-btn" onClick={addBranch}>+ Add Branch</button>
                            </div>

                            {/* Extra setup commands */}
                            <div className="field">
                                <label className="builder-section__title">⚙️ Extra Setup Commands</label>
                                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                    Shell commands to run after initial file/branch setup (e.g., create commits, modify files).
                                </p>
                                {(tc.setupCommands || []).map((cmd, i) => (
                                    <div className="hint-entry" key={i}>
                                        <input className="input" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
                                            placeholder="e.g. echo 'bug' >> file.txt && git add . && git commit -m 'add bug'"
                                            value={cmd} onChange={e => updateSetupCmd(i, e.target.value)} />
                                        <button className="file-entry__delete" onClick={() => removeSetupCmd(i)}>✕</button>
                                    </div>
                                ))}
                                <button className="add-btn" onClick={addSetupCmd}>+ Add Command</button>
                            </div>
                        </div>
                    )}

                    {/* ════ Success Criteria Tab ════ */}
                    {activeTab === 'validation' && (
                        <div className="builder-section">
                            <div className="field">
                                <label className="builder-section__title">🤖 AI Validation Description</label>
                                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                    Describe in natural language what a correct solution looks like. This is what the AI judge evaluates.
                                </p>
                                <textarea className="builder-textarea" rows={3}
                                    placeholder="e.g. The user should have created a 'feature' branch, switched to it, added a file called 'feature.txt' and committed it with a meaningful message."
                                    value={sc.description || ''}
                                    onChange={e => updateNested('successCriteria', 'description', e.target.value)} />
                            </div>

                            {/* File checks */}
                            <div className="field">
                                <label className="builder-section__title">📄 File Content Checks</label>
                                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                    Verify specific file content after the user solves the challenge.
                                </p>
                                {(sc.fileChecks || []).map((fc, i) => (
                                    <div className="criteria-row" key={i}>
                                        <input className="input" placeholder="file path (e.g. feature.txt)"
                                            value={fc.path} onChange={e => updateFileCheck(i, 'path', e.target.value)} />
                                        <input className="input" placeholder="must contain..."
                                            value={fc.contains} onChange={e => updateFileCheck(i, 'contains', e.target.value)} />
                                        <button className="file-entry__delete" onClick={() => removeFileCheck(i)}>✕</button>
                                    </div>
                                ))}
                                <button className="add-btn" onClick={addFileCheck}>+ Add File Check</button>
                            </div>

                            {/* Git checks */}
                            <div className="field">
                                <label className="builder-section__title">🔍 Git State Checks</label>
                                <div className="builder-row">
                                    <div className="field">
                                        <label className="label">Branch Must Exist</label>
                                        <input className="input" placeholder="e.g. feature"
                                            value={sc.gitChecks?.branchExists || ''}
                                            onChange={e => {
                                                const gc = { ...(sc.gitChecks || {}), branchExists: e.target.value };
                                                updateNested('successCriteria', 'gitChecks', gc);
                                            }} />
                                    </div>
                                    <div className="field">
                                        <label className="label">Commit Message Contains</label>
                                        <input className="input" placeholder="e.g. add feature"
                                            value={sc.gitChecks?.commitMessageContains || ''}
                                            onChange={e => {
                                                const gc = { ...(sc.gitChecks || {}), commitMessageContains: e.target.value };
                                                updateNested('successCriteria', 'gitChecks', gc);
                                            }} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ════ Test Cases Tab ════ */}
                    {activeTab === 'tests' && (
                        <div className="builder-section">
                            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                Define input/output test cases for command-based validation (optional).
                            </p>
                            {(problem.testCases || []).map((tc, i) => (
                                <div className="test-case-entry" key={i}>
                                    <div className="field">
                                        <label className="label">Input</label>
                                        <textarea className="builder-textarea builder-textarea--code" rows={2}
                                            placeholder="git branch" value={tc.input}
                                            onChange={e => updateTestCase(i, 'input', e.target.value)} />
                                    </div>
                                    <div className="field">
                                        <label className="label">Expected Output</label>
                                        <textarea className="builder-textarea builder-textarea--code" rows={2}
                                            placeholder="* feature\n  main" value={tc.expectedOutput}
                                            onChange={e => updateTestCase(i, 'expectedOutput', e.target.value)} />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', paddingTop: '1.4rem' }}>
                                        <label className="test-case-hidden">
                                            <input type="checkbox" checked={tc.hidden}
                                                onChange={e => updateTestCase(i, 'hidden', e.target.checked)} />
                                            Hidden
                                        </label>
                                        <button className="file-entry__delete" onClick={() => removeTestCase(i)}>✕</button>
                                    </div>
                                </div>
                            ))}
                            <button className="add-btn" onClick={addTestCase}>+ Add Test Case</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════
// ── ProblemBuilder (list of problem editors) ─────────────
// ══════════════════════════════════════════════════════════
export default function ProblemBuilder({ problems, onChange }) {
    const [expandedIndex, setExpandedIndex] = useState(0);

    const addProblem = () => {
        const updated = [...problems, createEmptyProblem()];
        onChange(updated);
        setExpandedIndex(updated.length - 1);
    };

    const updateProblem = (index, problem) => {
        const updated = [...problems];
        updated[index] = problem;
        onChange(updated);
    };

    const removeProblem = (index) => {
        if (problems.length <= 1) return;
        onChange(problems.filter((_, i) => i !== index));
        if (expandedIndex >= index && expandedIndex > 0) {
            setExpandedIndex(expandedIndex - 1);
        }
    };

    return (
        <div>
            <div className="problem-list">
                {problems.map((p, i) => (
                    <ProblemEditor key={i}
                        problem={p} index={i}
                        onChange={updateProblem}
                        onRemove={removeProblem}
                        expanded={expandedIndex === i}
                        onToggle={() => setExpandedIndex(expandedIndex === i ? -1 : i)}
                    />
                ))}
            </div>
            <button className="add-btn" onClick={addProblem}
                style={{ marginTop: '0.75rem', width: '100%', justifyContent: 'center', padding: '0.6rem' }}>
                ➕ Add Problem
            </button>
        </div>
    );
}

export { createEmptyProblem };
