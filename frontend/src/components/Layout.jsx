import { Outlet } from 'react-router-dom';
import Header from './Header';

export default function Layout() {
    return (
        <div className="app-layout">
            <div className="bg-grid" />
            <div className="bg-glow bg-glow--1" />
            <div className="bg-glow bg-glow--2" />
            <Header />
            <main style={{ flex: 1, position: 'relative', zIndex: 1 }}>
                <Outlet />
            </main>
        </div>
    );
}
