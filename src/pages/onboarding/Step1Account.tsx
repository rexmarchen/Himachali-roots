import { useState, type FormEvent } from 'react';
import type { SessionUser } from '@shared/types';
import { api, errorMessage } from '@/lib/api';
import { Alert, Button, Field, Input } from '@/components/ui';

interface Props {
  user: SessionUser | null;
  onSuccess: (user: SessionUser) => void;
  onSwitchAccount?: () => void;
  fullName: string;
  phone: string;
  onUpdateContact: (name: string, phone: string) => void;
}

export function Step1Account({ user, onSuccess, onSwitchAccount, fullName, phone, onUpdateContact }: Props) {
  const [tab, setTab] = useState<'register' | 'login'>('register');

  // Register state
  const [name, setName] = useState(fullName || user?.fullName || '');
  const [regPhone, setRegPhone] = useState(phone || '');
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Status
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (name.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }
    const cleanPhone = regPhone.trim().replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      setError('Please enter a valid 10-digit Indian mobile number.');
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 10) {
      setError('Password must be at least 10 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!agreedTerms) {
      setError('You must agree to the Terms of Service and Privacy Policy to continue.');
      return;
    }

    setBusy(true);
    try {
      const res = await api<{ user: SessionUser }>('/auth/register', {
        method: 'POST',
        body: {
          fullName: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          acceptedTerms: true,
        },
      });
      onUpdateContact(name.trim(), cleanPhone);
      onSuccess(res.user);
    } catch (err: unknown) {
      const msg = errorMessage(err);
      if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('exists')) {
        setError('This email is already registered. Please sign in below.');
        setLoginEmail(email.trim().toLowerCase());
        setTab('login');
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!loginEmail.trim()) {
      setError('Please enter your registered email address.');
      return;
    }
    if (!loginPassword) {
      setError('Please enter your password.');
      return;
    }

    setBusy(true);
    try {
      const res = await api<{ user: SessionUser }>('/auth/login', {
        method: 'POST',
        body: {
          email: loginEmail.trim().toLowerCase(),
          password: loginPassword,
        },
      });
      if (fullName) onUpdateContact(fullName, phone);
      onSuccess(res.user);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // If already logged in, show authenticated state
  if (user) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-terra">Step 1 of 4 · Identity</p>
          <h2 className="mt-1 font-serif text-3xl text-forest">Account Confirmed</h2>
          <p className="mt-2 text-sm text-muted">
            Your maker application is tied to your verified Dear Hills account.
          </p>
        </div>

        <div className="rounded-sm border border-line bg-surface p-6 shadow-xs">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-forest text-lg font-bold text-paper">
              {user.fullName ? user.fullName[0].toUpperCase() : 'M'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-base font-semibold text-forest">{user.fullName || 'Dear Hills Maker'}</p>
                <span className="rounded-full bg-forest/10 px-2 py-0.5 text-[10px] font-medium text-forest">
                  Active Account
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted">{user.email}</p>
              {phone ? <p className="mt-0.5 text-xs text-muted">+91 {phone}</p> : null}
            </div>
          </div>

          <div className="mt-6 border-t border-line pt-4">
            <Field label="Contact Mobile Number" required hint="Used for urgent courier & order updates">
              <Input
                type="tel"
                value={phone}
                maxLength={10}
                placeholder="10-digit mobile number"
                onChange={(e) => onUpdateContact(user.fullName || fullName, e.target.value.replace(/\D/g, ''))}
              />
            </Field>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          {onSwitchAccount ? (
            <button
              type="button"
              onClick={onSwitchAccount}
              className="text-xs text-muted hover:text-forest underline underline-offset-2"
            >
              Sign in with a different account
            </button>
          ) : (
            <div />
          )}

          <Button
            type="button"
            size="lg"
            onClick={() => {
              if (phone.trim().length !== 10) {
                setError('Please provide a valid 10-digit contact mobile number.');
                return;
              }
              onSuccess(user);
            }}
          >
            Continue to Business Profile &rarr;
          </Button>
        </div>

        {error ? <Alert tone="warning">{error}</Alert> : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-terra">Step 1 of 4 · Account</p>
        <h2 className="mt-1 font-serif text-3xl text-forest">Create Your Maker Account</h2>
        <p className="mt-2 text-sm text-muted">
          First-time seller? Set up your free login. Your application progress will be saved automatically as you go.
        </p>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-line">
        <button
          type="button"
          onClick={() => {
            setTab('register');
            setError(null);
          }}
          className={`flex-1 py-3 text-center text-xs font-semibold uppercase tracking-wider transition-all border-b-2 ${
            tab === 'register'
              ? 'border-terra text-terra'
              : 'border-transparent text-muted hover:text-forest'
          }`}
        >
          Create New Account
        </button>
        <button
          type="button"
          onClick={() => {
            setTab('login');
            setError(null);
          }}
          className={`flex-1 py-3 text-center text-xs font-semibold uppercase tracking-wider transition-all border-b-2 ${
            tab === 'login'
              ? 'border-terra text-terra'
              : 'border-transparent text-muted hover:text-forest'
          }`}
        >
          I Already Have an Account
        </button>
      </div>

      {error ? <Alert tone="warning">{error}</Alert> : null}

      {tab === 'register' ? (
        <form onSubmit={handleRegister} className="rounded-sm border border-line bg-surface p-6 shadow-xs space-y-4">
          <Field label="Full Name" required hint="Your real first and last name">
            <Input
              required
              value={name}
              placeholder="e.g. Shrayas Thakur"
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <Field label="Mobile Number" required hint="10-digit number for SMS notifications and logistics">
            <div className="flex items-center">
              <span className="inline-flex h-11 items-center rounded-l-sm border border-r-0 border-line bg-warm-paper/50 px-3 text-xs font-semibold text-forest">
                +91
              </span>
              <Input
                required
                type="tel"
                maxLength={10}
                value={regPhone}
                placeholder="9816000000"
                className="rounded-l-none"
                onChange={(e) => setRegPhone(e.target.value.replace(/\D/g, ''))}
              />
            </div>
          </Field>

          <Field label="Email Address" required hint="We send verification and review updates here">
            <Input
              required
              type="email"
              value={email}
              placeholder="maker@example.com"
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          <Field label="Password" required hint="At least 10 characters, including a letter and a number">
            <div className="relative">
              <Input
                required
                type={showPassword ? 'text' : 'password'}
                value={password}
                placeholder="Choose a secure password"
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted hover:text-forest"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </Field>

          <Field label="Confirm Password" required>
            <Input
              required
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              placeholder="Re-type your password"
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </Field>

          <label className="flex items-start gap-2.5 pt-2 text-xs text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={agreedTerms}
              onChange={(e) => setAgreedTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded-xs border-line text-forest focus:ring-terra"
            />
            <span>
              I agree to the Dear Hills{' '}
              <a href="/policies/terms" target="_blank" className="text-forest underline">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="/policies/privacy" target="_blank" className="text-forest underline">
                Privacy Policy
              </a>
              .
            </span>
          </label>

          <div className="pt-2">
            <Button type="submit" size="lg" loading={busy} className="w-full">
              Create Account & Continue &rarr;
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleLogin} className="rounded-sm border border-line bg-surface p-6 shadow-xs space-y-4">
          <Field label="Registered Email Address" required>
            <Input
              required
              type="email"
              value={loginEmail}
              placeholder="maker@example.com"
              onChange={(e) => setLoginEmail(e.target.value)}
            />
          </Field>

          <Field label="Password" required>
            <div className="relative">
              <Input
                required
                type={showLoginPassword ? 'text' : 'password'}
                value={loginPassword}
                placeholder="Enter your account password"
                onChange={(e) => setLoginPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowLoginPassword(!showLoginPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted hover:text-forest"
              >
                {showLoginPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </Field>

          <div className="pt-2">
            <Button type="submit" size="lg" loading={busy} className="w-full">
              Sign In & Resume Application &rarr;
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
