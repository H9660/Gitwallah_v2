import mongoose from 'mongoose';

// ── File definition for terminal initial state ───────────
const fileSchema = new mongoose.Schema({
    path: { type: String, required: true },
    content: { type: String, default: '' },
}, { _id: false });

// ── Terminal configuration ───────────────────────────────
const terminalConfigSchema = new mongoose.Schema({
    files: [fileSchema],
    setupCommands: [{ type: String }],
    gitBranches: [{ type: String }],
}, { _id: false });

// ── Success criteria for AI + programmatic judging ───────
const successCriteriaSchema = new mongoose.Schema({
    description: { type: String, default: '' },    // Natural language for AI judge
    fileChecks: [{
        path: { type: String },
        contains: { type: String },
    }],
    gitChecks: {
        branchExists: { type: String, default: '' },
        commitMessageContains: { type: String, default: '' },
    },
}, { _id: false });

// ── Test cases (input/output validation) ─────────────────
const testCaseSchema = new mongoose.Schema({
    input: { type: String, default: '' },
    expectedOutput: { type: String, default: '' },
    hidden: { type: Boolean, default: false },
}, { _id: false });

// ── Problem (challenge) within a contest ─────────────────
const contestProblemSchema = new mongoose.Schema({
    // Core info
    title: { type: String, required: true },
    description: { type: String, required: true },
    difficulty: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced'], default: 'Beginner' },
    hints: [{ type: String }],
    points: { type: Number, default: 100 },

    // Backward compat: reference to a static challenge
    challengeId: { type: String, default: '' },
    isStatic: { type: Boolean, default: false },

    // Custom problem fields
    terminalConfig: { type: terminalConfigSchema, default: () => ({ files: [], setupCommands: [], gitBranches: [] }) },
    successCriteria: { type: successCriteriaSchema, default: () => ({ description: '', fileChecks: [], gitChecks: {} }) },
    testCases: [testCaseSchema],
    validationContext: { type: String, default: '' },  // legacy field for static challenges
}, { _id: false });

// ── Submission tracking ──────────────────────────────────
const submissionSchema = new mongoose.Schema({
    challengeIndex: { type: Number, required: true },
    score: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },
    timeMs: { type: Number, default: 0 },
    judgedAt: { type: Date, default: null },
}, { _id: false });

// ── Leaderboard entry ────────────────────────────────────
const leaderboardEntrySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true },
    totalScore: { type: Number, default: 0 },
    totalTime: { type: Number, default: 0 },
    solvedCount: { type: Number, default: 0 },
    submissions: [submissionSchema],
}, { _id: false });

// ══════════════════════════════════════════════════════════
// ── Contest Schema ───────────────────────────────────────
// ══════════════════════════════════════════════════════════
const contestSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    difficulty: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced', 'Mixed'], default: 'Mixed' },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    problems: [contestProblemSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    leaderboard: [leaderboardEntrySchema],
}, { timestamps: true });

// Virtual: compute contest status from time
contestSchema.virtual('status').get(function () {
    const now = new Date();
    if (now < this.startTime) return 'upcoming';
    if (now >= this.startTime && now <= this.endTime) return 'live';
    return 'ended';
});

contestSchema.set('toJSON', { virtuals: true });
contestSchema.set('toObject', { virtuals: true });
contestSchema.index({ startTime: 1, endTime: 1 });

export default mongoose.model('Contest', contestSchema);
