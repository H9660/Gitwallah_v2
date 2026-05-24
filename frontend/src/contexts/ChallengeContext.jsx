import { createContext, useContext, useState, useRef, useEffect } from 'react';
import api from '../api';

const ChallengeContext = createContext();

export function useChallengeSetup() {
    return useContext(ChallengeContext);
}

export function ChallengeProvider({ children }) {
    // Challenge Info
    const [challenge, setChallenge] = useState(null);
    const [generating, setGenerating] = useState(false);

    // Timer State
    const [elapsed, setElapsed] = useState(0);
    const timerRef = useRef(null);
    const startTimeRef = useRef(null);

    // Keep track of total elapsed before stopping
    const startTimer = () => {
        if (!startTimeRef.current) {
            startTimeRef.current = Date.now() - elapsed;
        }

        const tick = () => {
            if (startTimeRef.current) {
                setElapsed(Date.now() - startTimeRef.current);
                timerRef.current = requestAnimationFrame(tick);
            }
        };

        if (!timerRef.current) {
            timerRef.current = requestAnimationFrame(tick);
        }
    };

    const stopTimer = () => {
        if (timerRef.current) {
            cancelAnimationFrame(timerRef.current);
            timerRef.current = null;
        }
        startTimeRef.current = null;
    };

    const resetTimer = () => {
        stopTimer();
        setElapsed(0);
    };

    const fetchChallenge = async (difficulty, model) => {
        try {
            setGenerating(true);
            setChallenge(null);
            resetTimer();
            const available = ["Beginner", "Intermediate", "Advanced"]

            const queryDiff = difficulty === 'All' ? available[Math.floor(Math.random() * available.length)] : difficulty;
            const res = await api.get(`/challenge/generate?difficulty=${queryDiff}&model=${model}`);

            setChallenge(res.data);
            startTimer();
            return true;
        } catch (err) {
            console.error(err);
            return false;
        } finally {
            setGenerating(false);
        }
    };

    const clearChallenge = () => {
        setChallenge(null);
        resetTimer();
    }

    return (
        <ChallengeContext.Provider value={{
            challenge,
            setChallenge,
            generating,
            fetchChallenge,
            clearChallenge,
            elapsed,
            stopTimer,
            startTimer
        }}>
            {children}
        </ChallengeContext.Provider>
    );
}
