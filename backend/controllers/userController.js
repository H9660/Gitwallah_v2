import { generateToken } from "../middleware/auth.js";
import User from "../models/User.js";
import ChallengeResult from "../models/ChallengeResult.js";

export const registerUser = async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) return res.status(400).json({ error: 'All fields required' });

        const existing = await User.findOne({ $or: [{ username }, { email }] });
        if (existing) return res.status(400).json({ error: 'User already exists' });

        const passwordHash = await User.hashPassword(password);
        const user = new User({ username, email, passwordHash });
        await user.save();

        const token = generateToken(user._id);
        console.log("new ones here", token)
        res.json({ token, user: { id: user._id, username, email, stats: user.stats } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const token = generateToken(user._id);
        res.json({ token, user: { id: user._id, username: user.username, email, stats: user.stats } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

export const getUser = async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('-passwordHash');
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

export const getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('-passwordHash');
        if (!user) return res.status(404).json({ error: 'User not found' });

        const history = await ChallengeResult.find({ userId: user._id })
            .sort({ createdAt: -1 })
            .limit(20);

        res.json({ user, history });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}