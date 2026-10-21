import { useNavigate } from 'react-router-dom';
import PrimaryButton from '../components/PrimaryButton';
import { IconAlert } from '../components/Icon';

/**
 * 404 — kept friendly but minimal.
 */
export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <main className="min-h-full flex flex-col items-center justify-center px-6 py-12">
      <div className="text-ink-400 mb-4">
        <IconAlert size={48} />
      </div>
      <h1 className="text-2xl font-bold text-white">Page not found</h1>
      <p className="mt-2 text-ink-300 text-center max-w-sm">
        The page you’re looking for doesn’t exist or the session has ended.
      </p>
      <PrimaryButton className="mt-8" onClick={() => navigate('/')}>
        Back to JendCore
      </PrimaryButton>
    </main>
  );
}
