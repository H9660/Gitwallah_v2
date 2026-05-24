import { useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DuelPanel from '../components/DuelPanel';
import './ChallengePage.css'; // reuse the same shell styles

/**
 * DuelJoinPage — mounted at /duel/:roomId
 *
 * When someone receives a share link like
 *   http://host:5173/duel/ABC123?server=192.168.x.x
 * they land here directly instead of the LandingPage.
 *
 * The roomId is passed to DuelPanel via the `initialRoomId` prop,
 * which pre-fills the join form and triggers the join phase immediately.
 */
export default function DuelJoinPage() {
    const { roomId } = useParams();
    const { user } = useAuth();

    return (
        <div className="challenge-page" style={{ minHeight: '100vh' }}>
            <DuelPanel
                model="gemini-2.5-flash"
                onSwitchMode={() => (window.location.href = '/practice')}
                user={user}
                initialRoomId={roomId}
            />
        </div>
    );
}
