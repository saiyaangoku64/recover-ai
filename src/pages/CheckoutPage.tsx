import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ShieldCheck,
  Clock,
  CreditCard,
  Smartphone,
  Building2,
  Wallet,
  CheckCircle2,
  Loader2,
  Lock,
  ChevronRight,
  X,
  Zap,
} from 'lucide-react';
import { useRecovery } from '../context/RecoveryContext';
import type { Payment } from '../types';

type PaymentMethod = 'upi' | 'card' | 'netbanking' | 'wallet';
type CheckoutStep = 'method' | 'details' | 'processing' | 'success';

const BANKS = [
  'State Bank of India', 'HDFC Bank', 'ICICI Bank', 'Axis Bank',
  'Kotak Mahindra Bank', 'Punjab National Bank', 'Bank of Baroda', 'Canara Bank',
];

const WALLETS = ['Paytm', 'PhonePe', 'Amazon Pay', 'Mobikwik'];

export function CheckoutPage() {
  const { paymentId } = useParams<{ paymentId: string }>();
  const navigate = useNavigate();
  const { payments, setPaymentStatus } = useRecovery();
  const payment = payments.find(p => p.id === paymentId);

  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [step, setStep] = useState<CheckoutStep>('method');
  const [upiId, setUpiId] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardName, setCardName] = useState('');
  const [selectedBank, setSelectedBank] = useState('');
  const [selectedWallet, setSelectedWallet] = useState('');
  const [timer, setTimer] = useState(900);
  const [processingText, setProcessingText] = useState('');

  useEffect(() => {
    if (step !== 'method') return;
    const interval = setInterval(() => setTimer(t => (t > 0 ? t - 1 : 0)), 1000);
    return () => clearInterval(interval);
  }, [step]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const formatCard = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(.{4})/g, '$1 ').trim();
  };

  const formatExpiry = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 4);
    if (digits.length > 2) return digits.slice(0, 2) + '/' + digits.slice(2);
    return digits;
  };

  const handlePay = useCallback(async () => {
    setStep('processing');

    const steps = [
      'Initializing secure connection…',
      'Verifying payment details…',
      'Contacting bank servers…',
      'Processing transaction…',
      'Confirming payment…',
    ];

    for (let i = 0; i < steps.length; i++) {
      setProcessingText(steps[i]);
      await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
    }

    if (payment) {
      setPaymentStatus(payment.id, 'recovered');
    }

    setStep('success');
  }, [payment, setPaymentStatus]);

  const canProceed = () => {
    if (method === 'upi') return upiId.includes('@');
    if (method === 'card') return cardNumber.replace(/\s/g, '').length >= 16 && cardExpiry.length >= 5 && cardCvv.length >= 3 && cardName.trim().length > 0;
    if (method === 'netbanking') return selectedBank.length > 0;
    if (method === 'wallet') return selectedWallet.length > 0;
    return false;
  };

  const handleBack = () => {
    if (step === 'details') setStep('method');
    else navigate(-1);
  };

  if (!payment) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ fontSize: 16, color: '#64748b' }}>Payment not found</p>
          <button onClick={() => navigate(-1)} style={{ marginTop: 16, padding: '10px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Go Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="checkout-page">
      {/* Header */}
      <div className="checkout-header">
        <div className="checkout-header-inner">
          {step !== 'success' && (
            <button className="checkout-back-btn" onClick={handleBack}>
              <ArrowLeft size={20} />
            </button>
          )}
          <div className="checkout-header-brand">
            <Zap size={20} fill="#3b82f6" color="#3b82f6" />
            <span>Razorpay</span>
          </div>
          {step !== 'success' && (
            <div className="checkout-timer">
              <Clock size={14} />
              <span>{formatTime(timer)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="checkout-body">
        {step === 'success' ? (
          <div className="checkout-success">
            <div className="checkout-success-icon">
              <CheckCircle2 size={64} color="#16a34a" />
            </div>
            <h2>Payment Successful!</h2>
            <p className="checkout-success-amount">₹{payment.amount.toLocaleString('en-IN')}</p>
            <p className="checkout-success-to">Paid to {payment.merchant || 'Razorpay Merchant'}</p>
            <div className="checkout-success-details">
              <div className="checkout-detail-row">
                <span>Transaction ID</span>
                <span className="mono">{payment.id.slice(0, 16).toUpperCase()}</span>
              </div>
              <div className="checkout-detail-row">
                <span>Payment Method</span>
                <span>{method === 'upi' ? 'UPI' : method === 'card' ? 'Card' : method === 'netbanking' ? 'Net Banking' : 'Wallet'}</span>
              </div>
              <div className="checkout-detail-row">
                <span>Status</span>
                <span style={{ color: '#16a34a', fontWeight: 700 }}>Completed</span>
              </div>
              <div className="checkout-detail-row">
                <span>Date & Time</span>
                <span>{new Date().toLocaleString('en-IN')}</span>
              </div>
            </div>
            <button className="checkout-done-btn" onClick={() => navigate(-1)}>
              Done
            </button>
          </div>
        ) : step === 'processing' ? (
          <div className="checkout-processing">
            <Loader2 size={48} className="checkout-spinner" color="#3b82f6" />
            <h3>{processingText}</h3>
            <p style={{ color: '#64748b', fontSize: 13, marginTop: 8 }}>Please do not close this window</p>
          </div>
        ) : (
          <>
            {/* Merchant Card */}
            <div className="checkout-merchant-card">
              <div className="checkout-merchant-icon">
                <span style={{ fontSize: 20, fontWeight: 800, color: '#3b82f6' }}>
                  {(payment.merchant || 'R')[0]}
                </span>
              </div>
              <div>
                <div className="checkout-merchant-name">{payment.merchant || 'Razorpay Merchant'}</div>
                <div className="checkout-merchant-desc">Payment for order #{payment.id.slice(0, 8).toUpperCase()}</div>
              </div>
              <div className="checkout-merchant-amount">₹{payment.amount.toLocaleString('en-IN')}</div>
            </div>

            {/* Customer Info */}
            <div className="checkout-customer-bar">
              <span>Pay as</span>
              <span className="checkout-customer-name">{payment.customer_name}</span>
            </div>

            {step === 'method' && (
              <>
                {/* Payment Methods */}
                <div className="checkout-methods">
                  <h3 className="checkout-section-title">Choose Payment Method</h3>

                  <button
                    className={`checkout-method-btn ${method === 'upi' ? 'active' : ''}`}
                    onClick={() => setMethod('upi')}
                  >
                    <div className="checkout-method-icon" style={{ background: '#eff6ff' }}>
                      <Smartphone size={20} color="#3b82f6" />
                    </div>
                    <div className="checkout-method-info">
                      <span className="checkout-method-name">UPI</span>
                      <span className="checkout-method-desc">Google Pay, PhonePe, Paytm, BHIM</span>
                    </div>
                    <ChevronRight size={18} color="#94a3b8" />
                  </button>

                  <button
                    className={`checkout-method-btn ${method === 'card' ? 'active' : ''}`}
                    onClick={() => setMethod('card')}
                  >
                    <div className="checkout-method-icon" style={{ background: '#fef3c7' }}>
                      <CreditCard size={20} color="#d97706" />
                    </div>
                    <div className="checkout-method-info">
                      <span className="checkout-method-name">Credit / Debit Card</span>
                      <span className="checkout-method-desc">Visa, Mastercard, RuPay</span>
                    </div>
                    <ChevronRight size={18} color="#94a3b8" />
                  </button>

                  <button
                    className={`checkout-method-btn ${method === 'netbanking' ? 'active' : ''}`}
                    onClick={() => setMethod('netbanking')}
                  >
                    <div className="checkout-method-icon" style={{ background: '#f0fdf4' }}>
                      <Building2 size={20} color="#16a34a" />
                    </div>
                    <div className="checkout-method-info">
                      <span className="checkout-method-name">Net Banking</span>
                      <span className="checkout-method-desc">All major banks supported</span>
                    </div>
                    <ChevronRight size={18} color="#94a3b8" />
                  </button>

                  <button
                    className={`checkout-method-btn ${method === 'wallet' ? 'active' : ''}`}
                    onClick={() => setMethod('wallet')}
                  >
                    <div className="checkout-method-icon" style={{ background: '#faf5ff' }}>
                      <Wallet size={20} color="#9333ea" />
                    </div>
                    <div className="checkout-method-info">
                      <span className="checkout-method-name">Wallet</span>
                      <span className="checkout-method-desc">Paytm, PhonePe, Amazon Pay</span>
                    </div>
                    <ChevronRight size={18} color="#94a3b8" />
                  </button>
                </div>

                <button
                  className="checkout-pay-btn"
                  onClick={() => setStep('details')}
                >
                  Continue with {method === 'upi' ? 'UPI' : method === 'card' ? 'Card' : method === 'netbanking' ? 'Net Banking' : 'Wallet'}
                </button>
              </>
            )}

            {step === 'details' && (
              <>
                {method === 'upi' && (
                  <div className="checkout-form">
                    <h3 className="checkout-section-title">Enter UPI ID</h3>
                    <div className="checkout-input-group">
                      <input
                        type="text"
                        placeholder="yourname@upi"
                        value={upiId}
                        onChange={(e) => setUpiId(e.target.value)}
                        className="checkout-input"
                        autoFocus
                      />
                      <span className="checkout-input-suffix">@upi</span>
                    </div>
                    <p style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
                      Open your UPI app and approve the payment request
                    </p>
                  </div>
                )}

                {method === 'card' && (
                  <div className="checkout-form">
                    <h3 className="checkout-section-title">Enter Card Details</h3>
                    <div className="checkout-input-group">
                      <input
                        type="text"
                        placeholder="Card Number"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(formatCard(e.target.value))}
                        className="checkout-input"
                        maxLength={19}
                        autoFocus
                      />
                      <CreditCard size={18} color="#94a3b8" />
                    </div>
                    <div className="checkout-input-row">
                      <div className="checkout-input-group" style={{ flex: 1 }}>
                        <input
                          type="text"
                          placeholder="MM/YY"
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                          className="checkout-input"
                          maxLength={5}
                        />
                      </div>
                      <div className="checkout-input-group" style={{ flex: 1 }}>
                        <input
                          type="password"
                          placeholder="CVV"
                          value={cardCvv}
                          onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          className="checkout-input"
                          maxLength={4}
                        />
                      </div>
                    </div>
                    <div className="checkout-input-group">
                      <input
                        type="text"
                        placeholder="Name on Card"
                        value={cardName}
                        onChange={(e) => setCardName(e.target.value)}
                        className="checkout-input"
                      />
                    </div>
                  </div>
                )}

                {method === 'netbanking' && (
                  <div className="checkout-form">
                    <h3 className="checkout-section-title">Select Your Bank</h3>
                    <div className="checkout-bank-grid">
                      {BANKS.map(bank => (
                        <button
                          key={bank}
                          className={`checkout-bank-btn ${selectedBank === bank ? 'active' : ''}`}
                          onClick={() => setSelectedBank(bank)}
                        >
                          <div className="checkout-bank-icon">{bank[0]}</div>
                          <span>{bank}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {method === 'wallet' && (
                  <div className="checkout-form">
                    <h3 className="checkout-section-title">Select Wallet</h3>
                    <div className="checkout-bank-grid">
                      {WALLETS.map(wallet => (
                        <button
                          key={wallet}
                          className={`checkout-bank-btn ${selectedWallet === wallet ? 'active' : ''}`}
                          onClick={() => setSelectedWallet(wallet)}
                        >
                          <div className="checkout-bank-icon">{wallet[0]}</div>
                          <span>{wallet}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  className="checkout-pay-btn"
                  disabled={!canProceed()}
                  onClick={handlePay}
                >
                  <Lock size={14} />
                  Pay ₹{payment.amount.toLocaleString('en-IN')}
                </button>
              </>
            )}

            {/* Security Footer */}
            <div className="checkout-security">
              <ShieldCheck size={14} color="#16a34a" />
              <span>Secured by Razorpay · 256-bit SSL encryption</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
