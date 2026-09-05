import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PrimaryButton from '../components/PrimaryButton';
import {
  isValidSessionCode,
  normaliseSessionCode,
} from '../lib/sessionCode';

/**
 * Join a session by entering its code.
 *
 * If the user arrived here via /join/:sessionId (deep link), we
 * pre-fill the field and submit immediately for a one-tap experience.
 */
export default function JoinSessionPage() {
  const navigate = useNavigate();
  const params = useParams<{ sessionId?: string }>();
  const [value, setValue] = useState(() =>
    params.sessionId ? normaliseSessionCode(params.sessionId) : '',
  );
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const code = normaliseSessionCode(value);
    if (!isValidSessionCode(code)) {
      setError('That doesn’t look like a valid session code.');
      return;
    }
    setError(null);
    navigate(`/s/${code}`);
  }

  return (
    <main className="min-h-full flex flex-col items-center justify-center px-6 py-12 safe-top safe-bottom">
      <form
        onSubmit={submit}
        className="w-full max-w-md mx-auto"
        aria-label="Join a session"
      >
        <h1 className="text-3xl sm:text-4xl font-bold text-white text-center">
          Join a session
        </h1>
        <p className="mt-4 text-center text-ink-200 leading-relaxed">
          Enter the code the other person shared with you.
        </p>

        <label
          htmlFor="session-code"
          className="block mt-10 text-sm font-semibold text-ink-100"
        >
          Session code
        </label>
        <input
          id="session-code"
          type="text"
          autoFocus
          autoComplete="off"
          inputMode="text"
          spellCheck={false}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          placeholder="JC-XXXX-XXXX"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'session-code-error' : undefined}
          className="mt-3 w-full h-16 rounded-xl bg-ink-800 border-2 border-ink-700 px-5 text-2xl font-mono tracking-widest text-white placeholder:text-ink-500 focus:outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 uppercase transition-colors"
        />

        {error && (
          <p
            id="session-code-error"
            role="alert"
            className="mt-3 text-sm font-medium text-red-400"
          >
            {error}
          </p>
        )}

        <div className="mt-10 flex flex-col gap-3">
          <PrimaryButton 
            type="submit" 
            size="lg" 
            fullWidth 
            className="h-14 text-base font-semibold"
          >
            Join session
          </PrimaryButton>

          <Link to="/" className="w-full">
            <PrimaryButton variant="ghost" fullWidth size="lg" className="h-12 text-base">
              Back
            </PrimaryButton>
          </Link>
        </div>
      </form>
    </main>
  );
}
