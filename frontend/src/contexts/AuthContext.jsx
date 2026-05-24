import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        const savedUser = localStorage.getItem('GitWallah_user');
        return (!savedUser && savedUser != undefined) ? JSON.parse(savedUser) : null;
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('GitWallah_token');
        if (token) {
            api.get('/auth/')
                .then(r => {
                    setUser(r.data.user);
                    localStorage.setItem('GitWallah_user', JSON.stringify(r.data.user));
                })
                .catch(() => {
                    localStorage.removeItem('GitWallah_token');
                    localStorage.removeItem('GitWallah_user');
                    setUser(null);
                })
                .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, []);

    const login = async (email, password) => {
        const r = await api.post('/auth/login', { email, password });
        localStorage.setItem('GitWallah_token', r.data.token);
        localStorage.setItem('GitWallah_user', JSON.stringify(r.data.user));
        setUser(r.data.user);
        return r.data;
    };

    const register = async (username, email, password) => {
        const r = await api.post('/auth/register', { username, email, password });
        localStorage.setItem('GitWallah_token', r.data.token);
        localStorage.setItem('GitWallah_user', JSON.stringify(r.data.user));
        setUser(r.data.user);
        return r.data;
    };

    const logout = () => {
        localStorage.removeItem('GitWallah_token');
        localStorage.removeItem('GitWallah_user');
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, setUser, login, register, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
