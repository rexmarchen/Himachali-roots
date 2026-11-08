interface Props {
  currentStep: number;
  totalSteps?: number;
  saving?: boolean;
  lastSavedAt?: string | null;
  onExit?: () => void;
  onJumpToStep?: (step: number) => void;
  completedSteps?: number[];
  isReviewMode?: boolean;
}

export function OnboardingHeader({
  currentStep,
  totalSteps = 4,
  saving,
  lastSavedAt,
  onExit,
  onJumpToStep,
  completedSteps = [],
  isReviewMode = false,
}: Props) {
  const steps = [
    { number: 1, title: 'Account', subtitle: 'Identity & email' },
    { number: 2, title: 'Business', subtitle: 'Store profile' },
    { number: 3, title: 'Products', subtitle: 'Category & origin' },
    { number: 4, title: 'Verification', subtitle: 'Private evidence' },
  ];

  const percent = isReviewMode
    ? 100
    : Math.min(100, Math.round(((currentStep - 1) / totalSteps) * 100));

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Brand & Exit action */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onExit}
              className="flex items-center gap-2 text-xs font-medium text-muted transition-colors hover:text-forest"
              title="Save & return to welcome"
            >
              <span>&larr;</span>
              <span className="hidden sm:inline">Back to Overview</span>
              <span className="sm:hidden">Exit</span>
            </button>
            <div className="h-4 w-px bg-line" aria-hidden />
            <span className="font-serif text-lg font-bold tracking-wider text-forest">DEAR HILLS</span>
            <span className="hidden rounded-full bg-sand/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted sm:inline-block">
              Maker Onboarding
            </span>
          </div>

          {/* Save Status & Help */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5 text-muted" aria-live="polite">
              {saving ? (
                <>
                  <span className="inline-block h-2 w-2 animate-ping rounded-full bg-terra" />
                  <span className="text-terra">Saving draft…</span>
                </>
              ) : lastSavedAt ? (
                <>
                  <span className="text-forest">✓</span>
                  <span className="hidden sm:inline">Draft saved</span>
                </>
              ) : null}
            </div>
            <a
              href="mailto:makers@dearhills.in"
              className="text-xs text-muted hover:text-forest underline underline-offset-2"
            >
              Need help?
            </a>
          </div>
        </div>

        {/* Step Navigation Bar */}
        <div className="mt-3 hidden sm:grid sm:grid-cols-4 sm:gap-2 border-t border-line/60 pt-2.5">
          {steps.map((s) => {
            const isCurrent = !isReviewMode && currentStep === s.number;
            const isCompleted = completedSteps.includes(s.number) || (isReviewMode && s.number <= totalSteps);
            const canClick = isCompleted || s.number <= currentStep;

            return (
              <button
                key={s.number}
                type="button"
                disabled={!canClick || !onJumpToStep}
                onClick={() => onJumpToStep?.(s.number)}
                className={`group flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left transition-all ${
                  isCurrent
                    ? 'bg-forest/[0.05] font-semibold text-forest'
                    : canClick
                      ? 'text-muted hover:text-forest'
                      : 'cursor-not-allowed opacity-40 text-muted'
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    isCurrent
                      ? 'bg-forest text-paper'
                      : isCompleted
                        ? 'bg-terra text-paper'
                        : 'border border-line bg-surface text-muted'
                  }`}
                >
                  {isCompleted && !isCurrent ? '✓' : s.number}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs">
                    {s.title}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Thin Smooth Progress Bar */}
      <div className="h-1 w-full bg-sand/30">
        <div
          className="h-full bg-forest transition-all duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </header>
  );
}
