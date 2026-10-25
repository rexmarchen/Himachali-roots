import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorFields, errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { Alert, Button, Field, Input } from '@/components/ui';

function AuthShell({
  eyebrow,
  title,
  lede,
  children,
  footer,
  image = '/images/auth-orchard.jpg',
  imageAlt = 'Freshly harvested Kinnaur apples and mountain citrus in an alpine orchard',
  imageCredit = 'Himalayan Orchard Harvest · Pahadi Roots',
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

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const next = params.get('next') || '/account';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFields({});
    try {
      await api('/auth/login', { method: 'POST', body: { email, password } });
      await queryClient.invalidateQueries({ queryKey: ['session'] });
      await queryClient.invalidateQueries({ queryKey: ['cart'] });
      toast.push('Signed in.');
      navigate(next.startsWith('/') ? next : '/account', { replace: true });
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
          <Link to={`/register${next !== '/account' ? `?next=${encodeURIComponent(next)}` : ''}`} className="link-underline text-forest">
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
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            invalid={Boolean(fields.password)}
          />
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

      <div className="mt-6 border border-line bg-surface p-4 text-[11px] leading-relaxed text-muted rounded-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-terra">Demonstration & Admin Accounts</p>
        <div className="mt-2.5 flex items-center justify-between border-b border-line pb-2">
          <div>
            <p className="font-semibold text-forest">Administrator</p>
            <p className="text-[11px]"><code>anshuar9065@gmail.com</code> · <code>Anshu90#@</code></p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEmail('anshuar9065@gmail.com');
              setPassword('Anshu90#@');
            }}
            className="text-[10px] font-semibold uppercase tracking-wider text-terra hover:underline"
          >
            Fill Admin
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between pt-1">
          <div>
            <p className="font-semibold text-forest">Demo Maker</p>
            <p className="text-[11px]"><code>kullu@demo.pahadiroots.test</code> · <code>PahadiDemo!2026</code></p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEmail('kullu@demo.pahadiroots.test');
              setPassword('PahadiDemo!2026');
            }}
            className="text-[10px] font-semibold uppercase tracking-wider text-terra hover:underline"
          >
            Fill Maker
          </button>
        </div>
      </div>
    </AuthShell>
  );
}

export function RegisterPage() {
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
  const next = params.get('next') || '/account';

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
        toast.push('Account created. Check your email for a confirmation link.');
        navigate(next.startsWith('/') ? next : '/account', { replace: true });
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
        <Button className="mt-5 w-full" onClick={() => navigate(next.startsWith('/') ? next : '/account')}>
          Continue to your account
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
          <Link to={`/login${next !== '/account' ? `?next=${encodeURIComponent(next)}` : ''}`} className="link-underline text-forest">
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
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await api<{ message: string; devResetUrl?: string }>('/auth/forgot-password', {
        method: 'POST',
        body: { email },
      });
      setMessage(result.message);
      setDevResetUrl(result.devResetUrl ?? null);
    } catch (resetError) {
      setError(errorMessage(resetError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Reset your password"
      lede="Enter the email on your account. If it is registered, a single-use link will be sent. The response is the same either way."
      footer={<Link to="/login" className="link-underline text-forest">Back to sign in</Link>}
    >
      <form onSubmit={submit} className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {message ? <Alert tone="success">{message}</Alert> : null}
        {devResetUrl ? (
          <div className="border border-terra/30 bg-[#fff8f4] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8e4630]">Development reset link</p>
            <a href={devResetUrl} className="mt-2 block break-all text-xs text-[#7d3d28] underline underline-offset-2">
              {devResetUrl}
            </a>
          </div>
        ) : null}
        <Field label="Email address" required>
          <Input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          Send reset link
        </Button>
      </form>
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
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
      await api('/auth/reset-password', { method: 'POST', body: { token, password } });
      setDone(true);
    } catch (resetError) {
      setError(errorMessage(resetError));
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <AuthShell eyebrow="Account recovery" title="That link is incomplete" lede="The reset token is missing from the address.">
        <Alert tone="error">Request a new password reset link to continue.</Alert>
        <Button className="mt-5 w-full" onClick={() => navigate('/forgot-password')}>Request a new link</Button>
      </AuthShell>
    );
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
          <Field label="New password" required>
            <Input type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} />
          </Field>
          <Field label="Repeat new password" required>
            <Input type="password" autoComplete="new-password" required value={confirm} onChange={(event) => setConfirm(event.target.value)} />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={submitting}>Update password</Button>
        </form>
      )}
    </AuthShell>
  );
}

export function VerifyEmailPage() {
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
