// scripts/financial-unit-economics-simulator.cjs
// Rigorous Monte Carlo & Deterministic Financial Simulator for Dear Hills Marketplace

const ZONES = [
  { name: 'Zone B (HP / Punjab / Chandigarh / Delhi)', weight: 0.50, minCost: 42, maxCost: 52 },
  { name: 'Zone C (Metro North/West - Jaipur, Lucknow)', weight: 0.20, minCost: 52, maxCost: 65 },
  { name: 'Zone D (National Metros - Mumbai, Blr, Hyd, Pune)', weight: 0.20, minCost: 65, maxCost: 80 },
  { name: 'Zone E (Remote / East / South deep)', weight: 0.10, minCost: 80, maxCost: 98 },
];

function sampleLogisticsCost(weightKg = 0.5) {
  const rand = Math.random();
  let cumulative = 0;
  let selectedZone = ZONES[0];
  for (const zone of ZONES) {
    cumulative += zone.weight;
    if (rand <= cumulative) {
      selectedZone = zone;
      break;
    }
  }
  const baseCost = selectedZone.minCost + Math.random() * (selectedZone.maxCost - selectedZone.minCost);
  // If weight > 0.5kg, add extra slab cost (approx ₹30/500g)
  const extraWeightSlabs = Math.max(0, Math.ceil((weightKg - 0.5) / 0.5));
  return baseCost + extraWeightSlabs * 32;
}

// Gateway fee: Razorpay standard 2% + 18% GST = 2.36%
const GATEWAY_RATE = 0.0236;
const PLATFORM_FEE_RATE = 0.12; // 12%

// Test models:
// Model 1: Flat ₹79 Shipping under ₹1,499, Free above
// Model 2: Flat ₹49 Shipping under ₹999, Free above
// Model 3: Flat ₹29 Shipping under ₹499, ₹49 between ₹500-₹999, Free above ₹999
// Model 4: Flat ₹29 Shipping on all orders under ₹799, Free above ₹799

function evaluateOrder(subtotal, shippingCharged, actualLogisticsCost, isRto = false, isReturn = false) {
  const customerPaid = subtotal + shippingCharged;
  const gatewayFee = customerPaid * GATEWAY_RATE;
  const platformFee = subtotal * PLATFORM_FEE_RATE;

  // In standard marketplace:
  // Marketplace collected = customerPaid
  // Marketplace pays out to seller: subtotal - platformFee = subtotal * (1 - 0.12)
  // Marketplace pays logistics: actualLogisticsCost
  // Marketplace pays gateway: gatewayFee
  
  if (isRto) {
    // RTO: Customer is refunded product value (or shipping retained depending on policy).
    // Courier charges both forward + RTO reverse (~1.5x)
    const rtoLogistics = actualLogisticsCost * 1.5;
    const net = shippingCharged - rtoLogistics - gatewayFee;
    return { netProfit: net, customerPaid, platformFee, gatewayFee, logistics: rtoLogistics, status: 'RTO' };
  }

  if (isReturn) {
    // Approved return: Customer refunded. Platform fee reversed. Courier return borne by policy.
    const returnLogistics = actualLogisticsCost * 1.8;
    const net = -returnLogistics - gatewayFee;
    return { netProfit: net, customerPaid, platformFee, gatewayFee, logistics: returnLogistics, status: 'RETURN' };
  }

  // Normal successful delivery:
  // Net Marketplace Margin = (customerPaid - (subtotal - platformFee)) - actualLogisticsCost - gatewayFee
  // = platformFee + shippingCharged - actualLogisticsCost - gatewayFee
  const netProfit = platformFee + shippingCharged - actualLogisticsCost - gatewayFee;
  return { netProfit, customerPaid, platformFee, gatewayFee, logistics: actualLogisticsCost, status: 'DELIVERED' };
}

// Run simulation of 10,000 orders across typical order values
const SIMULATION_COUNT = 10000;

function runModelSimulation(name, shippingPolicyFn) {
  let totalGrossSales = 0;
  let totalPlatformRevenue = 0;
  let totalGatewayFees = 0;
  let totalLogisticsCosts = 0;
  let totalNetProfit = 0;
  let lossCount = 0;
  let profitCount = 0;

  // Order value distribution (Realistic mountain craft e-commerce):
  // 35% small (₹250 - ₹499)
  // 40% medium (₹500 - ₹999)
  // 20% large (₹1000 - ₹1999)
  // 5% premium (₹2000 - ₹4500)
  for (let i = 0; i < SIMULATION_COUNT; i++) {
    const r = Math.random();
    let subtotal = 0;
    if (r < 0.35) subtotal = 250 + Math.random() * 249; // 250-499
    else if (r < 0.75) subtotal = 500 + Math.random() * 499; // 500-999
    else if (r < 0.95) subtotal = 1000 + Math.random() * 999; // 1000-1999
    else subtotal = 2000 + Math.random() * 2500; // 2000-4500

    subtotal = Math.round(subtotal);
    const shippingCharged = shippingPolicyFn(subtotal);
    const actualLogistics = sampleLogisticsCost(0.5);

    // Realistic Prepaid RTO rate = 2.5%, Return rate = 2.0%
    const isRto = Math.random() < 0.025;
    const isReturn = !isRto && Math.random() < 0.02;

    const res = evaluateOrder(subtotal, shippingCharged, actualLogistics, isRto, isReturn);

    totalGrossSales += res.customerPaid;
    totalPlatformRevenue += (res.platformFee + shippingCharged);
    totalGatewayFees += res.gatewayFee;
    totalLogisticsCosts += res.logistics;
    totalNetProfit += res.netProfit;

    if (res.netProfit < 0) lossCount++;
    else profitCount++;
  }

  return {
    name,
    avgOrderValue: Math.round(totalGrossSales / SIMULATION_COUNT),
    totalGrossGMV: Math.round(totalGrossSales),
    totalNetProfit: Math.round(totalNetProfit),
    avgProfitPerOrder: (totalNetProfit / SIMULATION_COUNT).toFixed(2),
    profitMarginOnGMV: ((totalNetProfit / totalGrossSales) * 100).toFixed(2) + '%',
    lossOrderPercentage: ((lossCount / SIMULATION_COUNT) * 100).toFixed(1) + '%',
    profitOrderPercentage: ((profitCount / SIMULATION_COUNT) * 100).toFixed(1) + '%',
  };
}

console.log('=== RUNNING RIGOROUS MARKETPLACE SIMULATION (10,000 ORDERS) ===\n');

const results = [
  runModelSimulation('Strategy A (Current Default: Flat ₹79, Free over ₹1,499)', (s) => (s >= 1499 ? 0 : 79)),
  runModelSimulation('Strategy B (Smart Balanced: ₹29 under ₹499, ₹49 from ₹500-₹999, Free over ₹999)', (s) => {
    if (s >= 999) return 0;
    if (s >= 500) return 49;
    return 29;
  }),
  runModelSimulation('Strategy C (Ultra Low Customer Shipping: Flat ₹29 under ₹799, Free over ₹799)', (s) => (s >= 799 ? 0 : 29)),
  runModelSimulation('Strategy D (Zero Shipping Friction: Flat ₹39 under ₹599, Free over ₹599)', (s) => (s >= 599 ? 0 : 39)),
];

console.table(results);

