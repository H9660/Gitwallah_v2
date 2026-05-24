import mongoose from 'mongoose';

const challengeResultSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    challengeId: { type: String, required: true },
    title: { type: String, required: true },
    difficulty: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced'], required: true },
    score: { type: Number, required: true },
    passed: { type: Boolean, required: true },
    timeMs: { type: Number, required: true }, // time taken in milliseconds
    mode: { type: String, enum: ['solo', 'duel'], default: 'solo' },
    isAIGenerated: { type: Boolean, default: false },
}, { timestamps: true });

challengeResultSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('ChallengeResult', challengeResultSchema);
