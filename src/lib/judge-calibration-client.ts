import {auth} from './firebase';
import type {JudgeCalibrationRow,RankScenarioRow} from '../components/head-judge/JudgeCalibrationPanel';

/*
 * عميل ميزان اتزان المحكمين.
 *
 * الحساب يجري على الخادم خلف صلاحية رئيس التحكيم، لا في المتصفح. والسبب ليس ثقل الحساب — فهو
 * يسير — بل أن مقارنة المحكمين ببعضهم معلومة حسّاسة لا ينبغي أن يراها كل من فتح الصفحة، ولا أن
 * تُشتق في جهاز يمكن العبث به. وإن لم يكن للحساب هذه الصلاحية عاد الطلب فارغًا فتختفي اللوحة
 * بهدوء، بلا رسالة خطأ تُقلق من لا شأن له بها.
 */

export interface CalibrationObservation{
 judgeId:string;judgeName?:string;sessionId:string;participantId:string;criterionId?:string;score:number;
}

export async function fetchJudgeCalibration(observations:CalibrationObservation[]):Promise<{judges:JudgeCalibrationRow[];scenario:RankScenarioRow[]}|null>{
 try{
  const user=auth.currentUser;if(!user)return null;
  const token=await user.getIdToken();
  const r=await fetch('/api/judging/calibration',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},cache:'no-store',body:JSON.stringify({observations})});
  if(!r.ok)return null;
  const body=await r.json();
  return {judges:Array.isArray(body?.calibration?.judges)?body.calibration.judges:[],scenario:Array.isArray(body?.rankScenario)?body.rankScenario:[]};
 }catch{return null}
}

/*
 * قياس موثوقية التحكيم بالإعماء.
 *
 * يُرسَل الحكمان المستقلّان ويُعاد الفرق بينهما. الخادم لا يكتب شيئًا؛ والمخرج تقرير للإدارة
 * العلمية. تعذّر القياس يُعيد null فتغيب اللوحة بدل أن تعرض رقمًا لا سند له.
 */
export interface ReliabilityReport{pairs:number;agreementRate:number;toleranceUsed:number;meanAbsoluteDifference:number;maxAbsoluteDifference:number;sufficientSample:boolean;widestCriterion?:{criterionId:string;meanAbsoluteDifference:number};outliers:{sessionId:string;participantId:string;difference:number}[];note:string}
export async function measureJudgingReliability(body:{assignments:unknown[];originals:unknown[];reviews:unknown[];criteria:unknown[];tolerance?:number}):Promise<ReliabilityReport|null>{
 try{const user=auth.currentUser;if(!user)return null;
  const token=await user.getIdToken();
  const r=await fetch('/api/judging/blind-rescoring/measure',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(body)});
  if(!r.ok)return null;return await r.json() as ReliabilityReport}catch{return null}}
