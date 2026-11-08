import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { SessionUser } from '@shared/types';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { usePageMeta } from '@/lib/usePageMeta';
import {
  type CoreBusinessType,
  type ApplicationResponse,
  type WizardForm,
  emptyForm,
  AGREEMENT_VERSION,
} from './onboarding/OnboardingTypes';
import { SellerWelcomeHero } from './onboarding/SellerWelcomeHero';
import { OnboardingHeader } from './onboarding/OnboardingHeader';
import { Step1Account } from './onboarding/Step1Account';
import { Step2BusinessProfile } from './onboarding/Step2BusinessProfile';
import { Step3ProductsOrigin } from './onboarding/Step3ProductsOrigin';
import { Step4VerificationDocs } from './onboarding/Step4VerificationDocs';
import { StepReviewSubmit } from './onboarding/StepReviewSubmit';
import { ScreenSubmitted } from './onboarding/ScreenSubmitted';
import { SellerStatusDashboard } from './onboarding/SellerStatusDashboard';

/**
 * Normalises form state to backend API schema payload
 */
function toPayload(form: WizardForm) {
  const dispatchAddress = form.dispatchSameAsOperating ? form.address : form.dispatchAddress;
  return {
    fullName: form.fullName.trim(),
    phone: form.phone.trim(),
    businessName: form.businessName.trim(),
    sellerType: form.sellerType,
    sellerCategory: form.sellerCategory || 'artisan_craftsperson',
    tagline: form.tagline.trim(),
    story: form.story.trim(),
    region: form.region.trim() || 'Kangra',
    address: {
      line1: form.address.line1.trim(),
      line2: form.address.line2.trim(),
      city: form.address.city.trim(),
      state: form.address.state.trim() || 'Himachal Pradesh',
      pincode: form.address.pincode.trim(),
    },
    dispatchAddress: {
      line1: dispatchAddress.line1.trim(),
      line2: dispatchAddress.line2.trim(),
      city: dispatchAddress.city.trim(),
      state: dispatchAddress.state.trim() || 'Himachal Pradesh',
      pincode: dispatchAddress.pincode.trim(),
    },
    categorySlugs: form.categorySlugs,
    productGroups: form.productGroups,
    originNarrative: form.originNarrative.trim(),
    authenticityDeclaration: form.authenticityDeclaration,
    categoryAnswers: form.categoryAnswers,
    gstin: form.gstin.trim() || undefined,
    panLast4: form.panLast4.trim() || undefined,
    fssaiNumber: form.fssaiNumber.trim() || undefined,
    udyamNumber: form.udyamNumber.trim() || undefined,
    businessRegistrationNumber: form.businessRegistrationNumber.trim() || undefined,
    shipping: {
      dispatchDays: Number(form.shipping.dispatchDays) || 2,
      packaging: form.shipping.packaging.trim() || 'Recyclable corrugated boxes with paper padding',
      shipsAcrossIndia: form.shipping.shipsAcrossIndia,
      coldChain: form.shipping.coldChain,
      notes: form.shipping.notes.trim() || undefined,
    },
    payout: {
      method: form.payout.method,
      accountHolderName: form.payout.accountHolderName.trim() || undefined,
      accountLast4: form.payout.accountLast4.trim() || undefined,
      ifsc: form.payout.ifsc.trim() || undefined,
      upiIdMasked: form.payout.upiIdMasked.trim() || undefined,
      consent: form.payout.consent,
    },
    agreements: {
      sellerAgreement: form.agreements.sellerAgreement,
      commissionDisclosure: form.agreements.commissionDisclosure,
      authenticityPolicy: form.agreements.authenticityPolicy,
      privacyPolicy: form.agreements.privacyPolicy,
      version: AGREEMENT_VERSION,
    },
    yearsOperating: form.yearsOperating.trim() || undefined,
  };
}

export function BecomeAMakerPage() {
  const { user, refresh: refreshSession } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  usePageMeta({
    title: 'Sell with Dear Hills · Himalayan Artisan & Producer Onboarding',
    description:
      'Join Dear Hills and bring authentic Himalayan handloom, orthodox tea, raw forest honey, orchard harvest and village craft to conscious customers across India.',
  });

  // Business type choice for dynamic adaptation
  const [businessType, setBusinessType] = useState<CoreBusinessType>('maker_artisan');

  // Step wizard: 0 = Welcome Landing, 1 = Account, 2 = Profile, 3 = Products & Origin, 4 = Verification, 5 = Review
  const [step, setStep] = useState<number>(() => {
    const s = searchParams.get('step');
    if (s && !Number.isNaN(Number(s))) {
      return Math.min(Math.max(Number(s), 0), 5);
    }
    return user ? 2 : 0;
  });

  const [form, setForm] = useState<WizardForm>(() => ({
    ...emptyForm,
    fullName: user?.fullName ?? '',
  }));

  const [savingDraft, setSavingDraft] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedData, setSubmittedData] = useState<{ id: string; submittedAt: string } | null>(null);

  // Fetch current application if user is authenticated
  const {
    data: appData,
    refetch: refetchApp,
  } = useQuery<ApplicationResponse>({
    queryKey: ['seller-application'],
    queryFn: () => api<ApplicationResponse>('/seller/application'),
    enabled: Boolean(user),
    staleTime: 10_000,
  });

  // Pre-fill form when user or existing draft data is available
  useEffect(() => {
    if (user && !form.fullName) {
      setForm((prev) => ({
        ...prev,
        fullName: prev.fullName || user.fullName || '',
      }));
    }
  }, [user, form.fullName]);

  useEffect(() => {
    if (appData?.data && typeof appData.data === 'object') {
      const serverData = appData.data as Record<string, any>;
      setForm((prev) => ({
        ...prev,
        fullName: serverData.fullName || prev.fullName || user?.fullName || '',
        phone: serverData.phone || prev.phone || '',
        businessName: serverData.businessName || appData.seller?.businessName || prev.businessName,
        sellerType: serverData.sellerType || prev.sellerType,
        sellerCategory: (serverData.sellerCategory as WizardForm['sellerCategory']) || prev.sellerCategory,
        tagline: serverData.tagline || prev.tagline,
        story: serverData.story || prev.story,
        region: serverData.region || prev.region,
        village: serverData.village || prev.village,
        address: {
          line1: serverData.address?.line1 || prev.address.line1,
          line2: serverData.address?.line2 || prev.address.line2,
          city: serverData.address?.city || prev.address.city,
          state: serverData.address?.state || prev.address.state,
          pincode: serverData.address?.pincode || prev.address.pincode,
        },
        dispatchAddress: {
          line1: serverData.dispatchAddress?.line1 || prev.dispatchAddress.line1,
          line2: serverData.dispatchAddress?.line2 || prev.dispatchAddress.line2,
          city: serverData.dispatchAddress?.city || prev.dispatchAddress.city,
          state: serverData.dispatchAddress?.state || prev.dispatchAddress.state,
          pincode: serverData.dispatchAddress?.pincode || prev.dispatchAddress.pincode,
        },
        dispatchSameAsOperating:
          serverData.dispatchAddress?.line1 === serverData.address?.line1 || prev.dispatchSameAsOperating,
        categorySlugs: serverData.categorySlugs?.length ? serverData.categorySlugs : prev.categorySlugs,
        productGroups: serverData.productGroups?.length ? serverData.productGroups : prev.productGroups,
        originNarrative: serverData.originNarrative || prev.originNarrative,
        authenticityDeclaration: Boolean(serverData.authenticityDeclaration ?? prev.authenticityDeclaration),
        categoryAnswers: serverData.categoryAnswers || prev.categoryAnswers,
        gstin: serverData.gstin || prev.gstin,
        panLast4: serverData.panLast4 || prev.panLast4,
        fssaiNumber: serverData.fssaiNumber || prev.fssaiNumber,
        udyamNumber: serverData.udyamNumber || prev.udyamNumber,
        businessRegistrationNumber: serverData.businessRegistrationNumber || prev.businessRegistrationNumber,
        yearsOperating: serverData.yearsOperating || prev.yearsOperating,
        shipping: {
          dispatchDays: String(serverData.shipping?.dispatchDays ?? prev.shipping.dispatchDays),
          packaging: serverData.shipping?.packaging || prev.shipping.packaging,
          shipsAcrossIndia: Boolean(serverData.shipping?.shipsAcrossIndia ?? prev.shipping.shipsAcrossIndia),
          coldChain: Boolean(serverData.shipping?.coldChain ?? prev.shipping.coldChain),
          notes: serverData.shipping?.notes || prev.shipping.notes,
        },
        payout: {
          method: (serverData.payout?.method as 'bank_transfer' | 'upi') || prev.payout.method,
          accountHolderName: serverData.payout?.accountHolderName || prev.payout.accountHolderName,
          accountLast4: serverData.payout?.accountLast4 || prev.payout.accountLast4,
          ifsc: serverData.payout?.ifsc || prev.payout.ifsc,
          upiIdMasked: serverData.payout?.upiIdMasked || prev.payout.upiIdMasked,
          consent: Boolean(serverData.payout?.consent ?? prev.payout.consent),
        },
        agreements: {
          sellerAgreement: Boolean(serverData.agreements?.sellerAgreement ?? prev.agreements.sellerAgreement),
          commissionDisclosure: Boolean(
            serverData.agreements?.commissionDisclosure ?? prev.agreements.commissionDisclosure,
          ),
          authenticityPolicy: Boolean(
            serverData.agreements?.authenticityPolicy ?? prev.agreements.authenticityPolicy,
          ),
          privacyPolicy: Boolean(serverData.agreements?.privacyPolicy ?? prev.agreements.privacyPolicy),
          version: AGREEMENT_VERSION,
        },
      }));

      // Infer business type from sellerType
      const st = serverData.sellerType;
      if (st === 'farmer') setBusinessType('farmer_producer');
      else if (st === 'brand' || st === 'shop') setBusinessType('local_brand');
      else if (st === 'cooperative' || st === 'home_business') setBusinessType('other_business');
      else setBusinessType('maker_artisan');
    }
  }, [appData, user?.fullName]);

  // Handle URL step sync
  const goToStep = useCallback(
    (newStep: number) => {
      setStep(newStep);
      setSearchParams((params) => {
        const next = new URLSearchParams(params);
        if (newStep === 0) next.delete('step');
        else next.set('step', String(newStep));
        return next;
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [setSearchParams],
  );

  // Auto-save draft on step change if authenticated
  const saveDraft = useCallback(
    async (manual = false) => {
      if (!user) return;
      setSavingDraft(true);
      try {
        await api('/seller/application/draft', {
          method: 'POST',
          body: {
            currentStep: Math.max(step, 1),
            data: toPayload(form),
          },
        });
        const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        setLastSavedTime(now);
        if (manual) toast.push('Application progress saved safely.', 'info');
      } catch (err) {
        if (manual) toast.push(errorMessage(err), 'error');
      } finally {
        setSavingDraft(false);
      }
    },
    [user, step, form, toast],
  );

  // Debounced auto-save on form updates
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!user || step < 2 || step > 5) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveDraft(false);
    }, 2500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [form, user, step, saveDraft]);

  // Partial update helper
  const handleFormUpdates = useCallback((updates: Partial<WizardForm>) => {
    setForm((prev) => ({ ...prev, ...updates }));
  }, []);

  // Submit full application
  const handleSubmitApplication = async (event?: FormEvent) => {
    if (event) event.preventDefault();
    if (submitting) return;

    if (!form.agreements.sellerAgreement || !form.agreements.commissionDisclosure || !form.agreements.authenticityPolicy) {
      toast.push('Please confirm all required declarations and agreements.', 'error');
      return;
    }

    const docs = appData?.documents ?? [];
    const hasGovtId = docs.some((d) => (d.doc_type || d.docType) === 'id_proof');
    if (!hasGovtId) {
      toast.push('Government photo identity is required. Please upload it in Step 4.', 'error');
      goToStep(4);
      return;
    }

    setSubmitting(true);
    try {
      const idempotencyKey = `app_submit_${user?.id}_${Date.now()}`;
      const res = await api<{
        applicationId: string;
        sellerId: string;
        status: string;
        submittedAt: string;
      }>('/seller/application/submit', {
        method: 'POST',
        body: {
          data: toPayload(form),
          idempotencyKey,
        },
      });

      toast.push('Application submitted successfully! Welcome to Dear Hills.', 'info');
      setSubmittedData({
        id: res.applicationId,
        submittedAt: res.submittedAt || new Date().toISOString(),
      });
      await refetchApp();
      await refreshSession();
    } catch (err) {
      toast.push(errorMessage(err), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // If application was just submitted in this session
  if (submittedData) {
    return (
      <ScreenSubmitted
        referenceId={submittedData.id}
        businessName={form.businessName || 'Your Studio'}
        submittedAt={submittedData.submittedAt}
        onTrackStatus={() => {
          setSubmittedData(null);
          void refetchApp();
        }}
      />
    );
  }

  // If application already exists on server and is in review or approved
  const currentApp = appData?.application;
  const applicationStatus = currentApp?.status;
  if (
    user &&
    appData &&
    applicationStatus &&
    ['submitted', 'under_review', 'changes_requested', 'approved', 'rejected'].includes(applicationStatus) &&
    step !== 5 // not explicitly in edit-revision mode
  ) {
    return (
      <SellerStatusDashboard
        data={appData}
        onRevise={() => {
          goToStep(2);
        }}
        onStartNew={() => {
          goToStep(2);
        }}
      />
    );
  }

  // Screen 1: Welcome Hero Landing
  if (step === 0) {
    return (
      <SellerWelcomeHero
        selectedType={businessType}
        onSelectType={(type) => {
          setBusinessType(type);
          if (type === 'farmer_producer') {
            setForm((prev) => ({ ...prev, sellerType: 'farmer', sellerCategory: 'food_producer' }));
          } else if (type === 'local_brand') {
            setForm((prev) => ({ ...prev, sellerType: 'brand', sellerCategory: 'artisan_craftsperson' }));
          } else if (type === 'other_business') {
            setForm((prev) => ({ ...prev, sellerType: 'home_business', sellerCategory: 'home_business' }));
          } else {
            setForm((prev) => ({ ...prev, sellerType: 'artisan', sellerCategory: 'artisan_craftsperson' }));
          }
        }}
        onStart={() => {
          goToStep(user ? 2 : 1);
        }}
        onLogin={() => {
          navigate('/login?next=/become-a-maker?step=2');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-warm-paper">
      {/* Step Progress Top Bar */}
      <OnboardingHeader
        currentStep={step}
        totalSteps={4}
        saving={savingDraft}
        lastSavedAt={lastSavedTime}
        onJumpToStep={(target) => {
          goToStep(target);
        }}
        onExit={() => {
          goToStep(0);
        }}
      />

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Step 1: Create Account / Authenticate */}
        {step === 1 ? (
          <Step1Account
            user={user}
            fullName={form.fullName}
            phone={form.phone}
            onUpdateContact={(name, phone) => {
              setForm((prev) => ({ ...prev, fullName: name, phone }));
            }}
            onSuccess={(_sessionUser: SessionUser) => {
              goToStep(2);
            }}
          />
        ) : null}

        {/* Step 2: Business & Maker Profile */}
        {step === 2 ? (
          <Step2BusinessProfile
            form={form}
            onChange={handleFormUpdates}
            onNext={() => goToStep(3)}
            onBack={() => goToStep(1)}
          />
        ) : null}

        {/* Step 3: Products, Categories & Mountain Origin */}
        {step === 3 ? (
          <Step3ProductsOrigin
            form={form}
            onChange={handleFormUpdates}
            onNext={() => goToStep(4)}
            onBack={() => goToStep(2)}
          />
        ) : null}

        {/* Step 4: Private Identity & Document Verification */}
        {step === 4 ? (
          <Step4VerificationDocs
            documents={appData?.documents ?? []}
            onDocumentsUpdated={() => void refetchApp()}
            onNext={() => goToStep(5)}
            onBack={() => goToStep(3)}
          />
        ) : null}

        {/* Step 5 / Review Screen: Transparent commercial terms & Final Submit */}
        {step === 5 ? (
          <StepReviewSubmit
            form={form}
            documents={appData?.documents ?? []}
            submitting={submitting}
            onJumpToStep={(s) => goToStep(s)}
            onSubmit={(e) => void handleSubmitApplication(e)}
            onBack={() => goToStep(4)}
          />
        ) : null}
      </main>
    </div>
  );
}

export default BecomeAMakerPage;
