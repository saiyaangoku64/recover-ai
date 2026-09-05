import { useCallback, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Brain,
  Cpu,
  Download,
  Play,
  ShieldCheck,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import { useRecovery } from '../context/RecoveryContext';
import { inspectPolicyRules } from '../engine/policy';
import { toWords } from '../format';
import { useEscape } from '../hooks/useEscape';
import { WhatIfSimulator } from './WhatIfSimulator';

type Tab = 'architecture' | 'rewrite' | 'sarvam' | 'simulator';

export function CognitiveInspector() {
  const {
    inspectorOpen,
    closeInspector,
    inspectorNote,
    selectedPayment,
    payments,
    results,
    policyConfig,
    sarvamKey,
    sarvamVoice,
    setSarvamVoice,
    sarvamLoading,
    sarvamPlaying,
    sarvamAudioProgress,
    sarvamAudioUrl,
    handlePlaySarvamVoice,
  } = useRecovery();

  const [tab, setTab] = useState<Tab>('architecture');
  const [closing, setClosing] = useState(false);
  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      closeInspector();
    }, 200);
  }, [closeInspector]);
  useEscape(close, inspectorOpen);

  if (!inspectorOpen) return null;

  const payment = selectedPayment || payments[0];
  const result = payment ? results.get(payment.id) : undefined;
  const rules = payment ? inspectPolicyRules(payment, result?.llm, policyConfig) : [];
  const firstName = payment?.customer_name.split(' ')[0] ?? 'Customer';
  const amount = payment?.amount ?? 0;

  const trace = payment
    ? `[INGEST] ${payment.id} · ₹${amount.toLocaleString('en-IN')} · ${payment.method.toUpperCase()} · ${payment.failure_reason}
[CUSTOMER] ${payment.customer_name} · ${payment.previous_successes} prior successes · ${payment.retry_count} retries · ${payment.days_since_failure}d stale
[MODEL] ${result ? result.llm.reason : 'Not evaluated yet — run Inspect on a payment first.'}
[POLICY]
${rules.map((r) => `  - ${r.label}: ${r.passed === false ? 'FAIL' : r.passed === true ? 'PASS' : 'PENDING'} (${r.detail})`).join('\n')}
[OUTCOME] ${result ? `${result.audit.decision} · policy ${result.policy.result} · ${result.policy.reason}` : 'pending'}`
    : 'Select a payment to inspect.';

  return (
    <div className={`cognitive-modal-overlay ${closing ? 'closing' : ''}`} onClick={close}>
      <div
        className={`cognitive-modal ${closing ? 'closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="inspector-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cognitive-modal-header">
          <div className="cognitive-header-left">
            <div className="cognitive-icon" aria-hidden>
              <Brain size={22} color="#ffffff" />
            </div>
            <div>
              <div id="inspector-title" className="inspector-title">Decision inspector</div>
              <div className="inspector-sub">
                {inspectorNote || 'Real model reason + live policy rules'}
              </div>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={close} aria-label="Close inspector">
            <X size={18} />
          </button>
        </div>

        <div className="cognitive-modal-nav">
          {([
            ['architecture', 'Reasoning'],
            ['rewrite', 'Message preview'],
            ['sarvam', 'Voice'],
            ['simulator', 'What-if'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`cognitive-nav-tab ${tab === id ? 'active' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="cognitive-modal-body">
          {tab === 'architecture' && (
            <>
              <div className="flow-diagram">
                <div className="flow-node active">
                  <span className="flow-node-step"><Activity size={11} /> Signals</span>
                  <span className="flow-node-title">Failed payment</span>
                  <span className="flow-node-desc">Amount, method, failure code, loyalty, retry count.</span>
                </div>
                <div className="flow-node active">
                  <span className="flow-node-step"><Cpu size={11} /> Reason</span>
                  <span className="flow-node-title">AI or heuristic</span>
                  <span className="flow-node-desc">retry / PTP / reminder / none + expected value.</span>
                </div>
                <div className="flow-node active">
                  <span className="flow-node-step"><ShieldCheck size={11} /> Gate</span>
                  <span className="flow-node-title">Policy bounds</span>
                  <span className="flow-node-desc">Same six rules as the Policy page.</span>
                </div>
                <div className="flow-node active">
                  <span className="flow-node-step"><ArrowRight size={11} /> Route</span>
                  <span className="flow-node-title">Channel</span>
                  <span className="flow-node-desc">Auto-retry, WhatsApp, voice, or abstain.</span>
                </div>
              </div>
              <div className="cot-box">
                <div className="cot-header">
                  <span>INTERNAL TRACE</span>
                  <span>{result?.source === 'ai' ? 'openai/gpt-oss-20b' : 'heuristic'}</span>
                </div>
                <div className="cot-stream">{trace}</div>
              </div>
            </>
          )}

          {tab === 'rewrite' && payment && (
            <div className="rewrite-grid">
              <div className="rewrite-card">
                <span className="rewrite-tag bad">Raw</span>
                <div className="rewrite-text">
                  Your payment of ₹{amount.toLocaleString('en-IN')} failed due to {toWords(payment.failure_reason)}. Pay immediately or your subscription will be cancelled.
                </div>
              </div>
              <div className="rewrite-card">
                <span className="rewrite-tag mid">Neutral</span>
                <div className="rewrite-text">
                  Hi {firstName}, we noticed your transaction didn't go through. Here is a link to retry. Thank you.
                </div>
              </div>
              <div className="rewrite-card recommended">
                <span className="rewrite-tag best">Recovery copy</span>
                <div className="rewrite-text">
                  Namaste {firstName} ji! Aapka ₹{amount.toLocaleString('en-IN')} ka payment bank issue ki wajah se ruk gaya tha. Aapke previous payments ke record ko dekhte hue service active rakhi hai. Aap 48 ghante me secure link se pay kar sakte hain.
                </div>
              </div>
            </div>
          )}

          {tab === 'sarvam' && (
            <div className="sarvam-voice-box">
              <div className="sarvam-top-row">
                <div className="sarvam-brand">
                  <Volume2 size={24} color="#34d399" />
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>Sarvam AI text-to-speech</div>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>bulbul:v3 · Hindi female voices</div>
                  </div>
                </div>
                <span className="sarvam-chip">{sarvamKey ? 'API connected' : 'Browser TTS fallback'}</span>
              </div>
              <div className="sarvam-controls-row">
                <button
                  type="button"
                  className={`sarvam-play-btn ${sarvamPlaying ? 'speaking' : ''}`}
                  onClick={() => handlePlaySarvamVoice(payment)}
                  disabled={sarvamLoading}
                >
                  {sarvamLoading ? 'Synthesizing…' : sarvamPlaying ? <><Square size={14} fill="#ffffff" /> Stop</> : <><Play size={14} fill="#ffffff" /> Generate & speak</>}
                </button>
                <div className="voice-select-wrap">
                  <span>Voice</span>
                  <select className="voice-select" value={sarvamVoice} onChange={(e) => setSarvamVoice(e.target.value as typeof sarvamVoice)}>
                    <option value="kavya">Kavya</option>
                    <option value="simran">Simran</option>
                    <option value="neha">Neha</option>
                    <option value="priya">Priya</option>
                  </select>
                </div>
              </div>
              {sarvamAudioProgress > 0 && (
                <div className="audio-progress-track">
                  <div style={{ width: `${sarvamAudioProgress}%` }} />
                </div>
              )}
              {sarvamAudioUrl && (
                <a href={sarvamAudioUrl} download="sarvam_recovery_audio.wav" className="download-audio">
                  <Download size={12} /> Download WAV
                </a>
              )}
            </div>
          )}

          {tab === 'simulator' && <WhatIfSimulator config={policyConfig} />}
        </div>
      </div>
    </div>
  );
}
