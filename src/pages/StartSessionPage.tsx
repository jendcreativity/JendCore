import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PrimaryButton from '../components/PrimaryButton';
import { IconCheck, IconCopy } from '../components/Icon';
import { generateSessionCode } from '../lib/sessionCode';

/**
 * Create a new session.
 *
 * We generate the session code locally so the user gets an instant link
 * without a round-trip. The session is "registered" with the backend
 * when the user actually enters the room (/s/:id). Until then the code
 * is harmless — it just won't resolve.
 *
 * Sharing options are intentionally minimal:
 *   - Copy link button (uses navigator.clipboard)
 *   - Visible code so it can be read aloud
 */
export default function StartSessionPage() {
  const navigate = useNavigate();
  const code = useMemo(() => generateSessionCode(), []);
  const shareUrl = `${window.location.origin}/s/${code}`;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      const input = document.createElement('input');
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
    }
  }

  return (
    <main className="min-h-full flex flex-col items-center justify-center px-4 py-8 sm:px-6 sm:py-12 safe-top safe-bottom">
      <div className="w-full max-w-lg mx-auto">
        <h1 className="text-3xl sm:text-4xl font-bold text-white text-center">
          Session ready
        </h1>
        <p className="mt-4 text-center text-ink-200 leading-relaxed">
          Share this code with the person you want to connect with.
        </p>

        {/* Session code card */}
        <div className="mt-10 rounded-2xl bg-ink-800 border-2 border-accent-500/30 p-8 sm:p-10 text-center">
          <div className="text-xs uppercase tracking-widest text-ink-400 font-semibold">
            Your session code
          </div>
          <div className="mt-4 text-5xl sm:text-6xl font-mono font-extrabold text-accent-400 tracking-widest break-all">
            {code}
          </div>
        </div>

        {/* Or divider */}
        <div className="mt-8 flex items-center gap-4">
          <div className="flex-1 h-px bg-ink-700" />
          <span className="text-xs uppercase text-ink-400 font-semibold">or</span>
          <div className="flex-1 h-px bg-ink-700" />
        </div>

        {/* Actions */}
        <div className="mt-8 flex flex-col gap-3">
          <PrimaryButton onClick={copy} fullWidth size="lg" className="h-14 text-base font-semibold">
            {copied ? <IconCheck size={22} /> : <IconCopy size={22} />}
            {copied ? 'Link copied!' : 'Copy invite link'}
          </PrimaryButton>

          <PrimaryButton 
            onClick={() => navigate(`/s/${code}`)} 
            fullWidth 
            size="lg" 
            className="h-14 text-base font-semibold"
          >
            Enter session now
          </PrimaryButton>

          <Link to="/" className="w-full">
            <PrimaryButton variant="ghost" fullWidth size="lg" className="h-12 text-base">
              Back
            </PrimaryButton>
          </Link>
        </div>
      </div>
    </main>
  );
}
