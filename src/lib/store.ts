import { useState, useEffect } from 'react';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from './firebase';
import {
  User,
  Role,
  Competition,
  Category,
  Participant,
  Committee,
  JudgeProfile,
  ResultRecord,
  ReviewCase,
  Certificate,
  AuditEvent,
  JudgeEvent,
  JudgeEventType,
  JudgeSubmission,
  QuestionSelection,
  IncidentRecord,
  SimulationResult,
  AppealRecord
} from '../types';
import {
  SEED_ORGANIZATION,
  SEED_COMPETITION,
  SEED_USERS,
  SEED_COMMITTEES,
  SEED_JUDGES,
  SEED_PARTICIPANTS,
  SEED_REVIEW_CASES,
  SEED_RESULTS,
  SEED_CERTIFICATE,
  SEED_AUDIT_LOGS,
  SEED_INCIDENTS
} from './seed-data';
import { DEVELOPMENT_QUESTION_BANK } from './quran-vault';
import { SupportedLanguage } from './i18n';
import { applyTemplate as applyCompetitionTemplate, getCompetitionPolicy, getEnabledJudgeActions, getReadinessIssues } from './competition-config';
import { newId, sha256 } from './crypto';
import { generateFairDraw } from './fairdraw';

interface AppStoreState {
  currentUser: User;
  language: SupportedLanguage;
  competition: Competition;
  competitions: Competition[];
  participants: Participant[];
  committees: Committee[];
  judges: JudgeProfile[];
  results: ResultRecord[];
  reviewCases: ReviewCase[];
  judgeSubmissions: JudgeSubmission[];
  certificates: Certificate[];
  auditLogs: AuditEvent[];
  incidents: IncidentRecord[];
  appeals: AppealRecord[];
  isOffline: boolean;
  emergencyFrozen: boolean;
  sealApprovals: { actorId: string; actorRole: Role; actorName: string; timestamp: string }[];
  
  // Active JudgeOS Session State
  activeSession: {
    sessionId: string;
    participant: Participant | null;
    committee: Committee | null;
    questionSelection: QuestionSelection | null;
    currentQuestionIndex: number;
    isReciting: boolean;
    durationSeconds: number;
    events: JudgeEvent[];
    isLocked: boolean;
    audioLevel: number; // 0 to 100 for mic monitor
  };
}

const STORAGE_KEY = 'mizan_os_store_v1';

function getInitialState(): AppStoreState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as AppStoreState;
      parsed.competition = { ...parsed.competition, policy: getCompetitionPolicy(parsed.competition), ruleSets: parsed.competition.ruleSets || [parsed.competition.ruleSet] };
      parsed.competitions = parsed.competitions?.length ? parsed.competitions.map(c => ({ ...c, policy: getCompetitionPolicy(c), ruleSets: c.ruleSets || [c.ruleSet] })) : [parsed.competition];
      parsed.appeals = parsed.appeals || [];
      parsed.sealApprovals = parsed.sealApprovals || [];
      return parsed;
    }
  } catch {
    // fallback to initial seed
  }

  const defaultUser = SEED_USERS.find((u) => u.role === 'comp_admin') || SEED_USERS[0];

  return {
    currentUser: defaultUser,
    language: 'ar',
    competition: { ...SEED_COMPETITION, policy: getCompetitionPolicy(SEED_COMPETITION), ruleSets: SEED_COMPETITION.ruleSets || [SEED_COMPETITION.ruleSet] },
    competitions: [{ ...SEED_COMPETITION, policy: getCompetitionPolicy(SEED_COMPETITION), ruleSets: SEED_COMPETITION.ruleSets || [SEED_COMPETITION.ruleSet] }],
    participants: SEED_PARTICIPANTS,
    committees: SEED_COMMITTEES,
    judges: SEED_JUDGES,
    results: SEED_RESULTS,
    reviewCases: SEED_REVIEW_CASES,
    judgeSubmissions: [],
    certificates: [SEED_CERTIFICATE],
    auditLogs: SEED_AUDIT_LOGS,
    incidents: SEED_INCIDENTS,
    appeals: [],
    isOffline: false,
    emergencyFrozen: false,
    sealApprovals: [],
    activeSession: {
      sessionId: 'sess-active-001',
      participant: SEED_PARTICIPANTS[0], // Bilal Ahmad (A-104)
      committee: SEED_COMMITTEES[0],
      questionSelection: {
        questionSetId: 'qset-104-fairdraw',
        participantId: 'part-104',
        questions: [DEVELOPMENT_QUESTION_BANK[0], DEVELOPMENT_QUESTION_BANK[1], DEVELOPMENT_QUESTION_BANK[3]],
        difficultyVectorScore: 2.33,
        seedCommitmentHash: 'DEMO:generated-at-runtime-in-live-sessions',
        fairnessToleranceDelta: 0.04,
        generatedAt: new Date().toISOString()
      },
      currentQuestionIndex: 0,
      isReciting: true,
      durationSeconds: 142,
      events: [
        {
          id: 'ev-1',
          sessionId: 'sess-active-001',
          questionIndex: 0,
          judgeId: 'usr-judge-1',
          judgeName: 'Dr. Ahmad Isa Al-Masarawi',
          timestamp: new Date().toISOString(),
          relativeSeconds: 45,
          type: 'tajweed_minor',
          criterion: 'tajweed',
          penalty: 0.25
        }
      ],
      isLocked: false,
      audioLevel: 78
    }
  };
}

let globalState = getInitialState();

function activeRuleSetForCategory(categoryId?: string) {
  const category = categoryId ? globalState.competition.categories.find(c => c.id === categoryId) : undefined;
  const requestedId = category?.ruleSetId;
  return (requestedId ? globalState.competition.ruleSets?.find(r => r.id === requestedId) : undefined) || globalState.competition.ruleSet;
}
const listeners = new Set<() => void>();

let firestoreSyncTimeout: ReturnType<typeof setTimeout> | null = null;

function syncToFirestore() {
  if (globalState.isOffline || !auth.currentUser) return;
  if (firestoreSyncTimeout) clearTimeout(firestoreSyncTimeout);
  firestoreSyncTimeout = setTimeout(async () => {
    try {
      const docRef = doc(db, 'organizations', globalState.competition.organizationId, 'competitions', globalState.competition.id);
      await setDoc(docRef, {
        competition: globalState.competition,
        participants: globalState.participants,
        committees: globalState.committees,
        judges: globalState.judges,
        results: globalState.results,
        reviewCases: globalState.reviewCases,
        judgeSubmissions: globalState.judgeSubmissions,
        certificates: globalState.certificates,
        auditLogs: globalState.auditLogs,
        incidents: globalState.incidents,
        appeals: globalState.appeals,
        emergencyFrozen: globalState.emergencyFrozen,
        sealApprovals: globalState.sealApprovals,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (err) {
      console.warn('Firestore cloud sync paused (local cache active):', err);
    }
  }, 1000);
}

function notify() {
  const existing = globalState.competitions?.findIndex(c => c.id === globalState.competition.id) ?? -1;
  if (!globalState.competitions) globalState.competitions = [globalState.competition];
  else if (existing >= 0) globalState.competitions = globalState.competitions.map(c => c.id === globalState.competition.id ? globalState.competition : c);
  else globalState.competitions = [globalState.competition, ...globalState.competitions];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(globalState));
  } catch {}
  listeners.forEach((l) => l());
  syncToFirestore();
}

export function useAppStore() {
  const [state, setState] = useState<AppStoreState>(globalState);

  useEffect(() => {
    const listener = () => setState({ ...globalState });
    listeners.add(listener);

    // Subscribe only after real Firebase authentication. Demo/local mode stays fully local.
    let unsubscribe: (() => void) | undefined;
    try {
      if (!auth.currentUser) return () => { listeners.delete(listener); };
      const docRef = doc(db, 'organizations', globalState.competition.organizationId, 'competitions', globalState.competition.id);
      unsubscribe = onSnapshot(docRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data) {
            let changed = false;
            if (data.emergencyFrozen !== undefined && data.emergencyFrozen !== globalState.emergencyFrozen) {
              globalState.emergencyFrozen = data.emergencyFrozen;
              changed = true;
            }
            if (data.results && Array.isArray(data.results) && data.results.length >= globalState.results.length) {
              globalState.results = data.results;
              changed = true;
            }
            if (data.certificates && Array.isArray(data.certificates)) {
              globalState.certificates = data.certificates;
              changed = true;
            }
            if (data.reviewCases && Array.isArray(data.reviewCases)) {
              globalState.reviewCases = data.reviewCases;
              changed = true;
            }
            if (data.judgeSubmissions && Array.isArray(data.judgeSubmissions)) {
              globalState.judgeSubmissions = data.judgeSubmissions;
              changed = true;
            }
            if (data.appeals && Array.isArray(data.appeals)) {
              globalState.appeals = data.appeals;
              changed = true;
            }
            if (data.sealApprovals && Array.isArray(data.sealApprovals)) {
              globalState.sealApprovals = data.sealApprovals;
              changed = true;
            }
            if (changed) {
              try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(globalState));
              } catch {}
              setState({ ...globalState });
            }
          }
        }
      }, (error) => {
        console.warn('Firestore live listener warning:', error);
      });
    } catch (e) {
      console.warn('Firestore initialization warning:', e);
    }

    return () => {
      listeners.delete(listener);
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const setLanguage = (lang: SupportedLanguage) => {
    globalState.language = lang;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    notify();
  };

  const switchRole = (role: Role) => {
    const matchedUser = SEED_USERS.find((u) => u.role === role);
    if (matchedUser) {
      globalState.currentUser = matchedUser;
    } else {
      globalState.currentUser = {
        id: `usr-${role}`,
        name: `User (${role})`,
        nameArabic: `مستخدم (${role})`,
        email: `${role}@mizan.org`,
        role,
        organizationId: globalState.competition.organizationId
      };
    }
    notify();
  };

  const toggleOffline = () => {
    globalState.isOffline = !globalState.isOffline;
    notify();
  };

  const toggleEmergencyFreeze = () => {
    globalState.emergencyFrozen = !globalState.emergencyFrozen;
    const log: AuditEvent = {
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      organizationId: globalState.competition.organizationId,
      competitionId: globalState.competition.id,
      actorId: globalState.currentUser.id,
      actorName: globalState.currentUser.name,
      actorRole: globalState.currentUser.role,
      action: globalState.emergencyFrozen ? 'EMERGENCY_FREEZE_ACTIVATED' : 'EMERGENCY_FREEZE_RESUMED',
      entityType: 'Competition',
      entityId: globalState.competition.id,
      humanSummaryArabic: globalState.emergencyFrozen
        ? 'تفعيل وضع الطوارئ وتجميد استدعاء الجلسات مؤقتاً'
        : 'إلغاء تجميد الطوارئ واستئناف مسار التشغيل الآلي',
      humanSummaryEnglish: globalState.emergencyFrozen
        ? 'Activated Emergency Protocol: Frozen new session dispatches'
        : 'Deactivated Emergency Protocol: Operations safely resumed',
      currentStateHash: `PENDING:${newId('audit')}`
    };
    globalState.auditLogs = [log, ...globalState.auditLogs];
    notify();
  };

  // Check-In Kiosk & Exceptions
  const checkInParticipant = (participantIdOrCode: string, method: 'kiosk_qr' | 'mobile_self' | 'exception_host' = 'kiosk_qr') => {
    const pIndex = globalState.participants.findIndex(
      (p) => p.id === participantIdOrCode || p.code.toLowerCase() === participantIdOrCode.toLowerCase()
    );

    if (pIndex !== -1) {
      const p = globalState.participants[pIndex];
      const updated: Participant = {
        ...p,
        status: 'in_queue',
        checkedInAt: new Date().toISOString(),
        checkInMethod: method,
        queueNumber: globalState.participants.filter((x) => x.status === 'in_queue').length + 1,
        assignedCommitteeId: p.assignedCommitteeId || (() => {
          const compatible = globalState.committees.filter((c) => c.assignedCategories.includes(p.categoryId) && c.status !== 'offline');
          const pool = compatible.length ? compatible : globalState.committees.filter((c) => c.status !== 'offline');
          return [...pool].sort((a, b) => {
            const aLoad = globalState.participants.filter(x => x.assignedCommitteeId === a.id && x.status === 'in_queue').length;
            const bLoad = globalState.participants.filter(x => x.assignedCommitteeId === b.id && x.status === 'in_queue').length;
            return aLoad - bLoad || a.averageSessionMinutes - b.averageSessionMinutes;
          })[0]?.id;
        })(),
        statusHistory: [
          ...p.statusHistory,
          {
            status: 'checked_in',
            timestamp: new Date().toISOString(),
            actor: method === 'kiosk_qr' ? 'Kiosk Scanner 01' : method === 'mobile_self' ? 'Mobile Self' : 'Exception Host'
          },
          {
            status: 'in_queue',
            timestamp: new Date().toISOString(),
            actor: 'Smart Auto Routing Dispatcher'
          }
        ]
      };

      globalState.participants[pIndex] = updated;

      const log: AuditEvent = {
        id: `aud-${Date.now()}`,
        timestamp: new Date().toISOString(),
        organizationId: globalState.competition.organizationId,
        competitionId: globalState.competition.id,
        actorId: globalState.currentUser.id,
        actorName: globalState.currentUser.name,
        actorRole: globalState.currentUser.role,
        action: 'PARTICIPANT_CHECKIN',
        entityType: 'Participant',
        entityId: p.id,
        humanSummaryArabic: `تسجيل حضور المتسابق ${p.fullNameArabic} (${p.code}) عبر ${method} وتوجيهه للطابور`,
        humanSummaryEnglish: `Checked in participant ${p.fullName} (${p.code}) via ${method} and routed to queue`,
        currentStateHash: `PENDING:${newId('audit')}`
      };
      globalState.auditLogs = [log, ...globalState.auditLogs];
      notify();
      return updated;
    }
    return null;
  };

  // JudgeOS Actions
  const recordJudgeEvent = (type: JudgeEventType) => {
    if (globalState.activeSession.isLocked) return;
    const action = getEnabledJudgeActions(globalState.competition).find(a => a.eventType === type);
    if (!action) return;

    const newEvent: JudgeEvent = {
      id: newId('ev'),
      sessionId: globalState.activeSession.sessionId,
      questionIndex: globalState.activeSession.currentQuestionIndex,
      judgeId: globalState.currentUser.id,
      judgeName: globalState.currentUser.name,
      timestamp: new Date().toISOString(),
      relativeSeconds: globalState.activeSession.durationSeconds,
      type,
      criterion: action.criterion === 'custom' ? 'performance' : action.criterion,
      penalty: action.penalty
    };

    globalState.activeSession.events = [...globalState.activeSession.events, newEvent];
    notify();
  };

  const undoLastJudgeEvent = () => {
    if (globalState.activeSession.isLocked || globalState.activeSession.events.length === 0) return;
    const last = globalState.activeSession.events[globalState.activeSession.events.length - 1];
    
    // Instead of completely destroying history, we mark as reversed for audit trail integrity
    globalState.activeSession.events = globalState.activeSession.events.map(ev => ev.id === last.id ? { ...ev, reversed: true } : ev);

    const log: AuditEvent = {
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      organizationId: globalState.competition.organizationId,
      competitionId: globalState.competition.id,
      actorId: globalState.currentUser.id,
      actorName: globalState.currentUser.name,
      actorRole: globalState.currentUser.role,
      action: 'JUDGE_EVENT_UNDO',
      entityType: 'JudgeEvent',
      entityId: last.id,
      humanSummaryArabic: `تراجع المحكم عن رصد (${last.type}) عند الثانية ${last.relativeSeconds}`,
      humanSummaryEnglish: `Judge undone event (${last.type}) at second ${last.relativeSeconds}`,
      currentStateHash: `PENDING:${newId('audit')}`
    };
    globalState.auditLogs = [log, ...globalState.auditLogs];
    notify();
  };

  const lockAndSubmitAssessment = (directScores?: Record<string, number>) => {
    if (globalState.activeSession.isLocked) return;
    globalState.activeSession.isLocked = true;
    globalState.activeSession.isReciting = false;

    const participantForRule = globalState.activeSession.participant;
    const sessionRuleSet = activeRuleSetForCategory(participantForRule?.categoryId);
    const criteria = sessionRuleSet.criteria;
    const baseScore = criteria.reduce((sum, c) => sum + c.maxScore, 0) || 100;
    const deductionsByCriterion: Record<string, number> = {};
    globalState.activeSession.events.filter(e => !e.reversed).forEach(ev => { deductionsByCriterion[ev.criterion] = (deductionsByCriterion[ev.criterion] || 0) + ev.penalty; });
    const criterionScores: Record<string, number> = {};
    const policy = getCompetitionPolicy(globalState.competition);
    const judgeProfile = globalState.judges.find(j => j.userId === globalState.currentUser.id || j.id === globalState.currentUser.id);
    const eligibleCriteria = criteria.filter(c => policy.judging.mode === 'all_judges_all_criteria' || !judgeProfile || judgeProfile.specialty === 'all' || c.assignedJudgeType === judgeProfile.specialty || (policy.judging.mode === 'hybrid' && c.assignedJudgeType === 'all'));
    criteria.forEach(c => {
      const eventScore = Math.max(0, c.maxScore - (deductionsByCriterion[c.id] || deductionsByCriterion[c.assignedJudgeType || ''] || 0));
      criterionScores[c.id] = directScores && directScores[c.id] !== undefined ? Math.min(c.maxScore, Math.max(0, directScores[c.id])) : eventScore;
    });
    const scoredCriteria = eligibleCriteria.length ? eligibleCriteria : criteria;
    const scoredMax = scoredCriteria.reduce((sum,c)=>sum+c.maxScore,0) || baseScore;
    const scoredValue = scoredCriteria.reduce((sum,c)=>sum+(criterionScores[c.id] ?? c.maxScore),0);
    const judgeScore = Number(((scoredValue / scoredMax) * baseScore).toFixed(2));
    const submission: JudgeSubmission = {
      judgeId: globalState.currentUser.id, judgeName: globalState.currentUser.name, sessionId: globalState.activeSession.sessionId,
      criterionScores, totalScore: judgeScore, eventsCount: globalState.activeSession.events.length, submittedAt: new Date().toISOString(), locked: true
    };
    globalState.judgeSubmissions = [...globalState.judgeSubmissions.filter(s => !(s.sessionId === submission.sessionId && s.judgeId === submission.judgeId)), submission];

    const sessionSubs = globalState.judgeSubmissions.filter(s => s.sessionId === submission.sessionId && s.locked);
    const participant = globalState.activeSession.participant;
    if (participant && sessionSubs.length >= sessionRuleSet.judgesCountPerPanel) {
      let scoreInputs = sessionSubs.map(s => s.totalScore);
      if (sessionRuleSet.dropExtremes && scoreInputs.length >= 3) {
        const sorted = [...scoreInputs].sort((a,b)=>a-b); scoreInputs = sorted.slice(1,-1);
      }
      const finalScore = Number((scoreInputs.reduce((a,b)=>a+b,0)/Math.max(1,scoreInputs.length)).toFixed(2));
      const pIndex = globalState.participants.findIndex(p => p.id === participant.id);
      if (pIndex !== -1) globalState.participants[pIndex] = { ...globalState.participants[pIndex], status:'tested', statusHistory:[...globalState.participants[pIndex].statusHistory,{status:'tested',timestamp:new Date().toISOString(),actor:'Panel completion'}] };
      const category = globalState.competition.categories.find(c=>c.id===participant.categoryId);
      const existing = globalState.results.findIndex(r => r.participantId === participant.id && r.status !== 'published');
      const result: ResultRecord = { id:existing>=0?globalState.results[existing].id:newId('res'), competitionId:globalState.competition.id, participantId:participant.id, participantCode:participant.code, participantName:participant.fullName, participantNameArabic:participant.fullNameArabic, country:participant.country, categoryId:participant.categoryId, categoryName:category?.name||participant.categoryId, finalScore, rank:0, status:'calculated' };
      if(existing>=0) globalState.results[existing]=result; else globalState.results=[...globalState.results,result];
      const ranked=globalState.results.filter(r=>r.categoryId===participant.categoryId).sort((a,b)=>b.finalScore-a.finalScore); ranked.forEach((r,i)=>{const x=globalState.results.findIndex(z=>z.id===r.id);if(x>=0)globalState.results[x]={...globalState.results[x],rank:i+1}});
      const spread=Math.max(...sessionSubs.map(s=>s.totalScore))-Math.min(...sessionSubs.map(s=>s.totalScore));
      if(spread>=5 && !globalState.reviewCases.some(r=>r.sessionId===submission.sessionId && r.status==='pending')) globalState.reviewCases=[{ id:newId('review'), sessionId:submission.sessionId, participantId:participant.id, participantCode:participant.code, committeeId:globalState.activeSession.committee?.id||'', reason:'judge_variance', severity:spread>=10?'high':'medium', timestampSec:globalState.activeSession.durationSeconds, details:`Panel spread ${spread.toFixed(2)} points`, status:'pending' },...globalState.reviewCases];
    }
    globalState.auditLogs = [{ id:newId('aud'), timestamp:new Date().toISOString(), organizationId:globalState.competition.organizationId, competitionId:globalState.competition.id, actorId:globalState.currentUser.id, actorName:globalState.currentUser.name, actorRole:globalState.currentUser.role, action:'JUDGE_SUBMISSION_LOCKED', entityType:'JudgeSubmission', entityId:`${submission.sessionId}:${submission.judgeId}`, humanSummaryArabic:`قفل تقييم المحكم للمتسابق ${participant?.code||''} دون إظهار تقييم بقية اللجنة`, humanSummaryEnglish:`Judge submission locked for ${participant?.code||''} independently of the rest of the panel`, currentStateHash:`PENDING:${newId('audit')}` },...globalState.auditLogs];
    notify();
  };

  // Next Question in Session
  const nextQuestion = () => {
    if (globalState.activeSession.questionSelection) {
      const total = globalState.activeSession.questionSelection.questions.length;
      if (globalState.activeSession.currentQuestionIndex < total - 1) {
        globalState.activeSession.currentQuestionIndex += 1;
        notify();
      }
    }
  };

  // Head Judge Review Resolution
  const resolveReviewCase = (caseId: string, decision: 'confirmed' | 'dismissed', notes: string) => {
    const cIndex = globalState.reviewCases.findIndex((c) => c.id === caseId);
    if (cIndex !== -1) {
      const targetCase = globalState.reviewCases[cIndex];
      globalState.reviewCases[cIndex] = {
        ...targetCase,
        status: decision === 'confirmed' ? 'confirmed' : 'dismissed',
        headJudgeDecision: {
          actor: globalState.currentUser.name,
          action: decision,
          adjustedPenaltyDelta: 0,
          notes,
          resolvedAt: new Date().toISOString()
        }
      };

      const log: AuditEvent = {
        id: `aud-${Date.now()}`,
        timestamp: new Date().toISOString(),
        organizationId: globalState.competition.organizationId,
        competitionId: globalState.competition.id,
        actorId: globalState.currentUser.id,
        actorName: globalState.currentUser.name,
        actorRole: globalState.currentUser.role,
        action: 'REVIEW_CASE_RESOLVED',
        entityType: 'ReviewCase',
        entityId: caseId,
        humanSummaryArabic: `قرار رئيس اللجنة (${decision === 'confirmed' ? 'تأكيد الحاجة للمعالجة وفق اللائحة' : 'استبعاد الملاحظة'}) للحالة ${targetCase.participantCode}`,
        humanSummaryEnglish: `Head Judge decision (${decision}) for review case ${targetCase.participantCode}`,
        currentStateHash: `PENDING:${newId('audit')}`
      };
      globalState.auditLogs = [log, ...globalState.auditLogs];
      notify();
    }
  };

  // Cryptographic sealing. A configured dual-approval policy requires two distinct authorized actors.
  const sealResults = async () => {
    const policy = getCompetitionPolicy(globalState.competition);
    const allowedRoles: Role[] = ['head_judge', 'comp_admin', 'org_admin'];
    if (!allowedRoles.includes(globalState.currentUser.role)) return { sealed: false, reason: 'not_authorized', approvals: globalState.sealApprovals.length };

    if (policy.results.requireDualApprovalToSeal) {
      if (!globalState.sealApprovals.some(a => a.actorId === globalState.currentUser.id)) {
        globalState.sealApprovals = [...globalState.sealApprovals, {
          actorId: globalState.currentUser.id, actorRole: globalState.currentUser.role, actorName: globalState.currentUser.name, timestamp: new Date().toISOString()
        }];
        globalState.auditLogs = [{
          id:newId('aud'), timestamp:new Date().toISOString(), organizationId:globalState.competition.organizationId, competitionId:globalState.competition.id,
          actorId:globalState.currentUser.id, actorName:globalState.currentUser.name, actorRole:globalState.currentUser.role, action:'RESULT_SEAL_APPROVAL_ADDED',
          entityType:'Competition', entityId:globalState.competition.id, humanSummaryArabic:'إضافة اعتماد مستقل لختم النتائج؛ لا يتم الختم حتى اكتمال الاعتمادات المطلوبة.',
          humanSummaryEnglish:'Added an independent result-seal approval; sealing waits for the configured approval requirement.', currentStateHash:`PENDING:${newId('audit')}`
        }, ...globalState.auditLogs];
      }
      const distinctActors = new Set(globalState.sealApprovals.map(a => a.actorId)).size;
      if (distinctActors < 2) { notify(); return { sealed:false, reason:'second_approval_required', approvals:distinctActors }; }
    }

    const sealedAt = new Date().toISOString();
    const payload = JSON.stringify(globalState.results.map(r => ({ id:r.id, participantId:r.participantId, score:r.finalScore, rank:r.rank, categoryId:r.categoryId })).sort((a,b)=>a.id.localeCompare(b.id))) + globalState.competition.ruleSet.version + sealedAt;
    const checksum = await sha256(payload);
    const approverNames = globalState.sealApprovals.map(a=>a.actorName);
    globalState.results = globalState.results.map((res) => ({
      ...res,
      status: 'sealed',
      sealMetadata: {
        sealedBy: globalState.currentUser.name,
        sealedAt,
        cryptographicChecksum: `SHA256:${checksum}`,
        dualApprovalBy: policy.results.requireDualApprovalToSeal ? approverNames.join(' + ') : undefined
      }
    }));
    globalState.competition = { ...globalState.competition, status: 'results_sealed' };
    globalState.auditLogs = [{
      id: newId('aud'), timestamp: sealedAt, organizationId: globalState.competition.organizationId, competitionId: globalState.competition.id,
      actorId: globalState.currentUser.id, actorName: globalState.currentUser.name, actorRole: globalState.currentUser.role,
      action: 'RESULTS_SEALED', entityType: 'Competition', entityId: globalState.competition.id,
      humanSummaryArabic: `ختم النتائج وفق سياسة هذه المسابقة وبصمة SHA-256 ${checksum.slice(0,12)}…`,
      humanSummaryEnglish: `Results sealed under this competition policy with SHA-256 ${checksum.slice(0,12)}…`,
      currentStateHash: `SHA256:${checksum}`
    }, ...globalState.auditLogs];
    notify();
    return { sealed:true, approvals:new Set(globalState.sealApprovals.map(a=>a.actorId)).size, checksum };
  };

  const publishResults = () => {
    if(!globalState.results.length || globalState.results.some(r=>r.status!=='sealed' && r.status!=='published')) return false;
    globalState.results=globalState.results.map(r=>({...r,status:'published'}));
    globalState.competition={...globalState.competition,status:'results_published'};
    globalState.auditLogs=[{id:newId('aud'),timestamp:new Date().toISOString(),organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,actorId:globalState.currentUser.id,actorName:globalState.currentUser.name,actorRole:globalState.currentUser.role,action:'RESULTS_PUBLISHED',entityType:'Competition',entityId:globalState.competition.id,humanSummaryArabic:'نشر النتائج وفق سياسة الإظهار الخاصة بالمسابقة.',humanSummaryEnglish:'Published results under this competition visibility policy.',currentStateHash:`PENDING:${newId('audit')}`},...globalState.auditLogs];
    notify(); return true;
  };

  const completeCompetition = () => {
    const unresolvedReviews=globalState.reviewCases.some(r=>r.status==='pending');
    const unresolvedAppeals=globalState.appeals.some(a=>a.status==='submitted'||a.status==='under_review');
    if(unresolvedReviews||unresolvedAppeals) return false;
    globalState.competition={...globalState.competition,status:'completed'};
    notify(); return true;
  };

  // Issue a certificate only under the active competition's own certificate policy.
  const generateCertificate = async (resultId: string) => {
    const res = globalState.results.find((r) => r.id === resultId);
    if (!res) return null;
    const policy = getCompetitionPolicy(globalState.competition);
    const cp = policy.certificates;
    if (!cp.enabled) return null;
    if (!['sealed','published'].includes(res.status)) return null;
    const eligible = cp.issueFor === 'all_participants'
      || (cp.issueFor === 'winners' && res.rank > 0 && res.rank <= 3)
      || (cp.issueFor === 'qualified' && res.finalScore >= activeRuleSetForCategory(res.categoryId).minimumPassingScore);
    if (!eligible || cp.issueFor === 'custom') return null;

    const existing = globalState.certificates.find(c => c.competitionId === globalState.competition.id && c.participantId === res.participantId);
    if (existing) return existing;

    const category = globalState.competition.categories.find(c => c.id === res.categoryId);
    const year = (globalState.competition.endDate || globalState.competition.startDate || new Date().toISOString()).slice(0,4);
    const shortComp = globalState.competition.id.replace(/[^a-zA-Z0-9]/g,'').slice(-6).toUpperCase() || 'COMP';
    const certNumber = `MZN-${year}-${shortComp}-${res.participantCode.replace(/[^a-zA-Z0-9]/g,'')}`;
    const issueDate = new Date().toISOString().split('T')[0];
    const verificationToken = await sha256(`${globalState.competition.id}|${res.participantId}|${certNumber}|${issueDate}|${res.finalScore}`);
    const basePath = (cp.verificationBasePath || '/verify').replace(/\/$/,'');
    const verificationUrl = `${basePath}/${encodeURIComponent(certNumber)}?token=${verificationToken.slice(0,24)}`;
    const awardTextArabic = cp.awardTextArabic || 'تشهد الجهة المنظمة بإتمام المشاركة وفق لائحة المسابقة المعتمدة.';

    const newCert: Certificate = {
      id: newId('cert'), certificateNumber: certNumber, competitionId: globalState.competition.id,
      competitionName: globalState.competition.name, competitionNameArabic: globalState.competition.nameArabic,
      organizationName: SEED_ORGANIZATION.name, organizationNameArabic: SEED_ORGANIZATION.nameArabic,
      participantId: res.participantId, participantName: res.participantName, participantNameArabic: res.participantNameArabic,
      categoryName: category?.name || res.categoryName, categoryNameArabic: category?.nameArabic || res.categoryName,
      score: cp.showScore ? res.finalScore : 0, rank: cp.showRank ? res.rank : undefined,
      awardTextArabic, issueDate, signatories: cp.signatories || [], verificationToken, verificationUrl, isAuthentic: true, qrPayload: verificationUrl
    };

    globalState.certificates = [newCert, ...globalState.certificates];
    const pIdx = globalState.participants.findIndex(p=>p.id===res.participantId);
    if (pIdx >= 0) globalState.participants[pIdx] = { ...globalState.participants[pIdx], status:'certified', statusHistory:[...globalState.participants[pIdx].statusHistory,{status:'certified',timestamp:new Date().toISOString(),actor:'Certificate engine'}] };
    globalState.auditLogs = [{
      id:newId('aud'), timestamp:new Date().toISOString(), organizationId:globalState.competition.organizationId, competitionId:globalState.competition.id,
      actorId:globalState.currentUser.id, actorName:globalState.currentUser.name, actorRole:globalState.currentUser.role, action:'CERTIFICATE_ISSUED',
      entityType:'Certificate', entityId:newCert.id, humanSummaryArabic:`إصدار شهادة ${certNumber} وفق سياسة الشهادات الخاصة بالمسابقة`,
      humanSummaryEnglish:`Issued certificate ${certNumber} under this competition's certificate policy`, currentStateHash:`SHA256:${verificationToken}`
    }, ...globalState.auditLogs];
    notify();
    return newCert;
  };

  // Register New Participant
  const registerParticipant = (newP: Omit<Participant, 'id' | 'code' | 'status' | 'statusHistory' | 'createdAt'>) => {
    const policy = getCompetitionPolicy(globalState.competition);
    const code = `A-${String(100 + globalState.participants.length + 1).padStart(3,'0')}`;
    const participant: Participant = {
      ...newP,
      id: newId('part'),
      code,
      status: 'submitted',
      statusHistory: [{ status: 'submitted', timestamp: new Date().toISOString(), actor: 'Online registration' }],
      createdAt: new Date().toISOString()
    };
    globalState.participants = [...globalState.participants, participant];
    const category = globalState.competition.categories.find(c => c.id === participant.categoryId);
    const age = Math.floor((Date.now() - new Date(participant.dateOfBirth).getTime()) / 31557600000);
    const ageEligible = (!category?.minAge || age >= category.minAge) && (!category?.maxAge || age <= category.maxAge);
    const shouldAutoApprove = policy.registration.autoApproveEligible && ageEligible;
    if (shouldAutoApprove) {
      const idx = globalState.participants.findIndex(p => p.id === participant.id);
      const slotMinute = 10 + ((globalState.participants.length * 10) % 50);
      globalState.participants[idx] = {
        ...globalState.participants[idx], status: 'approved', arrivalSlot: `09:${String(slotMinute).padStart(2,'0')}–09:${String(Math.min(59,slotMinute+20)).padStart(2,'0')}`,
        statusHistory: [...globalState.participants[idx].statusHistory, { status: 'approved', timestamp: new Date().toISOString(), actor: 'Eligibility Engine', reason: 'Objective eligibility rules passed' }]
      };
    } else {
      const idx = globalState.participants.findIndex(p => p.id === participant.id);
      globalState.participants[idx] = { ...globalState.participants[idx], status: 'under_review', statusHistory: [...globalState.participants[idx].statusHistory, { status: 'under_review', timestamp: new Date().toISOString(), actor: 'Eligibility Engine', reason: ageEligible ? 'Policy requires human review' : 'Eligibility exception requires review' }] };
    }
    globalState.auditLogs = [{
      id:newId('aud'), timestamp:new Date().toISOString(), organizationId:globalState.competition.organizationId, competitionId:globalState.competition.id,
      actorId:globalState.currentUser.id, actorName:globalState.currentUser.name, actorRole:globalState.currentUser.role, action:'REGISTRATION_CREATED', entityType:'Participant', entityId:participant.id,
      humanSummaryArabic:`استلام طلب ${code} ومعالجته وفق سياسة التسجيل الخاصة بالمسابقة`, humanSummaryEnglish:`Received ${code} and processed it under this competition registration policy`, currentStateHash:`PENDING:${newId('audit')}`
    }, ...globalState.auditLogs];
    notify();
    return globalState.participants.find(p => p.id === participant.id)!;
  };

  const reviewParticipant = (participantId: string, decision: 'approved' | 'rejected', reason = '') => {
    const idx = globalState.participants.findIndex(p=>p.id===participantId);
    if(idx<0) return null;
    const current=globalState.participants[idx];
    const slotIndex=globalState.participants.filter(p=>p.status==='approved' && p.arrivalSlot).length;
    const startMinutes=8*60+30+slotIndex*10;
    const h=Math.floor(startMinutes/60); const m=startMinutes%60; const end=startMinutes+20;
    const arrivalSlot=decision==='approved' ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}–${String(Math.floor(end/60)).padStart(2,'0')}:${String(end%60).padStart(2,'0')}` : current.arrivalSlot;
    const next: Participant={...current,status:decision,arrivalSlot,statusHistory:[...current.statusHistory,{status:decision,timestamp:new Date().toISOString(),actor:globalState.currentUser.name,reason:reason||undefined}]};
    globalState.participants[idx]=next;
    globalState.auditLogs=[{id:newId('aud'),timestamp:new Date().toISOString(),organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,actorId:globalState.currentUser.id,actorName:globalState.currentUser.name,actorRole:globalState.currentUser.role,action:decision==='approved'?'PARTICIPANT_APPROVED':'PARTICIPANT_REJECTED',entityType:'Participant',entityId:participantId,humanSummaryArabic:`${decision==='approved'?'اعتماد':'رفض'} طلب ${current.code} وفق سياسة المسابقة`,humanSummaryEnglish:`${decision==='approved'?'Approved':'Rejected'} ${current.code} under the competition policy`,currentStateHash:`PENDING:${newId('audit')}`},...globalState.auditLogs];
    notify(); return next;
  };

  const submitAppeal = (participantId: string, grounds: AppealRecord['grounds'], reasonText: string) => {
    const policy = getCompetitionPolicy(globalState.competition);
    if (!policy.appeals.enabled) return null;
    const participant = globalState.participants.find(p => p.id === participantId);
    if (!participant) return null;
    const category = globalState.competition.categories.find(c => c.id === participant.categoryId);
    const appeal: AppealRecord = {
      id: newId('appeal'), competitionId: globalState.competition.id, participantId, participantCode: participant.code,
      categoryName: category?.name || participant.categoryId, grounds, reasonText, status: 'submitted', createdAt: new Date().toISOString()
    };
    globalState.appeals = [appeal, ...globalState.appeals];
    const pIdx = globalState.participants.findIndex(p => p.id === participantId);
    if (pIdx >= 0) globalState.participants[pIdx] = { ...globalState.participants[pIdx], status: 'appealed', statusHistory: [...globalState.participants[pIdx].statusHistory, { status:'appealed', timestamp:new Date().toISOString(), actor:'Participant portal', reason:grounds }] };
    notify(); return appeal;
  };

  const resolveAppeal = (appealId: string, accepted: boolean, notes: string, scoreAdjustmentDelta = 0) => {
    const idx = globalState.appeals.findIndex(a => a.id === appealId);
    if (idx < 0) return false;
    const appeal=globalState.appeals[idx];
    const policy=getCompetitionPolicy(globalState.competition);
    const appliedDelta = accepted && policy.appeals.allowScoreChange ? Number(scoreAdjustmentDelta||0) : 0;
    globalState.appeals[idx] = { ...appeal, status: accepted ? 'accepted' : 'rejected', resolutionNotes: notes, resolvedBy: globalState.currentUser.name, resolvedAt: new Date().toISOString(), scoreAdjustmentDelta: appliedDelta };
    if(appliedDelta!==0){
      const rIdx=globalState.results.findIndex(r=>r.participantId===appeal.participantId);
      if(rIdx>=0 && !['sealed','published'].includes(globalState.results[rIdx].status)){
        const r=globalState.results[rIdx]; globalState.results[rIdx]={...r,finalScore:Math.max(0,Number((r.finalScore+appliedDelta).toFixed(2)))};
        const cat=r.categoryId; const ranked=globalState.results.filter(x=>x.categoryId===cat).sort((a,b)=>b.finalScore-a.finalScore); ranked.forEach((rr,i)=>{const x=globalState.results.findIndex(z=>z.id===rr.id);if(x>=0)globalState.results[x]={...globalState.results[x],rank:i+1}});
      }
    }
    globalState.auditLogs=[{id:newId('aud'),timestamp:new Date().toISOString(),organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,actorId:globalState.currentUser.id,actorName:globalState.currentUser.name,actorRole:globalState.currentUser.role,action:accepted?'APPEAL_ACCEPTED':'APPEAL_REJECTED',entityType:'Appeal',entityId:appealId,humanSummaryArabic:`حسم اعتراض ${appeal.participantCode} بقرار بشري${appliedDelta?` وتعديل ${appliedDelta} نقطة`:''}`,humanSummaryEnglish:`Resolved ${appeal.participantCode} appeal by human decision${appliedDelta?` with ${appliedDelta} point adjustment`:''}`,currentStateHash:`PENDING:${newId('audit')}`},...globalState.auditLogs];
    notify(); return true;
  };

  const selectCompetition = (competitionId: string) => {
    const target = globalState.competitions.find(c => c.id === competitionId);
    if (!target) return false;
    globalState.competition = { ...target, policy: getCompetitionPolicy(target), ruleSets: target.ruleSets || [target.ruleSet] };
    notify(); return true;
  };

  const createCompetition = (nameArabic: string, nameEnglish: string, templateId = 'international-hifz') => {
    const base: Competition = {
      ...JSON.parse(JSON.stringify(globalState.competition)), id:newId('comp'), name:nameEnglish, nameArabic, edition:'New Edition', status:'draft',
      startDate:'', endDate:'', registrationStartDate:'', registrationEndDate:'', totalRegistered:0, totalApproved:0, totalAttended:0, currentDay:0,
      categories: globalState.competition.categories.map(c => ({...c,id:newId('cat'),competitionId:''})),
      readinessChecklist:{datesConfigured:false,categoriesConfigured:true,ruleSetFrozen:false,judgesAssigned:false,quranSourceLocked:false,devicesRegistered:false,certificatesReady:false}
    };
    base.categories = base.categories.map(c => ({...c,competitionId:base.id}));
    const configured = applyCompetitionTemplate(base, templateId);
    globalState.competitions = [configured, ...globalState.competitions];
    globalState.competition = configured;
    notify(); return configured;
  };

  const applyTemplate = (templateId: string) => {
    globalState.competition = applyCompetitionTemplate(globalState.competition, templateId);
    notify();
  };

  const updateCompetitionPolicy = (updater: (policy: ReturnType<typeof getCompetitionPolicy>) => ReturnType<typeof getCompetitionPolicy>) => {
    const current = getCompetitionPolicy(globalState.competition);
    const next = updater(JSON.parse(JSON.stringify(current)));
    next.version = current.version === next.version ? `${current.version.split('.')[0]}.${Number(current.version.split('.')[1] || 0) + 1}.0` : next.version;
    next.updatedAt = new Date().toISOString();
    globalState.competition = { ...globalState.competition, policy: next };
    notify();
  };

  const updateRuleSet = (patch: Partial<Competition['ruleSet']>) => {
    const next = { ...globalState.competition.ruleSet, ...patch, version: `${globalState.competition.ruleSet.version}-rev` };
    globalState.competition = { ...globalState.competition, ruleSet: next, ruleSets: [next, ...(globalState.competition.ruleSets || []).filter(r => r.id !== next.id)] };
    notify();
  };

  const getCompetitionReadiness = () => getReadinessIssues(globalState.competition);

  const updateCompetitionDetails = (patch: Partial<Competition>) => {
    globalState.competition = { ...globalState.competition, ...patch };
    notify();
  };

  const addCategory = () => {
    const id = newId('cat');
    const category: Category = {
      id, competitionId: globalState.competition.id, code:`CAT-${globalState.competition.categories.length+1}`,
      name:'New category', nameArabic:'فئة جديدة', description:'', riwaya:'Hafs', memorizationScope:'Custom', juzCount:30,
      genderConstraint:'all', targetParticipants:100, targetDurationMinutes:8, ruleSetId:globalState.competition.ruleSet.id
    };
    globalState.competition = { ...globalState.competition, categories:[...globalState.competition.categories, category] };
    notify(); return category;
  };

  const updateCategory = (categoryId: string, patch: Partial<Category>) => {
    globalState.competition = { ...globalState.competition, categories:globalState.competition.categories.map(c=>c.id===categoryId?{...c,...patch}:c) };
    notify();
  };

  const removeCategory = (categoryId: string) => {
    if (globalState.participants.some(p=>p.categoryId===categoryId)) return false;
    globalState.competition = { ...globalState.competition, categories:globalState.competition.categories.filter(c=>c.id!==categoryId) };
    notify(); return true;
  };

  const addCommittee = () => {
    const n=globalState.committees.length+1;
    const firstCategory=globalState.competition.categories[0];
    const committee: Committee={ id:newId('comm'),competitionId:globalState.competition.id,name:`Committee ${n}`,nameArabic:`اللجنة ${n}`,code:`C${n}`,venueHall:'',assignedCategories:firstCategory?[firstCategory.id]:[],headJudgeId:'',judgeIds:[],status:'ready',completedCount:0,averageSessionMinutes:globalState.competition.ruleSet.questionDurationMinutes||8,audioInputOk:false,devicesConnected:0 };
    globalState.committees=[...globalState.committees,committee]; notify(); return committee;
  };

  const updateCommittee = (committeeId: string, patch: Partial<Committee>) => {
    globalState.committees=globalState.committees.map(c=>c.id===committeeId?{...c,...patch}:c); notify();
  };

  const publishCompetition = () => {
    const issues=getReadinessIssues(globalState.competition);
    if(issues.length) return {ok:false,issues};
    globalState.competition={...globalState.competition,status:'registration_open'};
    globalState.auditLogs=[{id:newId('aud'),timestamp:new Date().toISOString(),organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,actorId:globalState.currentUser.id,actorName:globalState.currentUser.name,actorRole:globalState.currentUser.role,action:'COMPETITION_PUBLISHED',entityType:'Competition',entityId:globalState.competition.id,humanSummaryArabic:'فتح التسجيل وفق إعدادات وسياسة هذه المسابقة.',humanSummaryEnglish:'Opened registration under this competition configuration and policy.',currentStateHash:`PENDING:${newId('audit')}`},...globalState.auditLogs];
    notify(); return {ok:true,issues:[]};
  };

  const startSessionForParticipant = async (participantId: string) => {
    const participant = globalState.participants.find(p => p.id === participantId);
    if (!participant) return false;
    const committee = globalState.committees.find(c => c.id === participant.assignedCommitteeId) || globalState.committees.find(c => c.assignedCategories.includes(participant.categoryId)) || globalState.committees[0];
    const policy = getCompetitionPolicy(globalState.competition);
    const category = globalState.competition.categories.find(c => c.id === participant.categoryId);
    try {
      const selection = await generateFairDraw({ pool: DEVELOPMENT_QUESTION_BANK, participant, policy, maxJuz: category?.juzCount });
      globalState.activeSession = {
        sessionId:newId('sess'), participant, committee, questionSelection:selection, currentQuestionIndex:0, isReciting:true, durationSeconds:0, events:[], isLocked:false, audioLevel:76
      };
      const idx=globalState.participants.findIndex(p=>p.id===participantId); if(idx>=0) globalState.participants[idx]={...globalState.participants[idx],status:'in_session'};
      globalState.auditLogs = [{ id:newId('aud'), timestamp:new Date().toISOString(), organizationId:globalState.competition.organizationId, competitionId:globalState.competition.id, actorId:globalState.currentUser.id, actorName:globalState.currentUser.name, actorRole:globalState.currentUser.role, action:'FAIRDRAW_COMMITTED', entityType:'QuestionSelection', entityId:selection.questionSetId, humanSummaryArabic:`اعتماد حزمة أسئلة ${participant.code} ضمن قيود FairDraw`, humanSummaryEnglish:`Committed ${participant.code} question set under FairDraw constraints`, currentStateHash:selection.seedCommitmentHash }, ...globalState.auditLogs];
      notify(); return true;
    } catch (error) {
      console.error('FairDraw could not create an eligible set', error); return false;
    }
  };

  // Digital Twin / capacity estimate. Every value is derived from the current competition inputs or declared assumptions.
  const runSimulation = (committeesCount: number, arrivalThroughputPerHr: number): SimulationResult => {
    const totalP = Math.max(1, globalState.participants.filter(p=>p.status!=='rejected').length || globalState.competition.totalApproved || 1);
    const activeCommitteeDurations = globalState.committees.filter(c=>c.status!=='offline').map(c=>c.averageSessionMinutes).filter(n=>Number.isFinite(n)&&n>0);
    const configuredMinutes = globalState.competition.ruleSet.questionDurationMinutes * Math.max(1, getCompetitionPolicy(globalState.competition).questions.questionsPerParticipant);
    const avgSessionMins = activeCommitteeDurations.length
      ? activeCommitteeDurations.reduce((a,b)=>a+b,0)/activeCommitteeDurations.length
      : Math.max(3, configuredMinutes);
    const safePanels = Math.max(1, committeesCount);
    const capacityPerHour = safePanels * (60 / avgSessionMins);
    const projectedHours = totalP / Math.max(0.1, capacityPerHour);
    const startH = 8;
    const finishDecimal = startH + projectedHours;
    const finishH = Math.min(23, Math.floor(finishDecimal));
    const finishM = Math.floor((finishDecimal - Math.floor(finishDecimal)) * 60);
    const projectedFinishTime = `${String(finishH).padStart(2,'0')}:${String(finishM).padStart(2,'0')}${finishDecimal>=24?'+':''}`;

    const arrivalPressure = Math.max(0, arrivalThroughputPerHr - capacityPerHour);
    const averageWaitMinutes = Math.max(2, Math.round((arrivalPressure / Math.max(1,capacityPerHour))*60 + avgSessionMins*.45));
    const sortedPanels=[...globalState.committees].filter(c=>c.status!=='offline').sort((a,b)=>b.averageSessionMinutes-a.averageSessionMinutes);
    const bottleneck=sortedPanels[0];
    const suggestedPanels=Math.max(1,Math.ceil(arrivalThroughputPerHr/(60/avgSessionMins)));
    const delta=Math.max(0,suggestedPanels-safePanels);
    const adviceAr = delta>0 ? `وفق الافتراضات الحالية، أضف ${delta} ${delta===1?'لجنة':'لجان'} أو خفّض تدفق الوصول لتفادي تراكم الطابور.` : 'السعة الحالية تستوعب معدل الوصول المفترض؛ راقب الاستثناءات وزمن الجلسة الفعلي.';
    const adviceEn = delta>0 ? `Under the current assumptions, add ${delta} panel${delta===1?'':'s'} or reduce arrival throughput to avoid queue accumulation.` : 'Current capacity covers the assumed arrival rate; monitor exceptions and actual session duration.';
    const hourly=[] as {hour:string;processed:number;queueSize:number}[];
    let remaining=totalP, queue=0;
    for(let h=8;h<Math.min(22,8+Math.ceil(projectedHours)+2);h++){
      const arriving=Math.min(remaining,Math.round(arrivalThroughputPerHr)); queue+=arriving; remaining-=arriving;
      const processed=Math.min(queue,Math.max(1,Math.floor(capacityPerHour))); queue-=processed; hourly.push({hour:`${String(h).padStart(2,'0')}:00`,processed,queueSize:queue});
      if(remaining<=0&&queue<=0) break;
    }
    return {
      totalParticipants:totalP, committeesCount:safePanels, projectedFinishTime, averageWaitMinutes, maxWaitMinutes:Math.max(averageWaitMinutes,Math.round(averageWaitMinutes*1.8)),
      peakBottleneckTimeRange: hourly.length>2 ? `${hourly[Math.min(2,hourly.length-1)].hour} – ${hourly[Math.min(3,hourly.length-1)]?.hour||hourly[hourly.length-1].hour}` : '—',
      bottleneckCommittee: bottleneck ? `${bottleneck.code} · ${bottleneck.name}` : 'No active panel data', optimizationAdviceArabic:adviceAr, optimizationAdviceEnglish:adviceEn, simulatedHourlyThroughput:hourly
    };
  };


  return {
    ...state,
    setLanguage,
    switchRole,
    toggleOffline,
    toggleEmergencyFreeze,
    checkInParticipant,
    recordJudgeEvent,
    undoLastJudgeEvent,
    lockAndSubmitAssessment,
    nextQuestion,
    resolveReviewCase,
    sealResults,
    generateCertificate,
    publishResults,
    completeCompetition,
    registerParticipant,
    reviewParticipant,
    selectCompetition,
    createCompetition,
    submitAppeal,
    resolveAppeal,
    applyTemplate,
    updateCompetitionPolicy,
    updateRuleSet,
    getCompetitionReadiness,
    updateCompetitionDetails,
    addCategory,
    updateCategory,
    removeCategory,
    addCommittee,
    updateCommittee,
    publishCompetition,
    startSessionForParticipant,
    runSimulation
  };
}
