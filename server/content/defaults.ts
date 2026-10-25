import type { SiteContent } from '../../shared/content.js';

/**
 * Default editorial and policy content. Policy text is deliberately marked as
 * draft: it must be reviewed by a qualified Indian lawyer before launch. Square
 * brackets indicate facts the business must supply.
 */
export const DEFAULT_CONTENT: SiteContent = {
  announcement: {
    active: true,
    text: 'Complimentary shipping on orders over ₹1,499 · Dispatched from Himachal within 2 working days',
    href: '/policies/shipping',
  },
  homepage: {
    hero: {
      eyebrow: 'A Himachal marketplace',
      title: 'From the Himalayas, with heart.',
      body: 'Cloth woven on wooden looms, food grown on mountain terraces, and everyday objects shaped by hands that know the weather. Meet the people behind them.',
      image: '/images/hero-village.jpg',
      imageAlt: 'A hillside village in Himachal Pradesh with slate-roofed houses and terraced fields',
      imageCredit: 'Photograph via Wikimedia Commons — see image credits',
      ctaLabel: 'Explore the collection',
      ctaHref: '/shop',
    },
    editorial: {
      title: 'The slow work of a mountain winter',
      body: 'In many Himachali homes, winter is when the loom comes out. Wool is carded by the fire, patterns are remembered rather than written down, and a shawl takes weeks instead of minutes. We look for that pace — not because it is romantic, but because it changes how a thing wears.',
      signature: 'Notes from the PAHADI ROOTS desk',
      image: '/images/weaving.jpg',
      imageAlt: 'Hands working a traditional wooden handloom',
      imageCredit: 'Photograph via Wikimedia Commons — see image credits',
    },
    gifting: {
      title: 'A box that carries a place',
      body: 'Tea, honey, preserves, and small handmade things — packed together for someone who would rather receive a story than another candle.',
      categorySlug: 'gifting',
    },
    makerIntro:
      'We work with independent producers and workshops. Every maker profile is reviewed before it appears here, and every product carries the name of the seller responsible for it.',
  },
  about: {
    title: 'A marketplace with mud on its boots',
    intro:
      'PAHADI ROOTS is a curated marketplace for products made and grown in Himachal Pradesh. We are building it so that small mountain businesses can reach customers across India without sanding off what makes them local.',
    sections: [
      {
        heading: 'Why a marketplace, not a souvenir shop',
        body: 'Himachal is not one aesthetic. A Kinnauri shawl, a jar of apricot preserve from Lahaul, and a stone-ground chutney from Kangra come from different landscapes, different seasons, and different economies. A single “Himalayan” label flattens all of that. Our catalogue is organised around makers, materials, and places instead.',
      },
      {
        heading: 'What we do',
        body: 'We review seller applications, check that product listings match what is actually being sold, moderate origin and material claims, handle payments centrally, and give sellers a dashboard for stock and dispatch. We do not manufacture the products and we do not hide who sells them.',
      },
      {
        heading: 'What we are still building',
        body: 'PAHADI ROOTS is a young business. Seller verification, payout operations, and policy documents are being formalised. Where a claim or certification has not been documented, we do not display it. Where a process is manual, we say so.',
      },
      {
        heading: 'Business details',
        body: 'Legal entity: [LEGAL ENTITY NAME TO BE CONFIRMED]. Registered address: [REGISTERED ADDRESS]. GSTIN: [IF APPLICABLE]. These details must be completed before public launch.',
      },
    ],
  },
  sourcing: {
    title: 'How we choose what we sell',
    intro:
      'Our sourcing standard is written around evidence, not adjectives. This page describes the checks we actually perform and the claims we will not make without documentation.',
    sections: [
      {
        heading: 'Seller review',
        body: 'Sellers submit their identity, business details, operating location, product categories, and applicable registrations. An administrator reviews the application before the storefront or any listing becomes visible. Sellers can be suspended if information changes or a complaint is upheld.',
      },
      {
        heading: 'Product review',
        body: 'Every listing is reviewed for a clear description, real photographs, honest materials and dimensions, price, stock, and shipping weight. Food listings must state ingredients, allergens, shelf life, and storage. We reject listings that make unsupported health, certification, or origin claims.',
      },
      {
        heading: 'Origin claims',
        body: 'A place name is only shown as a product origin when the seller has provided it and the listing has been reviewed. The “origin verified” marker appears only where supporting documentation is recorded by our team. Absence of the marker means exactly that — it is not an accusation.',
      },
      {
        heading: 'Certifications',
        body: 'We do not currently display organic, GI, FSSAI, or government certification badges. If those claims are added later, they will require a certificate number, issuer, validity date, and evidence on file. No certification is implied by the design of this website.',
      },
      {
        heading: 'What we will not list',
        body: 'Wildlife products, restricted forest produce, medicines with therapeutic claims, prohibited weapons, and any product that cannot be sold lawfully in India. Food businesses must hold the registrations required for their scale of operation.',
      },
    ],
  },
  faq: {
    title: 'Questions, answered plainly',
    intro: 'If something is missing, write to us and a person will read it.',
    items: [
      {
        question: 'Where do you deliver?',
        answer:
          'We currently deliver within India only. Orders are dispatched by the individual seller, usually within two working days. Delivery typically takes 3–7 working days after dispatch; remote PIN codes can take longer.',
      },
      {
        question: 'Who ships my order if it contains items from two makers?',
        answer:
          'Your order is split into separate seller shipments. You pay once, but each maker packs and dispatches their own items, so parcels can arrive on different days. Tracking is shown separately for each shipment.',
      },
      {
        question: 'Can I return something?',
        answer:
          'Unused, unopened items can be returned within 7 days of delivery in their original packaging. Perishable food, opened food, and personalised items are not returnable unless they arrived damaged or incorrect. Start a return from your order page.',
      },
      {
        question: 'How do refunds work?',
        answer:
          'An approved refund is sent back to the original payment method. We record the provider reference before marking a refund complete. Bank processing times are outside our control. Manual refunds are recorded with a bank or UPI reference.',
      },
      {
        question: 'Are the products certified organic or GI-tagged?',
        answer:
          'Not unless the listing explicitly says so and shows the evidence reviewed by us. We do not use certification badges by default. If you need documentation for a specific product, ask us before ordering.',
      },
      {
        question: 'How do I sell on PAHADI ROOTS?',
        answer:
          'Apply through the seller application. You will need identity and business details, your operating location, the categories you make, and applicable registrations. Applications are reviewed manually. Products cannot go live until the seller and the listing are approved.',
      },
      {
        question: 'What commission do you charge sellers?',
        answer:
          'The default commission is 15% of product value after discounts, excluding shipping and taxes. Commission rules can differ by category or seller and are shown in the seller dashboard before products are submitted. Each order stores the rate that applied at the time of sale.',
      },
      {
        question: 'How do sellers get paid?',
        answer:
          'Delivered order earnings become eligible after the 7-day return window. The team reviews a settlement statement, then records a bank/UPI payout reference. A seller is not marked paid until that reference exists. Automated marketplace payouts depend on provider approval and are not yet enabled.',
      },
    ],
  },
  credits: {
    intro:
      'Photography on this development build is illustrative and sourced from Wikimedia Commons under the licences listed below. Images do not depict specific PAHADI ROOTS sellers or imply that a product comes from the place shown. Replace these assets with original product photography before launch.',
    items: [],
  },
  policies: {
    shipping: {
      title: 'Shipping policy',
      status: 'draft',
      lastUpdated: 'Draft — legal review pending',
      summary:
        'How orders are dispatched, what shipping costs, and what to expect when a parcel is delayed. This draft must be reviewed before launch.',
      sections: [
        {
          heading: 'Dispatch',
          body: 'Each seller dispatches their own items. Sellers are asked to confirm and hand over an order within 2 working days of payment. Made-to-order items may take longer; the product page will say so before you buy.',
        },
        {
          heading: 'Charges',
          body: 'A flat shipping fee of ₹79 applies to orders below ₹1,499 after discounts. Orders of ₹1,499 or more ship free. The exact charge is shown before payment. We do not add handling fees at checkout.',
        },
        {
          heading: 'Delivery estimates',
          body: 'Typical delivery is 3–7 working days after dispatch. Estimates are not guarantees. Remote or weather-affected PIN codes can take longer. If a shipment is delayed, contact support with the order number and we will follow up with the seller and carrier.',
        },
        {
          heading: 'Multiple sellers',
          body: 'A single order can contain items from more than one seller. These are fulfilled as separate shipments with separate tracking. Shipping is calculated once for the order, not once per seller.',
        },
        {
          heading: 'Failed delivery and address changes',
          body: 'Please provide a complete address and a reachable phone number. Address changes after dispatch depend on the carrier. Repeated failed delivery may result in the parcel returning to the seller; refund eligibility is assessed case by case under the returns policy.',
        },
        {
          heading: 'International orders',
          body: 'We do not currently accept orders with a delivery address outside India.',
        },
      ],
    },
    returns: {
      title: 'Returns, refunds and cancellations',
      status: 'draft',
      lastUpdated: 'Draft — legal review pending',
      summary:
        'The 7-day return window, what cannot be returned, and how cancellations and refunds are processed.',
      sections: [
        {
          heading: 'Cancelling before dispatch',
          body: 'You can request cancellation from your order page while the seller has not dispatched the parcel. If the order is still being prepared, cancellation is normally approved automatically. If it has already been handed to the courier, please use the return process after delivery.',
        },
        {
          heading: 'Returns',
          body: 'Request a return within 7 days of delivery. Items must be unused, unopened, and in their original packaging with tags and inserts. We may ask for photographs before approving. Approved returns are collected where serviceable; if the fault is ours, return shipping is covered.',
        },
        {
          heading: 'Non-returnable items',
          body: 'Perishable and opened food, personal-care items that have been used, personalised or made-to-order products, and gift cards cannot be returned unless they arrived damaged, spoiled, or different from what was ordered. This does not affect your rights where a product is defective or misdescribed.',
        },
        {
          heading: 'Refund method and timing',
          body: 'Refunds are sent to the original payment method (or by bank/UPI where a manual refund has been agreed). We mark a refund complete only after a provider reference or bank reference is recorded. Provider and bank processing can take several working days after that.',
        },
        {
          heading: 'Partial refunds',
          body: 'Because an order can include several sellers, a return or cancellation may affect only one shipment. Refunds are calculated for the affected items and their share of shipping and discounts; other shipments are not changed.',
        },
        {
          heading: 'Damaged or incorrect items',
          body: 'Tell us within 48 hours of delivery where possible, with photographs of the item and packaging. Keep the packaging until the claim is resolved. We will arrange a replacement or refund after review.',
        },
        {
          heading: 'Grievance contact',
          body: 'Grievance officer: [NAME]. Email: [GRIEVANCE EMAIL]. Phone: [PHONE]. Address: [REGISTERED ADDRESS]. These details must be completed before launch, along with the response timeline required by applicable consumer protection rules.',
        },
      ],
    },
    privacy: {
      title: 'Privacy policy',
      status: 'draft',
      lastUpdated: 'Draft — legal review pending',
      summary:
        'What personal data the marketplace collects, why, how long it is kept, and how to exercise your rights. This draft requires review under applicable Indian data-protection law.',
      sections: [
        {
          heading: 'Data we collect',
          body: 'Account name, email, phone number, delivery addresses, order history, communications with support, seller application and verification details, and technical logs needed to operate and secure the service. Payments are processed by the payment provider; we do not store card numbers or CVV.',
        },
        {
          heading: 'Why we use it',
          body: 'To create and secure accounts, process and deliver orders, handle returns and refunds, meet accounting and tax obligations, prevent fraud, and send transactional messages. Marketing email is sent only where you have opted in, and you can withdraw consent at any time.',
        },
        {
          heading: 'Who we share it with',
          body: 'Sellers receive the minimum information needed to fulfil their part of an order: name, delivery address, phone number, and order contents. Payment and shipping providers receive what is necessary to process a payment or delivery. We do not sell personal data.',
        },
        {
          heading: 'Retention',
          body: 'Account and order records are retained for as long as needed to provide the service and to meet statutory accounting and consumer-protection obligations. Retention periods should be confirmed with a qualified Indian CA and lawyer. Verification documents are stored privately and access is restricted.',
        },
        {
          heading: 'Your rights',
          body: 'You may request access, correction, or deletion of your account data, and withdraw marketing consent. Deletion requests are reviewed against record-retention obligations; some order and tax records cannot be erased immediately. Write to the contact address below.',
        },
        {
          heading: 'Security',
          body: 'Passwords are stored as salted scrypt hashes. Sessions use HTTP-only cookies. Payment signatures and webhooks are verified server-side. No method of transmission or storage is completely secure; report a suspected issue promptly.',
        },
        {
          heading: 'Contact',
          body: 'Privacy contact: [NAME / EMAIL]. Registered entity and address: [TO BE COMPLETED]. Grievance officer details: [TO BE COMPLETED]. This policy must be reviewed before launch.',
        },
      ],
    },
    terms: {
      title: 'Terms of service',
      status: 'draft',
      lastUpdated: 'Draft — legal review pending',
      summary: 'The contract between you and PAHADI ROOTS when you use the marketplace.',
      sections: [
        {
          heading: 'The marketplace',
          body: 'PAHADI ROOTS provides a platform for independent sellers to offer goods to customers in India. The seller is responsible for the product, its description, compliance, and dispatch. PAHADI ROOTS is responsible for operating the marketplace, processing payments, and administering its published policies.',
        },
        {
          heading: 'Accounts',
          body: 'You must be at least 18 and provide accurate information. You are responsible for activity under your account and for keeping your password secure. We may suspend accounts used for fraud, abuse, or unlawful activity.',
        },
        {
          heading: 'Pricing and availability',
          body: 'Prices are in Indian rupees and include applicable taxes as displayed. Stock is validated when you place an order. If an item becomes unavailable after payment, we will contact you and refund the affected amount. Obvious pricing errors may be corrected before dispatch with a full refund.',
        },
        {
          heading: 'Orders and payment',
          body: 'Your order is confirmed when payment is verified by our payment provider. An order is not paid merely because a checkout screen was shown. Payment provider terms also apply. We do not store card details.',
        },
        {
          heading: 'Returns and refunds',
          body: 'The returns and refunds policy forms part of these terms. Nothing in these terms limits rights you have under applicable consumer law.',
        },
        {
          heading: 'Content and intellectual property',
          body: 'Product photographs and text are provided by sellers and used with permission. The PAHADI ROOTS name, design, and original site content belong to the business. Do not reuse them commercially without permission.',
        },
        {
          heading: 'Liability and governing law',
          body: 'These terms are governed by the laws of India. Disputes are subject to the courts at [CITY, HIMACHAL PRADESH], subject to any mandatory consumer forum rights. Liability wording must be reviewed and finalised by counsel before launch.',
        },
      ],
    },
    'seller-terms': {
      title: 'Seller terms',
      status: 'draft',
      lastUpdated: 'Draft — legal review pending',
      summary:
        'The commercial terms for selling on PAHADI ROOTS, including commission, dispatch, refunds, settlements, and suspension.',
      sections: [
        {
          heading: 'Eligibility and approval',
          body: 'Sellers must provide accurate identity, business, address, and category information, plus applicable registrations. Submitting an application does not guarantee approval. Listings remain invisible until both the seller and the product are approved. Material changes may require re-review.',
        },
        {
          heading: 'Commission',
          body: 'The default commission is 15% of product value after discounts, excluding shipping and taxes. A different rate may apply by category or seller and is visible in the dashboard. The applicable rate is snapshotted on each order; later rule changes do not rewrite historical orders.',
        },
        {
          heading: 'Dispatch and packaging',
          body: 'Confirm or cancel each paid order promptly. Aim to hand over within 2 working days. Pack safely, include required declarations, and upload a real carrier and tracking number. Marking an order delivered is a factual claim and may be audited.',
        },
        {
          heading: 'Products and compliance',
          body: 'You are responsible for product quality, safety, labelling, food registrations, legal metrology declarations, and the accuracy of every claim. Do not use certification, health, or origin claims without evidence. Prohibited and restricted goods may not be listed.',
        },
        {
          heading: 'Refunds and returns',
          body: 'Approved refunds are deducted from your ledger, and the proportional commission is reversed. Returned goods remain your responsibility to inspect. Repeated quality or dispatch failures can lead to suspension.',
        },
        {
          heading: 'Settlements',
          body: 'Delivered earnings become eligible after the 7-day return window. Statements account for commission, refunds, and adjustments. Payouts are made only after a reviewed statement and a recorded bank/UPI reference. Bank, tax, and KYC details must match the business.',
        },
        {
          heading: 'Taxes and invoicing',
          body: 'You are responsible for your own tax registration, invoicing, and reporting obligations. The marketplace’s tax treatment and any tax collected on your behalf must be confirmed in the seller agreement and with a qualified CA. This draft is not tax advice.',
        },
        {
          heading: 'Suspension and termination',
          body: 'We may pause listings or suspend a seller for unfulfilled orders, misrepresentation, unsafe products, or policy breaches. Pending eligible balances are settled after adjustments and any investigations, unless records are subject to a legal hold.',
        },
      ],
    },
    authenticity: {
      title: 'Authenticity and product claims',
      status: 'draft',
      lastUpdated: 'Draft — legal review pending',
      summary: 'What our verification actually covers, and what it does not.',
      sections: [
        {
          heading: 'What we check',
          body: 'Seller identity and business details, the operating location, category suitability, listing photographs, descriptions, materials, dimensions, price, stock, and shipping information. Food listings are reviewed for ingredients, allergens, shelf life, and storage information. Claims that need evidence are flagged during moderation.',
        },
        {
          heading: 'Origin information',
          body: 'A place is shown where the seller supplies it and the listing is approved. The “origin verified” label is only used where our team has recorded supporting evidence. It does not mean a product has a Geographical Indication registration.',
        },
        {
          heading: 'Certification claims',
          body: 'We do not display organic, GI, FSSAI, or government certification badges in this build. Any future certification display requires a certificate number, issuer, validity, and a copy on file. The absence of a badge is not proof that a product lacks a licence.',
        },
        {
          heading: 'If something is not as described',
          body: 'Contact support with your order number and photographs. Listings that misrepresent origin, material, certification, or safety are removed pending review, and repeat issues can result in suspension. This process is operated manually by the founding team.',
        },
      ],
    },
    cookies: {
      title: 'Cookie notice',
      status: 'draft',
      lastUpdated: 'Draft — legal review pending',
      summary: 'This build uses only essential cookies. No advertising or analytics cookies are set by default.',
      sections: [
        {
          heading: 'Cookies we set',
          body: 'A secure session cookie keeps you signed in. A cart cookie lets a guest bag survive a page refresh. Both are HTTP-only where appropriate and are not used for advertising.',
        },
        {
          heading: 'Analytics and advertising',
          body: 'No third-party analytics, advertising, or social tracking scripts are included in this build. If they are added, this notice and a consent mechanism must be updated before they are enabled.',
        },
        {
          heading: 'Managing cookies',
          body: 'You can clear or block cookies in your browser. Blocking the session and cart cookies will prevent sign-in and checkout from working.',
        },
      ],
    },
  },
};
