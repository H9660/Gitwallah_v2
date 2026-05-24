import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import api from '../api';

const ContestContext = createContext();

export function useContest() {
    return useContext(ContestContext);
}

export function ContestProvider({ children }) {
    const { user } = useAuth();
    const [contests, setContests] = useState([]);
    const [activeContest, setActiveContest] = useState(null);
    const [challenges, setChallenges] = useState([]);
    const [activeChallengeIndex, setActiveChallengeIndex] = useState(0);
    const [submissions, setSubmissions] = useState({});  // { [challengeIndex]: judgeResult }
    const [loading, setLoading] = useState(false);
    // Start at Infinity so isContestOver is never true before the countdown fires its first tick.
    // It is set to the real value by startCountdown → requestAnimationFrame → tick.
    const [remaining, setRemaining] = useState(Infinity);
    const [liveLeaderboard, setLiveLeaderboard] = useState([]);

    const timerRef = useRef(null);
    const endTimeRef = useRef(null);

    // ── Timer ──
    const startCountdown = useCallback((endTime) => {
        endTimeRef.current = new Date(endTime).getTime();

        const tick = () => {
            const ms = Math.max(0, endTimeRef.current - Date.now());
            setRemaining(ms);
            if (ms > 0) {
                timerRef.current = requestAnimationFrame(tick);
            }
        };
        if (timerRef.current) cancelAnimationFrame(timerRef.current);
        timerRef.current = requestAnimationFrame(tick);
    }, []);

    const stopCountdown = useCallback(() => {
        if (timerRef.current) {
            cancelAnimationFrame(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    // Cleanup on unmount
    useEffect(() => () => stopCountdown(), [stopCountdown]);

    // ── Fetch contest list ──
    const fetchContests = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/contests');
            setContests(res.data.contests || []);
        } catch (err) {
            console.error('Failed to fetch contests:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    // ── Join contest ──
    const joinContest = useCallback(async (contestId) => {
        try {
            const res = await api.post(`/contests/${contestId}/join`);
            setActiveContest({
                id: contestId,
                title: res.data.title,
                endTime: res.data.endTime,
            });
            setChallenges(res.data.challenges || []);
            setActiveChallengeIndex(0);
            setSubmissions({});
            startCountdown(res.data.endTime);
            return true;
        } catch (err) {
            console.error('Failed to join contest:', err);
            return false;
        }
    }, [startCountdown]);

    // ── Setup challenge sandbox ──
    const setupChallenge = useCallback(async (contestId, challengeIndex) => {
        try {
            await api.post(`/contests/${contestId}/setup`, { challengeIndex });
            setActiveChallengeIndex(challengeIndex);
            return true;
        } catch (err) {
            console.error('Failed to setup challenge:', err);
            return false;
        }
    }, []);

    // ── Leave contest ──
    const leaveContest = useCallback(() => {
        stopCountdown();
        setActiveContest(null);
        setChallenges([]);
        setActiveChallengeIndex(0);
        setSubmissions({});
        setRemaining(Infinity); // Reset to Infinity, not 0, to avoid isContestOver flash on re-entry
        setLiveLeaderboard([]);
    }, [stopCountdown]);

    // ══════════════════════════════════════════════════════════
    // ── Admin Operations (Creator only) ─────────────────────
    // ══════════════════════════════════════════════════════════

    const isContestCreator = useCallback((contest) => {
        if (!user || !contest) return false;
        const creatorId = contest.createdBy?._id || contest.createdBy;
        return creatorId && creatorId.toString() === user.id;
    }, [user]);

    const updateContestDetails = useCallback(async (contestId, data) => {
        try {
            const res = await api.put(`/contests/${contestId}`, data);
            // Update local state
            setContests(prev => prev.map(c => c._id === contestId ? res.data.contest : c));
            return { ok: true, contest: res.data.contest };
        } catch (err) {
            return { ok: false, error: err.response?.data?.error || 'Failed to update contest' };
        }
    }, []);

    const deleteContestAction = useCallback(async (contestId) => {
        try {
            await api.delete(`/contests/${contestId}`);
            setContests(prev => prev.filter(c => c._id !== contestId));
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err.response?.data?.error || 'Failed to delete contest' };
        }
    }, []);

    const endContestAction = useCallback(async (contestId) => {
        try {
            const res = await api.post(`/contests/${contestId}/end`);
            setContests(prev => prev.map(c => c._id === contestId ? res.data.contest : c));
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err.response?.data?.error || 'Failed to end contest' };
        }
    }, []);

    const resetLeaderboardAction = useCallback(async (contestId) => {
        try {
            await api.post(`/contests/${contestId}/reset`);
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err.response?.data?.error || 'Failed to reset leaderboard' };
        }
    }, []);

    const removeParticipantAction = useCallback(async (contestId, userId) => {
        try {
            await api.delete(`/contests/${contestId}/participants/${userId}`);
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err.response?.data?.error || 'Failed to remove participant' };
        }
    }, []);

    const fetchParticipants = useCallback(async (contestId) => {
        try {
            const res = await api.get(`/contests/${contestId}/participants`);
            return { ok: true, participants: res.data.participants || [] };
        } catch (err) {
            return { ok: false, error: err.response?.data?.error || 'Failed to fetch participants' };
        }
    }, []);

    // Contest is over only when the countdown has actually reached zero (not the initial Infinity sentinel)
    const isContestOver = remaining <= 0 && remaining !== Infinity && activeContest != null;

    return (
        <ContestContext.Provider value={{
            // Contest list
            contests,
            fetchContests,
            loading,

            // Active contest
            activeContest,
            challenges,
            activeChallengeIndex,
            setActiveChallengeIndex,
            submissions,
            setSubmissions,
            remaining,
            isContestOver,

            // Contest actions
            joinContest,
            setupChallenge,
            leaveContest,

            // Leaderboard
            liveLeaderboard,
            setLiveLeaderboard,

            // Admin operations
            isContestCreator,
            updateContestDetails,
            deleteContestAction,
            endContestAction,
            resetLeaderboardAction,
            removeParticipantAction,
            fetchParticipants,
        }}>
            {children}
        </ContestContext.Provider>
    );
}
