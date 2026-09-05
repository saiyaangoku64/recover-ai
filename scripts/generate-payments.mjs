import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ── Authentic Indian Names & Merchants ────────────────────── */
const FIRST_NAMES = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan',
  'Rahul', 'Priya', 'Neha', 'Amit', 'Deepak', 'Pooja', 'Ravi', 'Sneha', 'Karan', 'Divya',
  'Ananya', 'Rohit', 'Meera', 'Vikram', 'Kavita', 'Suresh', 'Lakshmi', 'Rajesh', 'Swati', 'Manish',
  'Tanvi', 'Harsh', 'Nisha', 'Gaurav', 'Pallavi', 'Sanjay', 'Ritika', 'Nikhil', 'Shruti', 'Ankur',
  'Bhavya', 'Chirag', 'Disha', 'Esha', 'Farhan', 'Gauri', 'Hemant', 'Isha', 'Jatin', 'Kriti',
];

const LAST_NAMES = [
  'Sharma', 'Patel', 'Singh', 'Kumar', 'Gupta', 'Jain', 'Agarwal', 'Reddy', 'Nair', 'Iyer',
  'Verma', 'Malhotra', 'Chopra', 'Shah', 'Mehta', 'Kapoor', 'Bansal', 'Sinha', 'Mishra', 'Rao',
  'Chauhan', 'Pandey', 'Saxena', 'Bhat', 'Deshmukh', 'Kulkarni', 'Patil', 'Joshi', 'Thakur', 'Menon',
];

const DOMAINS = ['gmail.com', 'outlook.com', 'yahoo.co.in', 'tcs.com', 'infosys.com', 'wipro.com', 'zerodha.com'];

const MERCHANTS = [
  'Zomato Gold VIP', 'Zerodha Kite Connect', 'Cult.fit Elite Annual', 'Swiggy One Pro',
  'Hotstar Super Pass', 'Zepto Daily Saver', 'Postman Enterprise API', 'CRED Garage Insurance',
  'Shopify Merchant Tier', 'Netflix Premium India', 'AWS Cloud Infrastructure', 'Urban Company Plus'
];

const METHODS = [
  { method: 'upi', weight: 45 },
  { method: 'card', weight: 35 },
  { method: 'netbanking', weight: 12 },
  { method: 'wallet', weight: 8 },
];

const FAILURE_REASONS = [
  // Hard declines (Strictly blocked by policy)
  { reason: 'stolen_card', category: 'hard', weight: 3 },
  { reason: 'fraud_suspected', category: 'hard', weight: 4 },
  { reason: 'card_declined', category: 'hard', weight: 10 },
  { reason: 'account_closed', category: 'hard', weight: 3 },
  { reason: 'do_not_honor', category: 'hard', weight: 7 },
  // Soft declines (High recovery potential via Smart Retry or WhatsApp PTP)
  { reason: 'bank_unavailable', category: 'soft', weight: 18 },
  { reason: 'network_timeout', category: 'soft', weight: 16 },
  { reason: 'upi_collect_expired', category: 'soft', weight: 12 },
  { reason: 'insufficient_funds', category: 'soft', weight: 14 },
  { reason: 'gateway_error', category: 'soft', weight: 8 },
  { reason: 'authentication_failed', category: 'soft', weight: 5 },
];

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }

function weightedRandom(items) {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of items) { r -= item.weight; if (r <= 0) return item; }
  return items[items.length - 1];
}

function randomRzpId(prefix = 'pay_') {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = prefix;
  for (let i = 0; i < 14; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

function randomPhone() {
  const prefixes = ['98201', '99402', '98103', '97312', '98450', '98860', '99001'];
  return `+91 ${pick(prefixes)} ${randInt(10000, 99999)}`;
}

function randomAmount() {
  const amounts = [999, 1499, 2499, 4999, 7999, 12500, 18999, 24999, 36500, 48000, 62000, 85000];
  return pick(amounts);
}

/* ── Seeded Showcase Transactions ──────────────────────────── */
const seeded = [
  {
    id: 'pay_Pn9L3vK8rB2w1Q',
    customer_id: 'cust_Vx7K9mQ2pL',
    customer_name: 'Vikramaditya Chauhan',
    email: 'vikram.chauhan@tcs.com',
    phone: '+91 98201 44819',
    merchant: 'Postman Enterprise API',
    amount: 4999,
    currency: 'INR',
    method: 'card',
    failure_reason: 'stolen_card',
    failure_category: 'hard',
    previous_successes: 0,
    retry_count: 4,
    days_since_failure: 1,
    subscription_type: 'saas_tool',
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'pay_Qw8R4mZ1tK9p2X',
    customer_id: 'cust_Jm3L8vR5tQ',
    customer_name: 'Neha Agarwal',
    email: 'neha.agarwal@gmail.com',
    phone: '+91 99402 38194',
    merchant: 'CRED Garage Insurance',
    amount: 12500,
    currency: 'INR',
    method: 'card',
    failure_reason: 'fraud_suspected',
    failure_category: 'hard',
    previous_successes: 1,
    retry_count: 3,
    days_since_failure: 2,
    subscription_type: 'insurance_premium',
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'pay_T5kM2pD8wX1q7Z',
    customer_id: 'cust_Pn2L7mR4wT',
    customer_name: 'Rahul Sharma',
    email: 'rahul.sharma@wipro.com',
    phone: '+91 98103 72910',
    merchant: 'Swiggy One Pro',
    amount: 8999,
    currency: 'INR',
    method: 'upi',
    failure_reason: 'upi_collect_expired',
    failure_category: 'soft',
    previous_successes: 9,
    retry_count: 0,
    days_since_failure: 1,
    subscription_type: 'swiggy_one',
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'pay_Y8xK1mQ9vL3a4P',
    customer_id: 'cust_Rk4M9pL2vX',
    customer_name: 'Aditya Verma',
    email: 'aditya.verma@zerodha.com',
    phone: '+91 97312 88401',
    merchant: 'Zerodha Kite Connect',
    amount: 14999,
    currency: 'INR',
    method: 'upi',
    failure_reason: 'bank_unavailable',
    failure_category: 'soft',
    previous_successes: 14,
    retry_count: 1,
    days_since_failure: 0,
    subscription_type: 'zerodha_kite',
    created_at: new Date().toISOString(),
  },
  {
    id: 'pay_B2mK8pD4wX9q1L',
    customer_id: 'cust_Tw6P1mR8vK',
    customer_name: 'Priya Venkatesh',
    email: 'priya.venkatesh@outlook.com',
    phone: '+91 98450 63920',
    merchant: 'Cult.fit Elite Annual',
    amount: 24999,
    currency: 'INR',
    method: 'upi',
    failure_reason: 'network_timeout',
    failure_category: 'soft',
    previous_successes: 11,
    retry_count: 1,
    days_since_failure: 1,
    subscription_type: 'gym_membership',
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'pay_C7nL2mQ5rB8w3K',
    customer_id: 'cust_Xp9K2mR4vT',
    customer_name: 'Farhan Jain',
    email: 'farhan.jain@gmail.com',
    phone: '+91 98860 12948',
    merchant: 'Hotstar Super Pass',
    amount: 1499,
    currency: 'INR',
    method: 'netbanking',
    failure_reason: 'account_closed',
    failure_category: 'hard',
    previous_successes: 0,
    retry_count: 4,
    days_since_failure: 5,
    subscription_type: 'hotstar_vip',
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: 'pay_M3xK9pD2wL7q8Z',
    customer_id: 'cust_Lq5M8pR1vW',
    customer_name: 'Rohan Kulkarni',
    email: 'rohan.kulkarni@infosys.com',
    phone: '+91 99001 77392',
    merchant: 'Zomato Gold VIP',
    amount: 62000,
    currency: 'INR',
    method: 'card',
    failure_reason: 'bank_unavailable',
    failure_category: 'soft',
    previous_successes: 7,
    retry_count: 1,
    days_since_failure: 1,
    subscription_type: 'saas_tool',
    created_at: new Date(Date.now() - 86400000).toISOString(),
  }
];

/* ── Generate Rest of Cohort (total 253) ─────────────────────── */
const entries = [];
for (let i = 0; i < 246; i++) {
  const fail = weightedRandom(FAILURE_REASONS);
  const meth = weightedRandom(METHODS);
  const firstName = pick(FIRST_NAMES);
  const lastName = pick(LAST_NAMES);
  const fullName = `${firstName} ${lastName}`;
  const domain = pick(DOMAINS);
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`;
  const daysSince = randInt(0, 14);

  entries.push({
    id: randomRzpId(),
    customer_id: `cust_${Math.random().toString(36).substring(2, 12)}`,
    customer_name: fullName,
    email,
    phone: randomPhone(),
    merchant: pick(MERCHANTS),
    amount: randomAmount(),
    currency: 'INR',
    method: meth.method,
    failure_reason: fail.reason,
    failure_category: fail.category,
    previous_successes: randInt(0, 16),
    retry_count: randInt(0, 4),
    days_since_failure: daysSince,
    subscription_type: pick(MERCHANTS).toLowerCase().replace(/\s+/g, '_'),
    created_at: new Date(Date.now() - daysSince * 86400000 - randInt(0, 23) * 3600000).toISOString(),
  });
}

const all = [...seeded, ...entries];
const outputPath = join(__dirname, '../public/payments.json');
writeFileSync(outputPath, JSON.stringify(all, null, 2));

const hardCount = all.filter(p => p.failure_category === 'hard').length;
const softCount = all.length - hardCount;
const totalAmt = all.reduce((s, p) => s + p.amount, 0);
console.log(`Generated ${all.length} authentic payments → public/payments.json`);
console.log(`Hard declines: ${hardCount} | Soft failures: ${softCount} | Total ₹${totalAmt.toLocaleString('en-IN')}`);
