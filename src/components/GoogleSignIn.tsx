import { useEffect, useRef, useState } from 'react';
import { Spinner } from '@/components/ui';

/**
 * Google Identity Services button.
 *
 * The browser receives a signed credential and hands it to the parent, which
 * posts it to the API. No Google access token, client secret or profile data is
 * stored in the browser by this component.
 */

interface GoogleCredentialResponse {
  credential?: string;
  select_by?: string;
}

interface GoogleAccountsId {
  initialize(options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    ux_mode?: 'popup' | 'redirect';
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type?: 'standard' | 'icon';
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
      logo_alignment?: 'left' | 'center';
      width?: number;
    },
  ): void;
  prompt?(momentListener?: (notification: unknown) => void): void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleAccountsId;
      };
    };
  }
}

let loader: Promise<void> | null = null;

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (loader) return loader;

  loader = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-gsi]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google sign-in could not load.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleGsi = 'true';
    script.onload = () => resolve();
    script.onerror = () => {
      loader = null;
      reject(new Error('Google sign-in could not load.'));
    };
    document.head.appendChild(script);
  });

  return loader;
}

function GoogleIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

export function GoogleSignIn({
  clientId,
  disabled = false,
  text = 'continue_with',
  onCredential,
}: {
  clientId: string;
  disabled?: boolean;
  text?: 'signin_with' | 'signup_with' | 'continue_with';
  onCredential: (credential: string) => Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onCredential);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    callbackRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled) return;
        const accounts = window.google?.accounts?.id;
        if (!accounts || !containerRef.current) throw new Error('Google sign-in is unavailable.');
        accounts.initialize({
          client_id: clientId,
          callback: (response) => {
            if (!response.credential) return;
            setBusy(true);
            void callbackRef
              .current(response.credential)
              .catch(() => {})
              .finally(() => setBusy(false));
          },
          auto_select: false,
          cancel_on_tap_outside: true,
          ux_mode: 'popup',
        });
        containerRef.current.replaceChildren();
        const targetWidth = Math.max(240, Math.min(360, containerRef.current.clientWidth || 360));
        accounts.renderButton(containerRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text,
          shape: 'rectangular',
          logo_alignment: 'left',
          width: targetWidth,
        });
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, text]);

  const handleCustomClick = () => {
    if (disabled || busy) return;
    const accounts = window.google?.accounts?.id;
    if (accounts?.prompt) {
      accounts.prompt();
    } else {
      // Re-attempt loading script if previously in error state
      loader = null;
      setStatus('loading');
      loadGoogleScript()
        .then(() => {
          const acc = window.google?.accounts?.id;
          if (acc && containerRef.current) {
            acc.initialize({
              client_id: clientId,
              callback: (response) => {
                if (!response.credential) return;
                setBusy(true);
                void callbackRef
                  .current(response.credential)
                  .catch(() => {})
                  .finally(() => setBusy(false));
              },
              auto_select: false,
              cancel_on_tap_outside: true,
              ux_mode: 'popup',
            });
            containerRef.current.replaceChildren();
            const targetWidth = Math.max(240, Math.min(360, containerRef.current.clientWidth || 360));
            acc.renderButton(containerRef.current, {
              type: 'standard',
              theme: 'outline',
              size: 'large',
              text,
              shape: 'rectangular',
              logo_alignment: 'left',
              width: targetWidth,
            });
            setStatus('ready');
            if (acc.prompt) acc.prompt();
          }
        })
        .catch(() => {
          setStatus('error');
        });
    }
  };

  const buttonLabel =
    text === 'signup_with'
      ? 'Sign up with Google'
      : text === 'signin_with'
      ? 'Sign in with Google'
      : 'Continue with Google';

  return (
    <div className="relative w-full" aria-busy={busy || status === 'loading'}>
      {/* 1. Official Google rendered button container */}
      <div
        ref={containerRef}
        className={`w-full flex items-center justify-center min-h-[44px] transition-opacity duration-200 ${
          status === 'ready' && !busy ? 'block' : 'opacity-0 h-0 overflow-hidden pointer-events-none'
        }`}
      />

      {/* 2. Premium branded button with official 4-color Google Icon if loading, busy or fallback */}
      {status !== 'ready' || busy ? (
        <button
          type="button"
          onClick={handleCustomClick}
          disabled={disabled || busy}
          className="group relative flex h-11 w-full items-center justify-center gap-3 rounded-md border border-[#D5CCC0] bg-[#FAF7F2] px-4 text-[13.5px] font-medium text-ink shadow-2xs transition-all hover:border-[#B8ABA0] hover:bg-white active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? (
            <Spinner className="h-4 w-4 text-forest" />
          ) : (
            <GoogleIcon className="h-5 w-5 shrink-0 transition-transform group-hover:scale-105" />
          )}
          <span>{busy ? 'Connecting with Google…' : status === 'error' ? `${buttonLabel} (Retry)` : buttonLabel}</span>
        </button>
      ) : null}

      {disabled ? <div className="absolute inset-0 cursor-not-allowed" aria-hidden="true" /> : null}
    </div>
  );
}
