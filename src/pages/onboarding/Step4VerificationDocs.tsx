import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import type { ApplicationDocument } from './OnboardingTypes';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Alert, Button, Modal } from '@/components/ui';

interface Props {
  documents: ApplicationDocument[];
  onDocumentsUpdated: () => void;
  onNext: () => void;
  onBack: () => void;
}

interface DocumentSlot {
  type: string;
  title: string;
  description: string;
  required: boolean;
  example: string;
}

export function Step4VerificationDocs({ documents, onDocumentsUpdated, onNext, onBack }: Props) {
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<{ type: string; message: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<ApplicationDocument | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Hidden file input
  const fileInputRef = useRef<HTMLInputElement>(null);
  const targetDocTypeRef = useRef<string>('id_proof');

  // Drag over state tracking
  const [dragOverType, setDragOverType] = useState<string | null>(null);

  const documentSlots: DocumentSlot[] = [
    {
      type: 'id_proof',
      title: 'Government Photo Identity',
      description: 'Official government photo identification of the seller or primary artisan.',
      required: true,
      example: 'Aadhaar Card, Voter ID, Passport, or Driving Licence (PDF or Photo)',
    },
    {
      type: 'address_proof',
      title: 'Address Proof',
      description: 'Evidence proving your Himachal workshop, orchard, or residential address.',
      required: false,
      example: 'Electricity bill, Gram Panchayat certificate, or bank passbook',
    },
    {
      type: 'business_registration',
      title: 'Business Registration / Udyam',
      description: 'Formal business or MSME registration, if your venture is registered.',
      required: false,
      example: 'Udyam Certificate, Shop & Establishment licence, or firm registration',
    },
    {
      type: 'fssai',
      title: 'FSSAI Food Registration / Licence',
      description: 'Mandatory for food, wild honey, pickle, and beverage producers selling edible items.',
      required: false,
      example: '14-digit FSSAI basic registration or state licence',
    },
    {
      type: 'gst_certificate',
      title: 'GST Registration Certificate',
      description: 'Optional. Only required if your business turnover or model is GST-registered.',
      required: false,
      example: 'GSTIN Registration Certificate Form GST REG-06',
    },
    {
      type: 'other',
      title: 'Other Supporting Evidence',
      description: 'Optional evidence demonstrating authentic craftsmanship or traditional lineage.',
      required: false,
      example: 'State award certificate, artisan card, loom photos, or land record',
    },
  ];

  const getDocForType = (type: string) => {
    return documents.find(
      (d) => (d.docType === type || d.doc_type === type) && d.status !== 'rejected',
    );
  };

  const uploadFile = async (file: File, docType: string) => {
    setUploadError(null);
    setValidationError(null);

    // Validate size (5 MB max)
    if (file.size > 5 * 1024 * 1024) {
      setUploadError({
        type: docType,
        message: `File is too large (${Math.round(file.size / (1024 * 1024))} MB). Maximum allowed size is 5 MB.`,
      });
      return;
    }

    // Validate format
    const validExtensions = /\.(pdf|jpg|jpeg|png|webp)$/i;
    const validMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!validExtensions.test(file.name) && !validMimes.includes(file.type)) {
      setUploadError({
        type: docType,
        message: 'Invalid file format. Please upload a PDF, JPG, PNG, or WebP document.',
      });
      return;
    }

    setUploadingType(docType);
    try {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('docType', docType);

      await api('/seller/documents', {
        method: 'POST',
        body: formData,
      });

      onDocumentsUpdated();
    } catch (err: unknown) {
      setUploadError({
        type: docType,
        message: errorMessage(err) || 'Failed to upload document. Please try again.',
      });
    } finally {
      setUploadingType(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void uploadFile(file, targetDocTypeRef.current);
    }
  };

  const triggerUpload = (docType: string) => {
    targetDocTypeRef.current = docType;
    setUploadError(null);
    fileInputRef.current?.click();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>, docType: string) => {
    e.preventDefault();
    setDragOverType(null);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void uploadFile(file, docType);
    }
  };

  const handleDelete = async (docId: string) => {
    setDeletingId(docId);
    setUploadError(null);
    try {
      await api(`/seller/documents/${docId}`, { method: 'DELETE' });
      onDocumentsUpdated();
    } catch (err: unknown) {
      setValidationError(errorMessage(err) || 'Failed to remove document.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleContinue = () => {
    setValidationError(null);
    const hasId = Boolean(getDocForType('id_proof'));
    if (!hasId) {
      setValidationError('Government photo identity is required before submitting your maker application.');
      return;
    }
    onNext();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-7">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-terra">Step 4 of 4 · Verification</p>
        <h2 className="mt-1 font-serif text-3xl text-forest">Private Verification Documents</h2>
        <p className="mt-2 text-sm text-muted">
          To maintain trust across Dear Hills, all sellers submit identity verification.
          Files are stored outside the public web root and served only through authorized review endpoints.
        </p>
      </div>

      {/* Trust & Privacy Notice */}
      <div className="rounded-sm border border-line bg-surface p-4 shadow-xs">
        <div className="flex items-start gap-3">
          <span className="text-xl">🔒</span>
          <div className="text-xs text-muted leading-relaxed">
            <p className="font-semibold text-forest">Privacy & Encryption Guarantee</p>
            <p className="mt-0.5">
              Your documents are kept strictly confidential. They are never published, shared with buyers, or accessible
              publicly. Only authorized compliance reviewers inspect them to verify authentic mountain origin.
            </p>
            <p className="mt-1 font-medium text-forest/80">
              Accepted formats: PDF, JPEG, PNG, WEBP · Maximum 5 MB per document
            </p>
          </div>
        </div>
      </div>

      {validationError ? <Alert tone="warning">{validationError}</Alert> : null}

      {/* Hidden File Picker Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Document Slots */}
      <div className="space-y-4">
        {documentSlots.map((slot) => {
          const doc = getDocForType(slot.type);
          const isUploading = uploadingType === slot.type;
          const isDeleting = deletingId === doc?.id;
          const isDragOver = dragOverType === slot.type;
          const slotError = uploadError?.type === slot.type ? uploadError.message : null;

          const fileName = doc?.original_name ?? doc?.originalName ?? 'Uploaded document';
          const sizeKb = doc?.size_bytes ?? doc?.sizeBytes ?? 0;
          const uploadedDate = doc?.uploaded_at ?? doc?.uploadedAt;

          return (
            <div
              key={slot.type}
              className={`rounded-sm border p-5 transition-all ${
                doc
                  ? 'border-forest/20 bg-surface shadow-xs'
                  : slot.required
                    ? 'border-line bg-surface hover:border-forest/40'
                    : 'border-line/70 bg-warm-paper/30 hover:border-line'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-forest">{slot.title}</p>
                    {slot.required ? (
                      <span className="rounded-full bg-terra/10 px-2 py-0.5 text-[10px] font-semibold text-terra uppercase tracking-wider">
                        Required *
                      </span>
                    ) : (
                      <span className="rounded-full bg-sand/30 px-2 py-0.5 text-[10px] font-medium text-muted uppercase tracking-wider">
                        Optional
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted">{slot.description}</p>
                  <p className="mt-0.5 text-[11px] text-muted/80 italic">Examples: {slot.example}</p>
                </div>

                {/* Upload Status Badge / Action */}
                <div className="shrink-0 flex items-center gap-2">
                  {doc ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
                      <span>✓</span> Uploaded
                    </span>
                  ) : (
                    <span className="text-xs text-muted">Not uploaded</span>
                  )}
                </div>
              </div>

              {/* Slot Error */}
              {slotError ? (
                <div className="mt-3">
                  <Alert tone="warning">{slotError}</Alert>
                </div>
              ) : null}

              {/* Uploaded File Row OR Upload Dropzone */}
              <div className="mt-4">
                {doc ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-line bg-warm-paper/50 p-3 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-base text-forest">📄</span>
                      <div className="truncate">
                        <p className="font-semibold text-forest truncate">{fileName}</p>
                        <p className="text-[11px] text-muted">
                          {sizeKb > 0 ? `${Math.round(sizeKb / 1024)} KB` : ''}
                          {uploadedDate ? ` · Uploaded ${formatDate(uploadedDate)}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setPreviewDoc(doc)}
                      >
                        Preview
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => triggerUpload(slot.type)}
                        disabled={isUploading}
                      >
                        Replace
                      </Button>
                      <button
                        type="button"
                        onClick={() => handleDelete(doc.id)}
                        disabled={isDeleting}
                        className="text-xs text-red-700 hover:text-red-900 underline underline-offset-2 px-1"
                      >
                        {isDeleting ? 'Removing…' : 'Remove'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverType(slot.type);
                    }}
                    onDragLeave={() => setDragOverType(null)}
                    onDrop={(e) => handleDrop(e, slot.type)}
                    className={`flex flex-col items-center justify-center rounded-sm border-2 border-dashed p-6 text-center transition-all ${
                      isDragOver
                        ? 'border-terra bg-terra/[0.04]'
                        : 'border-line hover:border-forest/40 bg-surface'
                    }`}
                  >
                    {isUploading ? (
                      <div className="space-y-2">
                        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-forest border-t-transparent" />
                        <p className="text-xs font-semibold text-forest">Uploading document safely…</p>
                        <p className="text-[11px] text-muted">Checking file signature & saving to private vault</p>
                      </div>
                    ) : (
                      <>
                        <span className="text-2xl text-muted">☁️</span>
                        <p className="mt-1 text-xs font-medium text-forest">
                          Drag and drop file here, or{' '}
                          <button
                            type="button"
                            onClick={() => triggerUpload(slot.type)}
                            className="text-terra font-semibold underline underline-offset-2 hover:text-forest"
                          >
                            Browse files / Take photo
                          </button>
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted">PDF, JPEG, PNG, or WEBP (Max 5 MB)</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Navigation Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-line">
        <Button type="button" variant="secondary" onClick={onBack}>
          &larr; Back to Products
        </Button>
        <Button type="button" size="lg" onClick={handleContinue}>
          Review Application &rarr;
        </Button>
      </div>

      {/* Preview Modal */}
      <Modal
        open={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
        title={previewDoc?.original_name ?? previewDoc?.originalName ?? 'Document Preview'}
        wide
        footer={
          <div className="flex w-full items-center justify-between">
            <span className="text-xs text-muted">
              {previewDoc ? formatDate(previewDoc.uploaded_at ?? previewDoc.uploadedAt) : ''}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setPreviewDoc(null)}>
              Close
            </Button>
          </div>
        }
      >
        {previewDoc ? (
          <div className="flex min-h-[350px] items-center justify-center rounded bg-warm-paper/30 p-2">
            {(previewDoc.mime_type ?? previewDoc.mimeType)?.startsWith('image/') ||
            /\.(jpg|jpeg|png|webp)$/i.test(previewDoc.original_name ?? previewDoc.originalName ?? '') ? (
              <img
                src={`/api/seller/documents/${previewDoc.id}/file`}
                alt={previewDoc.original_name ?? previewDoc.originalName ?? 'Document preview'}
                className="max-h-[70vh] max-w-full rounded border border-line object-contain shadow-xs"
              />
            ) : (
              <iframe
                src={`/api/seller/documents/${previewDoc.id}/file`}
                title={previewDoc.original_name ?? previewDoc.originalName ?? 'Document PDF'}
                className="h-[70vh] w-full rounded border border-line bg-white shadow-xs"
              />
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
