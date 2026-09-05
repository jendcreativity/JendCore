import { Link } from 'react-router-dom';
import PrimaryButton from '../components/PrimaryButton';
import { IconLogo, IconVideo } from '../components/Icon';

/**
 * The first screen.
 *
 * Two actions. Nothing else.
 *
 *   [ START SESSION ]   [ JOIN SESSION ]
 *
 * JendCore is not a dashboard. We deliberately keep this screen
 * uncluttered so a first-time user can act immediately.
 */
export default function LandingPage() {
  return (
    <main className="min-h-full flex flex-col items-center justify-center px-4 py-8 sm:px-6 sm:py-12 safe-top safe-bottom">
      <div className="w-full max-w-lg mx-auto text-center">
        {/* Logo */}
        <div className="flex justify-center mb-8 sm:mb-10 text-accent-400">
          <IconLogo size={64} />
        </div>

        {/* Brand name */}
        <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
          JendCore
        </h1>

        {/* Tagline */}
        <p className="mt-6 text-xl sm:text-2xl font-semibold text-accent-400 leading-snug">
          See it. Point to it. Solve it.
        </p>

        {/* Description */}
        <p className="mt-4 text-base sm:text-lg text-ink-200 max-w-md mx-auto leading-relaxed">
          A simple way to show someone exactly what you mean — even when you
          can't be in the same room.
        </p>

        {/* Actions */}
        <div className="mt-12 sm:mt-14 flex flex-col gap-4 sm:gap-3">
          <Link to="/start" className="w-full">
            <PrimaryButton size="lg" fullWidth className="text-lg sm:text-base h-16 sm:h-14">
              <IconVideo size={24} />
              <span className="font-bold">Start a session</span>
            </PrimaryButton>
          </Link>

          <Link to="/join" className="w-full">
            <PrimaryButton size="lg" variant="secondary" fullWidth className="text-lg sm:text-base h-16 sm:h-14">
              <span className="font-semibold">Join a session</span>
            </PrimaryButton>
          </Link>
        </div>

        {/* Footer note */}
        <p className="mt-12 text-xs sm:text-sm text-ink-400">
          No account required. Works on any device.
        </p>
      </div>
    </main>
  );
}
