import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ChallengeProvider } from './contexts/ChallengeContext';
import { ToastProvider } from './contexts/ToastContext';
import { ContestProvider } from './contexts/ContestContext';
import Layout from './components/Layout';
import LandingPage from './pages/LandingPage';
import ChallengePage from './pages/ChallengePage';
import ProfilePage from './pages/ProfilePage';
import CheatSheetPage from './pages/CheatSheetPage';
import AuthPage from './pages/AuthPage';
import ContestPage from './pages/ContestPage';
import ContestAttemptPage from './pages/ContestAttemptPage';
import DuelJoinPage from './pages/DuelJoinPage';
import './index.css';

function App() {
  return (
    <AuthProvider>
      <ChallengeProvider>
        <ContestProvider>
          <ToastProvider>
            <BrowserRouter>
              <Routes>
                {/* Landing page — no header/layout wrapper so it's full-bleed */}
                <Route element={<Layout />}>
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/practice" element={<ChallengePage />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="/cheatsheet" element={<CheatSheetPage />} />
                  <Route path="/auth" element={<AuthPage />} />
                  <Route path="/contests" element={<ContestPage />} />
                  <Route path="/contests/:contestId" element={<ContestAttemptPage />} />
                  <Route path="/duel/:roomId" element={<DuelJoinPage />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </ToastProvider>
        </ContestProvider>
      </ChallengeProvider>
    </AuthProvider>
  );
}

export default App;
