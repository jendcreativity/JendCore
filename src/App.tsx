import { Route, Routes } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import StartSessionPage from './pages/StartSessionPage';
import JoinSessionPage from './pages/JoinSessionPage';
import SessionPage from './pages/SessionPage';
import NotFoundPage from './pages/NotFoundPage';

/**
 * Root application shell.
 *
 * Routing strategy:
 *   /                  → Landing (Start / Join entry)
 *   /start             → Create a session and redirect to /s/:id
 *   /join              → Enter a session code
 *   /s/:sessionId      → Live session room
 *
 * Kept deliberately small. JendCore is not a dashboard.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/start" element={<StartSessionPage />} />
      <Route path="/join" element={<JoinSessionPage />} />
      <Route path="/join/:sessionId" element={<JoinSessionPage />} />
      <Route path="/s/:sessionId" element={<SessionPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
