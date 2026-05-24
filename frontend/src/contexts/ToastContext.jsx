import { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext();

let toastId = 0;

export function useToast() {
    return useContext(ToastContext);
}

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const timersRef = useRef({});

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
        if (timersRef.current[id]) {
            clearTimeout(timersRef.current[id]);
            delete timersRef.current[id];
        }
    }, []);

    const addToast = useCallback((message, type = 'info', duration = 3500) => {
        const id = ++toastId;
        const icons = {
            success: '✅',
            error: '❌',
            info: 'ℹ️',
            warning: '⚠️',
        };
        setToasts(prev => [...prev, { id, message, type, icon: icons[type] || icons.info }]);

        timersRef.current[id] = setTimeout(() => {
            removeToast(id);
        }, duration);

        return id;
    }, [removeToast]);

    const toast = {
        success: (msg, dur) => addToast(msg, 'success', dur),
        error: (msg, dur) => addToast(msg, 'error', dur),
        info: (msg, dur) => addToast(msg, 'info', dur),
        warning: (msg, dur) => addToast(msg, 'warning', dur),
    };

    return (
        <ToastContext.Provider value={toast}>
            {children}
            {/* Toast Container */}
            <div className="toast-container">
                {toasts.map(t => (
                    <div
                        key={t.id}
                        className={`toast toast-${t.type}`}
                        onClick={() => removeToast(t.id)}
                        role="alert"
                    >
                        <span className="toast-icon">{t.icon}</span>
                        <span className="toast-msg">{t.message}</span>
                        <button className="toast-close" onClick={(e) => { e.stopPropagation(); removeToast(t.id); }}>×</button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
