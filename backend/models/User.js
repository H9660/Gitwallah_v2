import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true, minlength: 2, maxlength: 30 },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    stats: {
        solved: { type: Number, default: 0 },
        avgScore: { type: Number, default: 0 },
        fastestSolveMs: { type: Number, default: Infinity },
        contestsPlayed: { type: Number, default: 0 },
        streak: { type: Number, default: 0 },
        lastSolvedDate: { type: Date, default: null },
    },
}, { timestamps: true });

userSchema.methods.comparePassword = function (plain) {
    return bcrypt.compare(plain, this.passwordHash);
};

userSchema.statics.hashPassword = function (plain) {
    return bcrypt.hash(plain, 10);
};

export default mongoose.model('User', userSchema);
