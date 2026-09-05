import { useState, useEffect, useRef, useCallback } from 'react';
import { useEscape } from '../hooks/useEscape';
import type { Payment } from '../types';
import { IconVerified } from './Icons';
import { generateSarvamVoice, playSarvamAudio, stopSarvamAudio, type SarvamFemaleVoice } from '../engine/sarvam';
import { updatePTPStatus } from '../lib/supabase';
import { useRecovery } from '../context/RecoveryContext';
import {
  Phone,
  Video,
  MoreVertical,
  X,
  Lock,
  Play,
  Pause,
  Volume2,
  Clock,
  CheckCheck,
  CheckCircle2,
  Loader2,
  CreditCard,
  Sparkles,
  ShieldCheck,
  Send
} from 'lucide-react';

interface WhatsAppSimulatorProps {
  payment: Payment;
  onClose: () => void;
  onPTPRecorded?: (paymentId: string) => void;
}

export function WhatsAppSimulator({ payment, onClose, onPTPRecorded }: WhatsAppSimulatorProps) {
  const close = useCallback(() => onClose(), [onClose]);
  useEscape(close);
  const { sarvamVoice, setSarvamVoice, setPaymentStatus } = useRecovery();
  const [sarvamLoading, setSarvamLoading] = useState(false);
  const [sarvamPlaying, setSarvamPlaying] = useState(false);
  const [sarvamProgress, setSarvamProgress] = useState(0);
  const [sarvamHasPlayed, setSarvamHasPlayed] = useState(false);
  const [voiceScriptIdx, setVoiceScriptIdx] = useState(0);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Interactive Chat State
  const [messages, setMessages] = useState<Array<{
    id: string;
    sender: 'biz' | 'user';
    text: string;
    time: string;
    card?: boolean;
    voice?: boolean;
  }>>([
    {
      id: 'm1',
      sender: 'biz',
      text: '',
      time: '10:14 am',
      voice: true,
    },
    {
      id: 'm2',
      sender: 'biz',
      text: `Namaste ${payment.customer_name.split(' ')[0]} ji! Aapka ₹${payment.amount.toLocaleString('en-IN')} ka payment ${payment.merchant || 'Razorpay Merchant'} ke liye bank network glitch ki wajah se pending hai. Aapke loyal payment history ko dekhte hue, humne aapki service active rakhi hai.`,
      time: '10:14 am',
      card: true,
    },
    {
      id: 'm3',
      sender: 'user',
      text: 'Haan ji, kal tak payment clear kar dunga. Thank you!',
      time: '10:15 am',
    },
    {
      id: 'm4',
      sender: 'biz',
      text: `Dhanyavaad ${payment.customer_name.split(' ')[0]} ji! Humne aapka Promise-to-Pay (PTP) record kar liya hai. Kal subah reminder bhejenge. Services will remain active!`,
      time: '10:15 am',
    }
  ]);

  const [ptpRegistered, setPtpRegistered] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [inputReply, setInputReply] = useState('');

  // In-phone checkout sheet state
  const [payStep, setPayStep] = useState<'closed' | 'form' | 'processing' | 'done'>('closed');
  const [payTab, setPayTab] = useState<'upi' | 'card'>('upi');
  const [upiId, setUpiId] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [processingText, setProcessingText] = useState('Contacting your bank…');
  const [txnId, setTxnId] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const sarvamKey = import.meta.env.VITE_SARVAM_API_KEY || '';

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Clean up audio and intervals on unmount
  useEffect(() => {
    return () => {
      stopSarvamAudio();
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const voiceScripts = [
    `नमस्ते ${payment.customer_name} जी, रेज़रपे की तरफ से आपका ₹${payment.amount.toLocaleString('en-IN')} का पेमेंट बैंक सर्वर की तकनीकी दिक्कत की वजह से पूरा नहीं हो पाया। आपके अच्छे पेमेंट रिकॉर्ड को देखते हुए आपकी सर्विस चालू रखी गई है।`,
    `हैलो ${payment.customer_name} जी! आपका ₹${payment.amount.toLocaleString('en-IN')} का पेमेंट पेंडिंग है। हमने आपके लिए एक सुरक्षित पेमेंट लिंक भेजा है जो अगले 48 घंटे तक चालू रहेगा।`,
    `नमस्ते ${payment.customer_name} जी, आपका पेमेंट अभी भी बकाया है। कृपया जल्द से जल्द भुगतान करें ताकि आपकी सेवाएं बिना रुके चलती रहें।`,
  ];

  const handleToggleVoice = async () => {
    if (sarvamPlaying) {
      stopSarvamAudio();
      setSarvamPlaying(false);
      setSarvamProgress(0);
      return;
    }

    const script = voiceScripts[voiceScriptIdx % voiceScripts.length];
    setVoiceScriptIdx(prev => prev + 1);

    if (!sarvamKey) {
      showToast('Sarvam API key not detected. Simulating speech playback.');
      setSarvamPlaying(true);
      setSarvamHasPlayed(true);
      let p = 0;
      progressInterval.current = setInterval(() => {
        p += 3;
        setSarvamProgress(p);
        if (p >= 100) {
          if (progressInterval.current) clearInterval(progressInterval.current);
          progressInterval.current = null;
          setSarvamPlaying(false);
          setSarvamProgress(0);
        }
      }, 200);
      return;
    }

    setSarvamLoading(true);
    try {
      const { audioUrl } = await generateSarvamVoice(script, sarvamKey, sarvamVoice, 1.0);
      setSarvamLoading(false);
      setSarvamPlaying(true);
      setSarvamHasPlayed(true);
      setSarvamProgress(0);

      await playSarvamAudio(
        audioUrl,
        (progress) => setSarvamProgress(progress),
        () => {
          setSarvamPlaying(false);
          setSarvamProgress(0);
        }
      );
    } catch (err) {
      console.warn('Sarvam voice failed:', err);
      setSarvamLoading(false);
      setSarvamPlaying(false);
      showToast('Neural audio generation failed. Please check network.');
    }
  };

  const handleCycleVoice = () => {
    const voices: SarvamFemaleVoice[] = ['kavya', 'simran', 'neha', 'priya'];
    const idx = voices.indexOf(sarvamVoice);
    setSarvamVoice(voices[(idx + 1) % voices.length]);
  };

  // Quick Action: Promise to Pay (simulation only — does not write audit)
  const handlePromiseToPay = async () => {
    if (ptpRegistered) return;
    setPtpRegistered(true);

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setMessages(prev => [
      ...prev,
      {
        id: `ptp-${Date.now()}`,
        sender: 'user',
        text: 'I promise to complete this payment by tomorrow 11:00 AM.',
        time: timeStr
      },
      {
        id: `ptp-rep-${Date.now() + 1}`,
        sender: 'biz',
        text: 'Noted! Your grace period has been extended by 24 hours. Razorpay will send a polite reminder tomorrow morning.',
        time: timeStr
      }
    ]);

    try {
      await updatePTPStatus(payment.id, 'pending');
      showToast('PTP recorded in state — use the drawer for real audit writes');
      onPTPRecorded?.(payment.id);
    } catch {
      showToast('Promise-to-Pay captured locally.');
    }
  };

  // Quick Action: Complete Payment Now — opens the in-phone checkout sheet
  const handlePayNow = () => {
    setPayStep('form');
  };

  const canSheetPay = () => {
    if (payTab === 'upi') return upiId.includes('@');
    return (
      cardNumber.replace(/\s/g, '').length >= 12 &&
      cardExpiry.replace(/\D/g, '').length >= 4 &&
      cardCvv.length >= 3
    );
  };

  const handleSheetPay = async () => {
    if (!canSheetPay()) return;
    const txn = `pay_${Date.now().toString(36).toUpperCase()}`;
    setTxnId(txn);
    setPayStep('processing');
    setProcessingText(payTab === 'upi' ? 'Sending collect request…' : 'Contacting your bank…');
    await new Promise((r) => setTimeout(r, 1100));
    setProcessingText('Confirming payment…');
    await new Promise((r) => setTimeout(r, 1100));

    setPaymentStatus(payment.id, 'recovered');
    setPtpRegistered(true);
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages((prev) => [
      ...prev,
      {
        id: `paid-${Date.now()}`,
        sender: 'biz',
        text: `Payment of ₹${payment.amount.toLocaleString('en-IN')} received — dhanyavaad ${payment.customer_name.split(' ')[0]} ji! Receipt: ${txn}.`,
        time: timeStr,
      },
    ]);
    try {
      await updatePTPStatus(payment.id, 'kept');
      onPTPRecorded?.(payment.id);
    } catch {
      /* local-only */
    }
    setPayStep('done');
  };

  const handleSheetDone = () => {
    setPayStep('closed');
    showToast('Payment recovered');
  };

  // Send custom reply
  const handleSendCustomReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputReply.trim()) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const text = inputReply.trim();
    setInputReply('');

    setMessages(prev => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        sender: 'user',
        text,
        time: timeStr
      }
    ]);

    // AI automated reply
    setTimeout(() => {
      setMessages(prev => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          sender: 'biz',
          text: `Thank you for the update! Our automated agent has updated your account state. If you need anything else, feel free to reply anytime.`,
          time: timeStr
        }
      ]);
    }, 900);
  };

  return (
    <div className="wa-overlay" onClick={close}>
      <div
        className="wa-phone-device"
        role="dialog"
        aria-modal="true"
        aria-label="WhatsApp recovery preview"
        onClick={(e) => e.stopPropagation()}
      >

        {/* Device Speaker Notch */}
        <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 68, height: 4.5, background: '#0f172a', borderRadius: 4, zIndex: 10 }} />

        {/* WhatsApp App Bar Header */}
        <div className="wa-app-bar">
          <div className="wa-contact-info">
            <div className="wa-avatar-badge">
              <span className="wa-avatar-initial">{(payment.merchant || 'M')[0]}</span>
            </div>
            <div className="wa-name-col">
              <div className="wa-verified-title">
                <span>{payment.merchant || 'Merchant'} Support</span>
                <IconVerified width="14" height="14" />
              </div>
              <div className="wa-subtext">
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#25d366', marginRight: 4 }} />
                Online · replies instantly
              </div>
            </div>
          </div>

          <div className="wa-bar-actions">
            <button type="button" className="wa-icon-action" aria-label="Voice call"><Phone size={17} /></button>
            <button type="button" className="wa-icon-action" aria-label="Video call"><Video size={17} /></button>
            <button type="button" className="wa-icon-action" aria-label="More options"><MoreVertical size={17} /></button>
            <button type="button" className="wa-icon-action" onClick={close} aria-label="Close WhatsApp preview"><X size={18} /></button>
          </div>
        </div>

        {/* Chat Body Wallpaper Canvas */}
        <div className="wa-chat-canvas">

          {/* End-to-End Encryption Security Pill */}
          <div className="wa-encryption-pill">
            <Lock size={12} style={{ flexShrink: 0, color: '#b45309' }} />
            <span>Messages and calls are end-to-end encrypted. No one outside of this chat can read or listen to them.</span>
          </div>

          {/* Date Stamp */}
          <div style={{ alignSelf: 'center', background: '#ffffff', color: '#54656f', fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 6, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
            TODAY
          </div>

          {/* Render Messages */}
          {messages.map((m) => (
            <div key={m.id} className={`wa-bubble ${m.sender === 'biz' ? 'received' : 'sent'}`}>

              {/* Voice Note Bubble */}
              {m.voice && (
                <div className="wa-audio-bubble">
                  <button
                    className="wa-audio-play-round"
                    onClick={() => handleToggleVoice()}
                    disabled={sarvamLoading}
                    title="Play Sarvam AI Neural Hindi Voice"
                  >
                    {sarvamLoading ? (
                      <span className="spinner-sm" style={{ width: 14, height: 14 }} />
                    ) : sarvamPlaying ? (
                      <Pause size={16} fill="#ffffff" />
                    ) : (
                      <Play size={16} fill="#ffffff" />
                    )}
                  </button>

                  <div className="wa-audio-track-col">
                    <div className="wa-waveform-bars">
                      {Array.from({ length: 32 }, (_, idx) => {
                        const heights = [6, 12, 16, 9, 14, 18, 11, 15, 8, 17, 13, 10, 16, 12, 14, 7, 15, 11, 13, 16, 10, 14, 8, 12, 15, 9, 13, 11, 7, 14, 10, 8];
                        const h = heights[idx % heights.length];
                        const isPlayed = (idx / 32) <= (sarvamProgress / 100);
                        return (
                          <div
                            key={idx}
                            className={`wa-wave-bar ${isPlayed ? 'played' : ''}`}
                            style={{
                              height: `${h}px`,
                              transitionDelay: sarvamPlaying ? `${idx * 8}ms` : '0ms',
                            }}
                          />
                        );
                      })}
                    </div>

                    <div className="wa-audio-info-row">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Volume2 size={10} color="#008069" />
                        <strong>Sarvam AI: {sarvamVoice.charAt(0).toUpperCase() + sarvamVoice.slice(1)} (Hindi)</strong>
                      </span>
                      <span>{sarvamPlaying ? `${Math.round(sarvamProgress * 0.28)}s / 28s` : sarvamHasPlayed ? '✓ Played' : '0:28'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Standard Message Text */}
              {m.text && <div style={{ wordBreak: 'break-word' }}>{m.text}</div>}

              {/* Embedded Razorpay Payment Card */}
              {m.card && (
                <div className="wa-payment-embedded-card">
                  <div className="wa-pay-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ShieldCheck size={14} color="#34d399" />
                      <span>Secure checkout</span>
                    </div>
                    <span className="wa-pay-powered">REVIVE</span>
                  </div>

                  <div className="wa-pay-card-body">
                    <div className="wa-pay-merchant">{payment.merchant || 'Razorpay Merchant Store'}</div>
                    <div className="wa-pay-amount">₹{payment.amount.toLocaleString('en-IN')}</div>
                    <div className="wa-pay-expiry">
                      <Clock size={11} />
                      <span>Grace period valid for 48 hours</span>
                    </div>

                    <button
                      className="wa-pay-cta-btn"
                      onClick={handlePayNow}
                    >
                      Pay ₹{payment.amount.toLocaleString('en-IN')} →
                    </button>
                  </div>
                </div>
              )}

              {/* Timestamp & Ticks */}
              <div className="wa-time-meta">
                <span>{m.time}</span>
                <CheckCheck size={14} color="#53bdeb" />
              </div>
            </div>
          ))}

          <div ref={chatBottomRef} />
        </div>

        {/* Quick Action Suggestion Chips Bar */}
        <div className="wa-quick-actions-bar">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="wa-quick-label">Automated Recovery Actions</span>
          </div>

          <div className="wa-chips-row">
            <button
              className={`wa-chip-btn ptp-btn ${ptpRegistered ? 'active' : ''}`}
              onClick={handlePromiseToPay}
              title="Record customer Promise-to-Pay and save to Supabase"
            >
              <Sparkles size={12} color="#059669" />
              <span>{ptpRegistered ? '✓ PTP recorded' : 'Promise to Pay Tomorrow (PTP)'}</span>
            </button>

            <button
              className="wa-chip-btn"
              onClick={handlePayNow}
              title="Open secure checkout"
            >
              <CreditCard size={12} color="#3b66f5" />
              <span>Pay now</span>
            </button>

            <button
              className="wa-chip-btn"
              onClick={() => handleToggleVoice()}
            >
              <Volume2 size={12} color="#008069" />
              <span>{sarvamLoading ? 'Generating…' : sarvamPlaying ? 'Stop Audio' : sarvamHasPlayed ? 'Replay Voice' : 'Play Voice Note'}</span>
            </button>

            <button
              className="wa-chip-btn"
              onClick={handleCycleVoice}
              title="Switch voice personality"
              style={{ minWidth: 70 }}
            >
              <span style={{ textTransform: 'capitalize', fontSize: 10 }}>{sarvamVoice}</span>
            </button>
          </div>
        </div>

        {/* WhatsApp Bottom Text Input Bar */}
        <form onSubmit={handleSendCustomReply} style={{ background: '#f0f2f5', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid #d1d7db' }}>
          <input
            type="text"
            placeholder="Type a message or response..."
            value={inputReply}
            onChange={(e) => setInputReply(e.target.value)}
            style={{
              flex: 1,
              background: '#ffffff',
              border: 'none',
              borderRadius: 20,
              padding: '8px 14px',
              fontSize: 12,
              outline: 'none',
              color: '#111b21',
              boxShadow: '0 1px 2px rgba(0,0,0,0.06)'
            }}
          />
          <button
            type="submit"
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: '#008069',
              border: 'none',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0
            }}
            title="Send"
          >
            <Send size={15} />
          </button>
        </form>

        {/* In-phone checkout sheet */}
        {payStep !== 'closed' && (
          <div className="wa-sheet-scrim" onClick={() => { if (payStep === 'form') setPayStep('closed'); }}>
            <div className="wa-pay-sheet" onClick={(e) => e.stopPropagation()}>
              {payStep === 'form' && (
                <>
                  <div className="wa-sheet-grip" />
                  <div className="wa-sheet-merchant">
                    <div className="wa-sheet-avatar">{(payment.merchant || 'M')[0]}</div>
                    <div className="wa-sheet-merchant-info">
                      <strong>{payment.merchant || 'Merchant Store'}</strong>
                      <span>Order #{payment.id.slice(0, 8).toUpperCase()}</span>
                    </div>
                    <div className="wa-sheet-amount">₹{payment.amount.toLocaleString('en-IN')}</div>
                  </div>
                  <div className="wa-sheet-tabs">
                    <button
                      type="button"
                      className={`wa-sheet-tab ${payTab === 'upi' ? 'active' : ''}`}
                      onClick={() => setPayTab('upi')}
                    >
                      UPI
                    </button>
                    <button
                      type="button"
                      className={`wa-sheet-tab ${payTab === 'card' ? 'active' : ''}`}
                      onClick={() => setPayTab('card')}
                    >
                      Card
                    </button>
                  </div>
                  {payTab === 'upi' ? (
                    <>
                      <input
                        type="text"
                        className="wa-sheet-input"
                        placeholder="yourname@okhdfc"
                        value={upiId}
                        onChange={(e) => setUpiId(e.target.value.trim())}
                        autoFocus
                      />
                      <p className="wa-sheet-hint">A collect request will be sent to this UPI ID</p>
                    </>
                  ) : (
                    <>
                      <input
                        type="text"
                        className="wa-sheet-input"
                        placeholder="Card number"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim())}
                        maxLength={19}
                        autoFocus
                      />
                      <div className="wa-sheet-row">
                        <input
                          type="text"
                          className="wa-sheet-input"
                          placeholder="MM/YY"
                          value={cardExpiry}
                          onChange={(e) => {
                            const d = e.target.value.replace(/\D/g, '').slice(0, 4);
                            setCardExpiry(d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d);
                          }}
                          maxLength={5}
                        />
                        <input
                          type="password"
                          className="wa-sheet-input"
                          placeholder="CVV"
                          value={cardCvv}
                          onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          maxLength={4}
                        />
                      </div>
                    </>
                  )}
                  <button
                    type="button"
                    className="wa-sheet-pay"
                    disabled={!canSheetPay()}
                    onClick={handleSheetPay}
                  >
                    <Lock size={13} />
                    Pay ₹{payment.amount.toLocaleString('en-IN')}
                  </button>
                  <div className="wa-sheet-secure">
                    <ShieldCheck size={12} color="#25d366" />
                    <span>256-bit encrypted · powered by REVIVE</span>
                  </div>
                </>
              )}
              {payStep === 'processing' && (
                <div className="wa-sheet-status">
                  <Loader2 size={40} color="#008069" className="wa-spin" />
                  <strong>{processingText}</strong>
                  <span>Do not close this window</span>
                </div>
              )}
              {payStep === 'done' && (
                <div className="wa-sheet-status">
                  <CheckCircle2 size={52} color="#25d366" />
                  <strong>₹{payment.amount.toLocaleString('en-IN')} paid</strong>
                  <span>Receipt {txnId} · {payTab === 'upi' ? upiId : `Card ••${cardNumber.replace(/\s/g, '').slice(-4)}`}</span>
                  <button type="button" className="wa-sheet-pay" onClick={handleSheetDone}>
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Floating Toast Notification */}
        {toastMessage && (
          <div style={{
            position: 'absolute',
            bottom: 60,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#0f172a',
            color: '#ffffff',
            fontSize: 11,
            fontWeight: 600,
            padding: '7px 14px',
            borderRadius: 20,
            boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
            zIndex: 100,
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}>
            <Sparkles size={12} color="#34d399" />
            <span>{toastMessage}</span>
          </div>
        )}

      </div>
    </div>
  );
}
