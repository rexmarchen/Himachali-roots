import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorFields, errorMessage } from '@/lib/api';
import { usePageMeta } from '@/lib/usePageMeta';
import { useAuth } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { Alert, Button, Field, Input } from '@/components/ui';
import { GoogleSignIn } from '@/components/GoogleSignIn';

function AuthShell({
  eyebrow,
  title,
  lede,
  children,
  footer,
  image = '/images/auth-orchard.jpg',
  imageAlt = 'Freshly harvested Kinnaur apples and mountain citrus in an alpine orchard',
  imageCredit = 'Himalayan Orchard Harvest · DEAR HILLS',
}: {
  eyebrow: string;
  title: string;
  lede: string;
  children: ReactNode;
  footer?: ReactNode;
  image?: string;
  imageAlt?: string;
  imageCredit?: string;
}) {
  return (
    <div className="mx-auto grid min-h-[70vh] max-w-7xl lg:grid-cols-[0.95fr_1.05fr]">
      <div className="flex items-center px-4 py-12 sm:px-8 lg:px-14 lg:py-20">
        <div className="w-full max-w-md">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-3 text-3xl leading-tight sm:text-[2.4rem]">{title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">{lede}</p>
          <div className="mt-8">{children}</div>
          {footer ? <div className="mt-7 border-t border-line pt-5 text-[12.5px] text-muted">{footer}</div> : null}
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-sand/40 lg:block">
        <img src={image} alt={imageAlt} className="h-full w-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-forest/80 to-transparent p-8 pt-24 text-paper">
          <p className="max-w-sm font-serif text-2xl leading-snug">
            “Grown with glacial snowmelt, ripened by the mountain sun, and harvested with care.”
          </p>
          <p className="mt-3 text-[10px] uppercase tracking-[0.16em] text-paper/70">{imageCredit}</p>
        </div>
      </div>
    </div>
  );
}

interface GoogleSignInResult {
  ok: boolean;
  user?: unknown;
  linkingRequired?: boolean;
  linkToken?: string;
  email?: string;
  message?: string;
}

/**
 * Shared Google entry point for sign-in and registration. It keeps the
 * account-linking challenge in the same form so a customer never has to guess
 * why a Google sign-in asked for a password.
 */
function GoogleAuthSection({
  text = 'continue_with',
  onAuthenticated,
  beforeSignIn,
}: {
  text?: 'signin_with' | 'signup_with' | 'continue_with';
  onAuthenticated: () => Promise<void> | void;
  beforeSignIn?: () => string | null;
}) {
  const { config } = useAuth();
  const [linking, setLinking] = useState<{ linkToken: string; email: string } | null>(null);
  const [linkPassword, setLinkPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [linkingBusy, setLinkingBusy] = useState(false);

  const googleClientId = config?.googleClientId ?? '';
  const googleEnabled = Boolean(config?.googleEnabled && googleClientId);

  if (!googleEnabled || !googleClientId) return null;

  const handleCredential = async (credential: string) => {
    setError(null);
    const blocked = beforeSignIn?.() ?? null;
    if (blocked) {
      setError(blocked);
      return;
    }
    try {
      const result = await api<GoogleSignInResult>('/auth/google', { method: 'POST', body: { credential } });
      if (result.linkingRequired && result.linkToken) {
        setLinking({ linkToken: result.linkToken, email: result.email ?? '' });
        return;
      }
      await onAuthenticated();
    } catch (credentialError) {
      setError(errorMessage(credentialError));
    }
  };

  const linkExisting = async (event: FormEvent) => {
    event.preventDefault();
    if (!linking) return;
    setLinkingBusy(true);
    setError(null);
    try {
      await api('/auth/google/link', {
        method: 'POST',
        body: { linkToken: linking.linkToken, password: linkPassword },
      });
      setLinking(null);
      setLinkPassword('');
      await onAuthenticated();
    } catch (linkError) {
      setError(errorMessage(linkError));
    } finally {
      setLinkingBusy(false);
    }
  };

  return (
    <div className="mt-6">
      <div className="mb-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        <span className="text-[10px] uppercase tracking-[0.16em] text-muted">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>
      {error ? (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}
      {linking ? (
        <form onSubmit={linkExisting} className="space-y-3">
          <Alert tone="info" title="Link your existing account">
            An account already uses {linking.email}. Enter that account’s password once to link Google sign-in. Accounts are
            never merged by email automatically.
          </Alert>
          <Field label="Existing account password" required>
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={linkPassword}
              onChange={(event) => setLinkPassword(event.target.value)}
            />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={linkingBusy}>
            Link Google and sign in
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={linkingBusy}
            onClick={() => {
              setLinking(null);
              setLinkPassword('');
              setError(null);
            }}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <GoogleSignIn clientId={googleClientId} text={text} onCredential={handleCredential} />
      )}
    </div>
  );
}

export function LoginPage() {
  usePageMeta({ title: 'Sign in · Dear Hills' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const rawNext = params.get('next');
  const next = rawNext && rawNext.startsWith('/') && rawNext !== '/account' ? rawNext : '/';

  const completeSignIn = async (message = 'Signed in.') => {
    await queryClient.invalidateQueries({ queryKey: ['session'] });
    await queryClient.invalidateQueries({ queryKey: ['cart'] });
    toast.push(message);
    navigate(next, { replace: true });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFields({});
    try {
      await api('/auth/login', { method: 'POST', body: { email, password } });
      await completeSignIn();
    } catch (loginError) {
      setError(errorMessage(loginError));
      setFields(errorFields(loginError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in to your account"
      lede="Your orders, saved items and seller workspace live here. Sessions are held in a secure HTTP-only cookie."
      footer={
        <p>
          New here?{' '}
          <Link to={`/register${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} className="link-underline text-forest">
            Create an account
          </Link>
        </p>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Field label="Email address" required error={fields.email}>
          <Input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            invalid={Boolean(fields.email)}
          />
        </Field>
        <Field label="Password" required error={fields.password}>
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              invalid={Boolean(fields.password)}
              className="pr-14"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-xs font-medium text-muted hover:text-forest select-none"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-[11.5px] text-muted underline underline-offset-4 hover:text-forest">
            Forgot your password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          Sign in
        </Button>
      </form>

      <GoogleAuthSection text="signin_with" onAuthenticated={() => completeSignIn('Signed in with Google.')} />

      <p className="mt-6 text-center text-[11.5px] text-muted">
        New to DEAR HILLS?{' '}
        <Link to="/register" className="text-forest underline underline-offset-4 hover:text-terra">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}

export function RegisterPage() {
  usePageMeta({ title: 'Create your account · Dear Hills' });
  const [form, setForm] = useState({ fullName: '', email: '', password: '' });
  const [consent, setConsent] = useState(false);
  const [terms, setTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [devVerifyUrl, setDevVerifyUrl] = useState<string | null>(null);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const rawNext = params.get('next');
  const next = rawNext && rawNext.startsWith('/') && rawNext !== '/account' ? rawNext : '/';

  const completeRegistration = async (message: string) => {
    await queryClient.invalidateQueries({ queryKey: ['session'] });
    await queryClient.invalidateQueries({ queryKey: ['cart'] });
    toast.push(message);
    navigate(next, { replace: true });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!terms) {
      setError('Please accept the terms to create an account.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setFields({});
    try {
      const result = await api<{ devVerifyUrl?: string | null }>('/auth/register', {
        method: 'POST',
        body: {
          fullName: form.fullName,
          email: form.email,
          password: form.password,
          marketingConsent: consent,
          acceptedTerms: true,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ['session'] });
      await queryClient.invalidateQueries({ queryKey: ['cart'] });
      if (result.devVerifyUrl) {
        setDevVerifyUrl(result.devVerifyUrl);
        toast.push('Account created. Email delivery is not configured, so a development confirmation link is shown below.');
      } else {
        await completeRegistration('Account created. Check your email for a confirmation link.');
      }
    } catch (registerError) {
      setError(errorMessage(registerError));
      setFields(errorFields(registerError));
    } finally {
      setSubmitting(false);
    }
  };

  if (devVerifyUrl) {
    return (
      <AuthShell
        eyebrow="One more step"
        title="Confirm your email"
        lede="The account exists and you are signed in. Confirm the email address to finish setting it up."
      >
        <Alert tone="warning" title="Development helper">
          SMTP is not configured on this deployment. Use this single-use link to confirm the address. This link is only
          returned when ALLOW_DEV_AUTH_HELPERS is enabled outside production.
        </Alert>
        <a
          href={devVerifyUrl}
          className="mt-4 block break-all border border-forest/25 bg-forest/[0.04] p-3 text-xs text-forest underline underline-offset-2"
        >
          {devVerifyUrl}
        </a>
        <Button className="mt-5 w-full" onClick={() => navigate(next)}>
          {next === '/' ? 'Continue to homepage' : 'Continue'}
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Create an account"
      title="Keep your orders in one place"
      lede="An account is required to check out, because every order needs an owner for delivery, cancellations and refunds."
      image="/images/product-shawl.jpg"
      imageAlt="A handwoven patterned textile"
      footer={
        <p>
          Already have an account?{' '}
          <Link to={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} className="link-underline text-forest">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Field label="Full name" required error={fields.fullName}>
          <Input
            autoComplete="name"
            required
            value={form.fullName}
            onChange={(event) => setForm({ ...form, fullName: event.target.value })}
            invalid={Boolean(fields.fullName)}
          />
        </Field>
        <Field label="Email address" required error={fields.email}>
          <Input
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            invalid={Boolean(fields.email)}
          />
        </Field>
        <Field label="Password" required hint="10+ characters, letters and numbers" error={fields.password}>
          <Input
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            invalid={Boolean(fields.password)}
          />
        </Field>
        <label className="flex items-start gap-2.5 text-[12px] leading-relaxed text-muted">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 accent-forest" />
          Send me occasional notes about new makers and seasonal stock. I can unsubscribe at any time.
        </label>
        <label className="flex items-start gap-2.5 text-[12px] leading-relaxed text-muted">
          <input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} className="mt-0.5 accent-forest" />
          <span>
            I accept the draft{' '}
            <Link to="/policies/terms" className="underline underline-offset-2 hover:text-forest">terms</Link> and{' '}
            <Link to="/policies/privacy" className="underline underline-offset-2 hover:text-forest">privacy notice</Link>.
          </span>
        </label>
        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          Create account
        </Button>
      </form>

      <GoogleAuthSection
        text="signup_with"
        onAuthenticated={() => completeRegistration('Account created with Google.')}
        beforeSignIn={() => (terms ? null : 'Please accept the terms and privacy notice before continuing with Google.')}
      />
    </AuthShell>
  );
}

function OtpBoxes({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}) {
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || '');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (index: number, char: string) => {
    const clean = char.replace(/\D/g, '');
    if (!clean) {
      const next = digits.map((d, i) => (i === index ? '' : d)).join('');
      onChange(next);
      return;
    }
    const digit = clean[clean.length - 1];
    const newDigits = [...digits];
    newDigits[index] = digit;
    const nextVal = newDigits.join('');
    onChange(nextVal);
    if (index < 5 && digit) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted) {
      onChange(pasted);
      const targetIndex = Math.min(pasted.length, 5);
      inputRefs.current[targetIndex]?.focus();
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 sm:gap-3" onPaste={handlePaste}>
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            inputRefs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1} of 6`}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className="h-12 w-11 rounded-sm border border-sand bg-surface text-center font-mono text-xl font-bold text-ink transition-colors focus:border-forest focus:outline-none focus:ring-2 focus:ring-forest/10 disabled:bg-paper sm:h-14 sm:w-13"
        />
      ))}
    </div>
  );
}

export function ForgotPasswordPage() {
  usePageMeta({ title: 'Reset your password · Dear Hills' });
  const [step, setStep] = useState<'request' | 'verify' | 'reset' | 'success'>('request');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resetAuth, setResetAuth] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [expirySeconds, setExpirySeconds] = useState(300);
  const navigate = useNavigate();

  // Cooldown countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  // Expiry countdown
  useEffect(() => {
    if (step !== 'verify' || expirySeconds <= 0) return;
    const interval = setInterval(() => {
      setExpirySeconds((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [step, expirySeconds]);

  const handleRequest = async (event: FormEvent) => {
    event.preventDefault();
    if (cooldown > 0) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api<{ message: string; devOtp?: string; devResetUrl?: string }>('/auth/forgot-password', {
        method: 'POST',
        body: { email },
      });
      setMessage(result.message);
      setDevOtp(result.devOtp ?? null);
      setDevResetUrl(result.devResetUrl ?? null);
      setCooldown(60);
      setExpirySeconds(300);
      setStep('verify');
    } catch (resetError) {
      setError(errorMessage(resetError));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api<{ message: string; devOtp?: string; devResetUrl?: string }>('/auth/forgot-password', {
        method: 'POST',
        body: { email },
      });
      setMessage(result.message);
      setDevOtp(result.devOtp ?? null);
      setDevResetUrl(result.devResetUrl ?? null);
      setCooldown(60);
      setExpirySeconds(300);
      setOtp('');
    } catch (resendError) {
      setError(errorMessage(resendError));
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (event: FormEvent) => {
    event.preventDefault();
    if (otp.length !== 6) {
      setError('Please enter all 6 digits of your verification code.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await api<{ ok: boolean; resetAuthorization: string; message: string }>('/auth/verify-reset-otp', {
        method: 'POST',
        body: { email, otp },
      });
      setResetAuth(result.resetAuthorization);
      setError(null);
      setMessage(null);
      setStep('reset');
    } catch (verifyError) {
      setError(errorMessage(verifyError));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api('/auth/reset-password', {
        method: 'POST',
        body: {
          resetAuthorization: resetAuth,
          password,
          confirmPassword: confirm,
        },
      });
      setStep('success');
    } catch (pwdError) {
      setError(errorMessage(pwdError));
    } finally {
      setSubmitting(false);
    }
  };

  const formatExpiry = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (step === 'success') {
    return (
      <AuthShell
        eyebrow="Account recovery"
        title="Password updated"
        lede="Your password has been changed successfully. All other active sessions were signed out for security."
      >
        <div className="space-y-4">
          <Alert tone="success">
            You can now sign in using your new password or your linked Google account.
          </Alert>
          <Button size="lg" className="w-full" onClick={() => navigate('/login')}>
            Sign in to your account
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (step === 'reset') {
    return (
      <AuthShell
        eyebrow="Account recovery"
        title="Create a new password"
        lede="Use at least 10 characters, including letters and numbers."
        footer={<Link to="/login" className="link-underline text-forest">Back to sign in</Link>}
      >
        <form onSubmit={handleReset} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Field label="New password" required hint="10+ characters, letters and numbers">
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={10}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="pr-14"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-xs font-medium text-muted hover:text-forest select-none"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </Field>
          <Field label="Repeat new password" required>
            <div className="relative">
              <Input
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className="pr-14"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-xs font-medium text-muted hover:text-forest select-none"
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
              >
                {showConfirm ? 'Hide' : 'Show'}
              </button>
            </div>
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={submitting}>
            Update password
          </Button>
        </form>
      </AuthShell>
    );
  }

  if (step === 'verify') {
    return (
      <AuthShell
        eyebrow="Security verification"
        title="Enter verification code"
        lede={`We sent a 6-digit verification code to ${email}. Check your inbox and spam folder.`}
        footer={
          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => {
                setStep('request');
                setOtp('');
                setError(null);
              }}
              className="text-forest underline underline-offset-4 hover:text-terra"
            >
              Change email address
            </button>
            <Link to="/login" className="link-underline text-forest">
              Back to sign in
            </Link>
          </div>
        }
      >
        <form onSubmit={handleVerify} className="space-y-5">
          {error ? <Alert tone="error">{error}</Alert> : null}
          {message ? <Alert tone="info">{message}</Alert> : null}

          {devOtp ? (
            <div className="border border-terra/30 bg-[#fff8f4] p-3 text-xs">
              <p className="font-semibold uppercase tracking-wider text-[#8e4630]">Development verification code</p>
              <p className="mt-1 font-mono text-base font-bold text-[#7d3d28]">{devOtp}</p>
            </div>
          ) : null}
          {devResetUrl ? (
            <div className="border border-terra/30 bg-[#fff8f4] p-3 text-xs">
              <p className="font-semibold uppercase tracking-wider text-[#8e4630]">Development reset link</p>
              <a href={devResetUrl} className="mt-1 block break-all text-xs text-[#7d3d28] underline underline-offset-2">
                {devResetUrl}
              </a>
            </div>
          ) : null}

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-muted mb-2">
              6-digit verification code
            </label>
            <OtpBoxes value={otp} onChange={setOtp} disabled={submitting} />
            <div className="mt-2 flex items-center justify-between text-xs text-muted">
              <span>
                {expirySeconds > 0 ? (
                  <>Expires in <strong className="font-mono text-forest">{formatExpiry(expirySeconds)}</strong></>
                ) : (
                  <span className="text-terra">Code expired. Please request a new code.</span>
                )}
              </span>
              <span>Max 5 attempts</span>
            </div>
          </div>

          <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={otp.length !== 6 || expirySeconds <= 0}>
            Verify and continue
          </Button>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0 || submitting}
              className="text-xs font-medium text-forest hover:text-terra disabled:cursor-not-allowed disabled:text-muted"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : "Didn't receive a code? Resend"}
            </button>
          </div>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Reset your password"
      lede="Enter the email address on your account. If it is registered, a 6-digit verification code will be sent."
      footer={<Link to="/login" className="link-underline text-forest">Back to sign in</Link>}
    >
      <form onSubmit={handleRequest} className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {message ? <Alert tone="success">{message}</Alert> : null}
        <Field label="Email address" required>
          <Input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          Send verification code
        </Button>
      </form>
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  usePageMeta({ title: 'Choose a new password · Dear Hills' });
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api('/auth/reset-password', {
        method: 'POST',
        body: { token, password, confirmPassword: confirm },
      });
      setDone(true);
    } catch (resetError) {
      setError(errorMessage(resetError));
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return <ForgotPasswordPage />;
  }

  return (
    <AuthShell
      eyebrow="Account recovery"
      title={done ? 'Password updated' : 'Choose a new password'}
      lede={done ? 'All other sessions were signed out. Sign in with the new password.' : 'Use at least 10 characters, including a letter and a number.'}
    >
      {done ? (
        <Button className="w-full" size="lg" onClick={() => navigate('/login')}>Sign in</Button>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Field label="New password" required hint="10+ characters, letters and numbers">
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={10}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="pr-14"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-xs font-medium text-muted hover:text-forest select-none"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </Field>
          <Field label="Repeat new password" required>
            <div className="relative">
              <Input
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className="pr-14"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-xs font-medium text-muted hover:text-forest select-none"
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
              >
                {showConfirm ? 'Hide' : 'Show'}
              </button>
            </div>
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={submitting}>Update password</Button>
        </form>
      )}
    </AuthShell>
  );
}

export function VerifyEmailPage() {
  usePageMeta({ title: 'Confirm your email · Dear Hills' });
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'working' | 'done' | 'error'>(token ? 'working' : 'error');
  const [message, setMessage] = useState(token ? '' : 'The confirmation token is missing from the address.');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api('/auth/verify-email', { method: 'POST', body: { token } })
      .then(async () => {
        if (cancelled) return;
        setState('done');
        await queryClient.invalidateQueries({ queryKey: ['session'] });
      })
      .catch((error) => {
        if (cancelled) return;
        setState('error');
        setMessage(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [token, queryClient]);

  return (
    <AuthShell
      eyebrow="Email confirmation"
      title={state === 'done' ? 'Email confirmed' : state === 'error' ? 'That link did not work' : 'Confirming your email…'}
      lede={state === 'done' ? 'Your account is now fully set up.' : 'Confirmation links expire after 24 hours and can be used once.'}
    >
      {state === 'working' ? <p className="text-sm text-muted">Checking the token with the server…</p> : null}
      {state === 'done' ? (
        <Link to="/account" className="inline-flex h-11 items-center justify-center border border-forest bg-forest px-5 text-sm text-paper">
          Go to your account
        </Link>
      ) : null}
      {state === 'error' ? (
        <>
          <Alert tone="error">{message}</Alert>
          <Button className="mt-4 w-full" onClick={() => navigate('/account')}>Go to account settings</Button>
        </>
      ) : null}
    </AuthShell>
  );
}
