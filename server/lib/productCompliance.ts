// The publication rules are shared with the seller product editor so the
// guidance a maker sees matches the checks the server actually enforces.
import type { Db } from '../db.js';
export * from '../../shared/productCompliance.js';

export function sellerAcceptedProofFlags(db: Db, sellerId: string): {
  hasAcceptedOriginOrCraftProof: boolean;
  hasAcceptedGiProof: boolean;
  hasAcceptedOrganicProof: boolean;
} {
  const docs = db
    .prepare("SELECT doc_type FROM seller_documents WHERE seller_id = ? AND status = 'accepted'")
    .all(sellerId) as { doc_type: string }[];
  const types = new Set(docs.map((d) => d.doc_type.toLowerCase()));
  return {
    hasAcceptedOriginOrCraftProof:
      types.has('craft_proof') ||
      types.has('origin_proof') ||
      types.has('gi_certificate') ||
      types.has('artisan_id') ||
      types.has('pashmina_test'),
    hasAcceptedGiProof: types.has('gi_certificate') || types.has('origin_proof'),
    hasAcceptedOrganicProof: types.has('organic_certificate') || types.has('fssai'),
  };
}
