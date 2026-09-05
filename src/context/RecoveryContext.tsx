import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AuditEvent, Payment, PolicyConfig, RecoveryResult } from '../types';
import { computeBaseline, type BaselineResult } from '../engine/baseline';
import { evaluatePayment } from '../engine/recovery';
import { hydrateBatch } from '../engine/hydrate';
import { DEFAULT_POLICY } from '../engine/policy';
import { fetchAuditEvents, updatePTPStatus, writeAuditEvent } from '../lib/supabase';
import { createPaymentsSource } from '../lib/payments';
import { loadPolicyConfig, savePolicyConfig } from '../lib/policyStore';
import { speakHinglish } from '../engine/voice';
import { generateSarvamVoice, playSarvamAudio, stopSarvamAudio, type SarvamFemaleVoice } from '../engine/sarvam';
import { useAuth } from './AuthContext';

export interface ReviveStats {
  recovered: number;
  blocked: number;
  actioned: number;
  ptpCount: number;
  ptpValue: number;
  pendingPtpValue: number;
  total: number;
  retry: number;
  whatsapp: number;
  voice: number;
  none: number;
  blockedAmount: number;
  interchangeSaved: number;
  naiveWastedRetries: number;
}

interface RecoveryContextValue {
  payments: Payment[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  sourceLabel: string;
  sourceId: 'json' | 'razorpay';
  merchantId: string | undefined;

  selectedPayment: Payment | null;
  setSelectedPayment: (p: Payment | null) => void;
  results: Map<string, RecoveryResult>;
  evaluating: Set<string>;
  auditLog: AuditEvent[];
  refreshAudit: () => Promise<void>;

  searchQuery: string;
  setSearchQuery: (q: string) => void;
  tableFilter: 'all' | 'soft' | 'hard' | 'ptp';
  setTableFilter: (f: 'all' | 'soft' | 'hard' | 'ptp') => void;
  checkedIds: Set<string>;
  toggleChecked: (id: string) => void;
  clearChecked: () => void;

  waModalPayment: Payment | null;
  setWaModalPayment: (p: Payment | null) => void;
  inspectorOpen: boolean;
  inspectorNote: string | null;
  openInspector: (note?: string) => void;
  closeInspector: () => void;

  policyConfig: PolicyConfig;
  savePolicy: (config: PolicyConfig) => Promise<void>;

  baseline: BaselineResult | null;
  reviveStats: ReviveStats;
  lastEvaluatedAt: Date | null;

  batchRunning: boolean;
  batchProgress: number;
  batchRecovered: number;
  runBatch: () => Promise<void>;
  cancelBatch: () => void;

  handleEvaluate: (p: Payment, opts?: { openDrawer?: boolean; force?: boolean }) => Promise<void>;
  evaluateSelected: () => Promise<void>;
  handlePTP: (paymentId: string, status: 'kept' | 'broken') => Promise<void>;
  setPaymentStatus: (paymentId: string, status: Payment['status']) => void;

  openrouterKey: string;
  sarvamKey: string;
  sarvamVoice: SarvamFemaleVoice;
  setSarvamVoice: (v: SarvamFemaleVoice) => void;
  sarvamLoading: boolean;
  sarvamPlaying: boolean;
  sarvamAudioProgress: number;
  sarvamAudioUrl: string | null;
  handlePlaySarvamVoice: (target?: Payment) => Promise<void>;
}

const RecoveryContext = createContext<RecoveryContextValue | null>(null);

export function RecoveryProvider({ children }: { children: ReactNode }) {
  const { operator } = useAuth();
  const paymentsSource = useMemo(() => createPaymentsSource(), []);

  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [results, setResults] = useState<Map<string, RecoveryResult>>(new Map());
  const [evaluating, setEvaluating] = useState<Set<string>>(new Set());
  const [auditLog, setAuditLog] = useState<AuditEvent[]>([]);
  const [lastEvaluatedAt, setLastEvaluatedAt] = useState<Date | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [tableFilter, setTableFilter] = useState<'all' | 'soft' | 'hard' | 'ptp'>('all');
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const [waModalPayment, setWaModalPayment] = useState<Payment | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorNote, setInspectorNote] = useState<string | null>(null);

  const [policyConfig, setPolicyConfig] = useState<PolicyConfig>(DEFAULT_POLICY);

  const [sarvamVoice, setSarvamVoice] = useState<SarvamFemaleVoice>('kavya');
  const [sarvamLoading, setSarvamLoading] = useState(false);
  const [sarvamPlaying, setSarvamPlaying] = useState(false);
  const [sarvamAudioProgress, setSarvamAudioProgress] = useState(0);
  const [sarvamAudioUrl, setSarvamAudioUrl] = useState<string | null>(null);

  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchRecovered, setBatchRecovered] = useState(0);
  const batchAbort = useRef(false);

  const openrouterKey = import.meta.env.VITE_OPENROUTER_API_KEY || '';
  const sarvamKey = import.meta.env.VITE_SARVAM_API_KEY || '';
  const merchantId = operator?.merchantId ?? 'local-demo';

  const loadPayments = useCallback(() => {
    setLoading(true);
    setError(null);
    paymentsSource
      .listFailed()
      .then((d) => {
        setPayments(d);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, [paymentsSource]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments, reloadToken]);

  useEffect(() => {
    loadPolicyConfig(merchantId).then(setPolicyConfig);
  }, [merchantId]);

  useEffect(() => {
    if (payments.length === 0) return;
    setResults((prev) => hydrateBatch(payments, policyConfig, merchantId, prev));
    setLastEvaluatedAt(new Date());
  }, [payments, policyConfig, merchantId]);

  const refreshAudit = useCallback(async () => {
    const events = await fetchAuditEvents(merchantId);
    setAuditLog(events);
  }, [merchantId]);

  useEffect(() => {
    refreshAudit();
  }, [refreshAudit, results]);

  const baseline = useMemo(
    () => (payments.length > 0 ? computeBaseline(payments) : null),
    [payments],
  );

  const reviveStats = useMemo<ReviveStats>(() => {
    let recovered = 0;
    let blocked = 0;
    let actioned = 0;
    let ptpCount = 0;
    let ptpValue = 0;
    let pendingPtpValue = 0;
    let retry = 0;
    let whatsapp = 0;
    let voice = 0;
    let none = 0;
    let blockedAmount = 0;
    let naiveWastedRetries = 0;

    results.forEach((r) => {
      if (r.policy.result === 'blocked') {
        blocked++;
        blockedAmount += r.payment.amount;
        if (baseline?.decisions.get(r.payment.id) === 'would_retry') naiveWastedRetries++;
      }
      if (r.audit.expected_recovery > 0) {
        recovered += r.audit.expected_recovery;
        actioned++;
      }
      if (r.audit.decision === 'promise_to_pay') {
        ptpCount++;
        ptpValue += r.audit.expected_recovery;
        if (r.audit.ptp_status === 'pending' || r.audit.ptp_status === null) {
          pendingPtpValue += r.audit.expected_recovery;
        }
      }
      const channel = r.audit.recovery_channel;
      if (r.policy.result === 'blocked' || r.audit.decision === 'none') none++;
      else if (channel === 'voice') voice++;
      else if (channel === 'whatsapp' || r.audit.decision === 'send_reminder' || r.audit.decision === 'promise_to_pay') whatsapp++;
      else if (r.audit.decision === 'retry' || channel === 'auto_retry') retry++;
      else none++;
    });

    return {
      recovered,
      blocked,
      actioned,
      ptpCount,
      ptpValue,
      pendingPtpValue,
      total: results.size,
      retry,
      whatsapp,
      voice,
      none,
      blockedAmount,
      interchangeSaved: Math.round(blockedAmount * 0.018),
      naiveWastedRetries,
    };
  }, [results, baseline]);

  const handleEvaluate = useCallback(
    async (p: Payment, opts?: { openDrawer?: boolean; force?: boolean }) => {
      if (opts?.openDrawer !== false) setSelectedPayment(p);
      if ((results.has(p.id) && !opts?.force) || evaluating.has(p.id)) return;

      setEvaluating((prev) => new Set(prev).add(p.id));
      try {
        const result = await evaluatePayment(
          p,
          openrouterKey,
          openrouterKey ? 'ai' : 'heuristic',
          policyConfig,
          merchantId,
          payments,
        );
        setResults((prev) => new Map(prev).set(p.id, result));
        setLastEvaluatedAt(new Date());
        try {
          await writeAuditEvent(result.audit);
        } catch {
          console.warn('Audit write failed — decision stored locally');
        }
      } catch (err) {
        console.warn('Evaluation fallback:', err);
        const result = await evaluatePayment(p, '', 'heuristic', policyConfig, merchantId, payments);
        setResults((prev) => new Map(prev).set(p.id, result));
        setLastEvaluatedAt(new Date());
        try {
          await writeAuditEvent(result.audit);
        } catch {
          console.warn('Audit write failed for heuristic fallback');
        }
      } finally {
        setEvaluating((prev) => {
          const s = new Set(prev);
          s.delete(p.id);
          return s;
        });
      }
    },
    [results, evaluating, openrouterKey, policyConfig, merchantId, payments],
  );

  const evaluateSelected = useCallback(async () => {
    const selected = payments.filter((p) => checkedIds.has(p.id));
    for (const p of selected) {
      await handleEvaluate(p, { openDrawer: false });
    }
  }, [payments, checkedIds, handleEvaluate]);

  const runBatch = useCallback(async () => {
    setBatchRunning(true);
    batchAbort.current = false;
    setBatchProgress(0);
    setBatchRecovered(0);

    let recovered = 0;
    const AI_LIMIT = 8;
    let aiCalls = 0;
    const batchResults = new Map<string, RecoveryResult>();

    for (let i = 0; i < payments.length; i++) {
      if (batchAbort.current) break;
      const p = payments[i];

      const useAI = Boolean(openrouterKey) && aiCalls < AI_LIMIT;
      if (useAI) aiCalls++;
      try {
        const res = await evaluatePayment(
          p,
          openrouterKey,
          useAI ? 'ai' : 'heuristic',
          policyConfig,
          merchantId,
          payments,
        );
        batchResults.set(p.id, res);
        setResults((prev) => new Map(prev).set(p.id, res));
        recovered += res.audit.expected_recovery;
        if (useAI || i < 5) {
          try { await writeAuditEvent(res.audit); } catch { /* decision stored */ }
        }
      } catch {
        const res = await evaluatePayment(p, '', 'heuristic', policyConfig, merchantId, payments);
        batchResults.set(p.id, res);
        setResults((prev) => new Map(prev).set(p.id, res));
        recovered += res.audit.expected_recovery;
      }

      setBatchRecovered(recovered);
      setBatchProgress(((i + 1) / payments.length) * 100);
      setLastEvaluatedAt(new Date());
      if (i % 8 === 0) await new Promise((r) => setTimeout(r, 12));
    }

    setBatchRunning(false);
    refreshAudit();
  }, [payments, openrouterKey, policyConfig, merchantId, refreshAudit]);

  const cancelBatch = useCallback(() => {
    batchAbort.current = true;
  }, []);

  const handlePlaySarvamVoice = useCallback(
    async (targetPayment?: Payment) => {
      if (sarvamPlaying) {
        stopSarvamAudio();
        setSarvamPlaying(false);
        return;
      }

      const p = targetPayment || selectedPayment || payments[0];
      if (!p) return;

      const hindiScriptMessage = `नमस्ते ${p.customer_name} जी, रेज़रपे की तरफ से आपका ${p.amount} रुपये का पेमेंट बैंक सर्वर की तकनीकी दिक्कत की वजह से पूरा नहीं हो पाया। आपके अच्छे पेमेंट रिकॉर्ड को देखते हुए आपकी सर्विस चालू रखी गई है। हमने आपके लिए एक सुरक्षित पेमेंट लिंक भेजा है जो अगले अड़तालीस घंटे तक चालू रहेगा। जब भी बैंक सर्वर ठीक हो, आप आसानी से इसे पूरा कर सकते हैं। धन्यवाद!`;

      if (!sarvamKey) {
        speakHinglish(hindiScriptMessage);
        return;
      }

      setSarvamLoading(true);
      try {
        const { audioUrl } = await generateSarvamVoice(hindiScriptMessage, sarvamKey, sarvamVoice, 1.0);
        setSarvamAudioUrl(audioUrl);
        setSarvamLoading(false);
        setSarvamPlaying(true);
        setSarvamAudioProgress(0);

        await playSarvamAudio(
          audioUrl,
          (progress) => setSarvamAudioProgress(progress),
          () => {
            setSarvamPlaying(false);
            setSarvamAudioProgress(0);
          },
        );
      } catch (err) {
        console.warn('Sarvam API call failed, falling back to local speech:', err);
        setSarvamLoading(false);
        setSarvamPlaying(false);
        speakHinglish(hindiScriptMessage);
      }
    },
    [sarvamPlaying, selectedPayment, payments, sarvamKey, sarvamVoice],
  );

  const handlePTP = useCallback(
    async (pId: string, status: 'kept' | 'broken') => {
      await updatePTPStatus(pId, status);
      setResults((prev) => {
        const next = new Map(prev);
        const cur = next.get(pId);
        if (cur) {
          next.set(pId, { ...cur, audit: { ...cur.audit, ptp_status: status } });
        }
        return next;
      });
      await refreshAudit();
    },
    [refreshAudit],
  );

  const setPaymentStatus = useCallback(
    (paymentId: string, status: Payment['status']) => {
      setPayments(prev => prev.map(p => p.id === paymentId ? { ...p, status } : p));
    },
    [],
  );

  const toggleChecked = useCallback((id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const savePolicy = useCallback(
    async (config: PolicyConfig) => {
      setPolicyConfig(config);
      await savePolicyConfig(merchantId, config);
    },
    [merchantId],
  );

  const openInspector = useCallback((note?: string) => {
    if (note) setInspectorNote(note);
    setInspectorOpen(true);
  }, []);

  const value: RecoveryContextValue = {
    payments,
    loading,
    error,
    reload: () => setReloadToken((n) => n + 1),
    sourceLabel: paymentsSource.label,
    sourceId: paymentsSource.id,
    merchantId,
    selectedPayment,
    setSelectedPayment,
    results,
    evaluating,
    auditLog,
    refreshAudit,
    searchQuery,
    setSearchQuery,
    tableFilter,
    setTableFilter,
    checkedIds,
    toggleChecked,
    clearChecked: () => setCheckedIds(new Set()),
    waModalPayment,
    setWaModalPayment,
    inspectorOpen,
    inspectorNote,
    openInspector,
    closeInspector: () => setInspectorOpen(false),
    policyConfig,
    savePolicy,
    baseline,
    reviveStats,
    lastEvaluatedAt,
    batchRunning,
    batchProgress,
    batchRecovered,
    runBatch,
    cancelBatch,
    handleEvaluate,
    evaluateSelected,
    handlePTP,
    setPaymentStatus,
    openrouterKey,
    sarvamKey,
    sarvamVoice,
    setSarvamVoice,
    sarvamLoading,
    sarvamPlaying,
    sarvamAudioProgress,
    sarvamAudioUrl,
    handlePlaySarvamVoice,
  };

  return <RecoveryContext.Provider value={value}>{children}</RecoveryContext.Provider>;
}

export function useRecovery() {
  const ctx = useContext(RecoveryContext);
  if (!ctx) throw new Error('useRecovery must be used within RecoveryProvider');
  return ctx;
}
