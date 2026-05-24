import express from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import {
    listContests,
    getContest,
    createContest,
    joinContest,
    setupContestChallenge,
    judgeContestChallenge,
    getLeaderboard,
    getAvailableChallenges,
    updateContest,
    deleteContest,
    endContest,
    resetLeaderboard,
    removeParticipant,
    getContestParticipants,
} from '../controllers/contestController.js';

const router = express.Router();

// Public
router.get('/', listContests);
router.get('/challenges', getAvailableChallenges);
router.get('/:id', getContest);
router.get('/:id/leaderboard', getLeaderboard);

// Authenticated — participant actions
router.post('/', optionalAuth, createContest);
router.post('/:id/join', requireAuth, joinContest);
router.post('/:id/setup', requireAuth, setupContestChallenge);
router.post('/:id/judge', requireAuth, judgeContestChallenge);

// Authenticated — admin (creator-only, enforced in controller)
router.put('/:id', requireAuth, updateContest);
router.delete('/:id', requireAuth, deleteContest);
router.post('/:id/end', requireAuth, endContest);
router.post('/:id/reset', requireAuth, resetLeaderboard);
router.get('/:id/participants', requireAuth, getContestParticipants);
router.delete('/:id/participants/:userId', requireAuth, removeParticipant);

export default router;
