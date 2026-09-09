import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { ServerIdentity } from './identity-governance';

export type NotificationCategory='admin'|'system'|'competition'|'identity'|'support';
export type NotificationPriority='normal'|'important'|'urgent';
export type NotificationTargetType='all'|'operator'|'organization'|'competition'|'role'|'user'|'users';
export interface NotificationTarget{
 type:NotificationTargetType;
 operatorId?:string;
 organizationId?:string;
 competitionId?:string;
 role?:string;
 userId?:string;
 userIds?:string[];
}
export interface NotificationContext{
 operatorId?:string;
 organizationId?:string;
 competitionId?:string;
 entityType?:string;
 entityId?:string;
 label?:string;
}
export interface NotificationRecord{
 id:string;title:string;body:string;category:NotificationCategory;priority:NotificationPriority;target:NotificationTarget;
 senderName?:string;createdBy:string;createdByRole:string;createdAt:string;actionHref?:string;actionLabel?:string;
 context?:NotificationContext;dedupeKey?:string;expiresAt?:string;
}
type UserNotificationState={notificationId:string;userId:string;readAt?:string;archivedAt?:string};
type State={version:1;notifications:NotificationRecord[];userStates:UserNotificationState[]};

const clean=(v:unknown,max=1000)=>String(v??'').trim().slice(0,max);
const now=()=>new Date().toISOString();
const cleanContext=(input?:NotificationContext):NotificationContext|undefined=>{
 if(!input)return undefined;
 const out:NotificationContext={
  operatorId:clean(input.operatorId,120)||undefined,
  organizationId:clean(input.organizationId,120)||undefined,
  competitionId:clean(input.competitionId,120)||undefined,
  entityType:clean(input.entityType,80)||undefined,
  entityId:clean(input.entityId,180)||undefined,
  label:clean(input.label,180)||undefined,
 };
 return Object.values(out).some(Boolean)?out:undefined;
};
export const notificationContextKey=(context?:NotificationContext,target?:NotificationTarget)=>{
 const operatorId=context?.operatorId||target?.operatorId;
 const organizationId=context?.organizationId||target?.organizationId;
 const competitionId=context?.competitionId||target?.competitionId;
 if(competitionId)return `competition:${competitionId}`;
 if(organizationId)return `organization:${organizationId}`;
 if(operatorId)return `operator:${operatorId}`;
 return 'platform';
};

export class NotificationCenterRepository{
 private file:string;
 constructor(private dir:string){
  if(!dir)throw new Error('NOTIFICATION_CENTER_DIR_REQUIRED');
  fs.mkdirSync(dir,{recursive:true,mode:0o700});this.file=path.join(dir,'notification-center.json');
  if(!fs.existsSync(this.file))this.write({version:1,notifications:[],userStates:[]});
 }
 private read():State{try{return {...JSON.parse(fs.readFileSync(this.file,'utf8')) as State,version:1}}catch{throw new Error('NOTIFICATION_CENTER_CORRUPT')}}
 private write(s:State){const tmp=`${this.file}.${process.pid}.${Date.now()}.tmp`;fs.writeFileSync(tmp,JSON.stringify(s,null,2),{mode:0o600});fs.renameSync(tmp,this.file)}
 private stateFor(s:State,userId:string,notificationId:string){let row=s.userStates.find(x=>x.userId===userId&&x.notificationId===notificationId);if(!row){row={userId,notificationId};s.userStates.push(row)}return row}
 private matches(identity:ServerIdentity,target:NotificationTarget){
  if(target.type==='all')return true;
  if(target.type==='user')return target.userId===identity.uid;
  if(target.type==='users')return !!target.userIds?.includes(identity.uid);
  if(target.type==='operator')return !!target.operatorId&&target.operatorId===identity.operatorId;
  if(target.type==='organization')return !!target.organizationId&&target.organizationId===identity.organizationId;
  if(target.type==='competition')return !!target.competitionId&&target.competitionId===identity.competitionId&&(!target.organizationId||target.organizationId===identity.organizationId);
  if(target.type==='role')return target.role===identity.role&&(!target.operatorId||target.operatorId===identity.operatorId)&&(!target.organizationId||target.organizationId===identity.organizationId)&&(!target.competitionId||target.competitionId===identity.competitionId);
  return false;
 }
 list(identity:ServerIdentity){
  const s=this.read(),t=Date.now();
  const notifications=s.notifications.filter(n=>(!n.expiresAt||Date.parse(n.expiresAt)>t)&&this.matches(identity,n.target)).map(n=>{const state=s.userStates.find(x=>x.userId===identity.uid&&x.notificationId===n.id);return {...n,contextKey:notificationContextKey(n.context,n.target),readAt:state?.readAt,archivedAt:state?.archivedAt}}).filter(n=>!n.archivedAt).sort((a,b)=>{const priority={urgent:0,important:1,normal:2};return priority[a.priority]-priority[b.priority]||String(b.createdAt).localeCompare(String(a.createdAt))});
  return {notifications,unread:notifications.filter(x=>!x.readAt).length};
 }
 publish(actor:{uid:string;role:string},input:{title:string;body:string;category?:NotificationCategory;priority?:NotificationPriority;target:NotificationTarget;senderName?:string;actionHref?:string;actionLabel?:string;context?:NotificationContext;dedupeKey?:string;expiresAt?:string}){
  const title=clean(input.title,180),body=clean(input.body,2000);if(!title||!body)throw new Error('NOTIFICATION_FIELDS_REQUIRED');
  const category:NotificationCategory=['admin','system','competition','identity','support'].includes(String(input.category))?input.category!:'admin';
  const priority:NotificationPriority=['normal','important','urgent'].includes(String(input.priority))?input.priority!:'normal';
  const target:NotificationTarget={type:input.target?.type,operatorId:clean(input.target?.operatorId,120)||undefined,organizationId:clean(input.target?.organizationId,120)||undefined,competitionId:clean(input.target?.competitionId,120)||undefined,role:clean(input.target?.role,80)||undefined,userId:clean(input.target?.userId,160)||undefined,userIds:Array.isArray(input.target?.userIds)?[...new Set(input.target!.userIds!.map(x=>clean(x,160)).filter(Boolean))].slice(0,200):undefined};
  if(!['all','operator','organization','competition','role','user','users'].includes(target.type))throw new Error('NOTIFICATION_TARGET_INVALID');
  if(target.type==='operator'&&!target.operatorId)throw new Error('NOTIFICATION_OPERATOR_REQUIRED');if(target.type==='organization'&&!target.organizationId)throw new Error('NOTIFICATION_ORGANIZATION_REQUIRED');if(target.type==='competition'&&!target.competitionId)throw new Error('NOTIFICATION_COMPETITION_REQUIRED');if(target.type==='role'&&!target.role)throw new Error('NOTIFICATION_ROLE_REQUIRED');if(target.type==='user'&&!target.userId)throw new Error('NOTIFICATION_USER_REQUIRED');if(target.type==='users'&&!target.userIds?.length)throw new Error('NOTIFICATION_USERS_REQUIRED');
  const s=this.read();const dedupeKey=clean(input.dedupeKey,180)||undefined;const context=cleanContext(input.context);
  if(dedupeKey){const existing=s.notifications.find(n=>n.dedupeKey===dedupeKey&&JSON.stringify(n.target)===JSON.stringify(target)&&Date.now()-Date.parse(n.createdAt)<15*60_000);if(existing)return {notification:existing,deduplicated:true}}
  const notification:NotificationRecord={id:crypto.randomUUID(),title,body,category,priority,target,senderName:clean(input.senderName,120)||undefined,createdBy:actor.uid,createdByRole:actor.role,createdAt:now(),actionHref:clean(input.actionHref,500)||undefined,actionLabel:clean(input.actionLabel,100)||undefined,context,dedupeKey,expiresAt:input.expiresAt&&Number.isFinite(Date.parse(input.expiresAt))?new Date(input.expiresAt).toISOString():undefined};
  s.notifications.unshift(notification);if(s.notifications.length>5000){const keep=new Set(s.notifications.slice(0,5000).map(x=>x.id));s.notifications=s.notifications.slice(0,5000);s.userStates=s.userStates.filter(x=>keep.has(x.notificationId))}this.write(s);return {notification,deduplicated:false};
 }
 system(input:Omit<Parameters<NotificationCenterRepository['publish']>[1],'category'> & {category?:NotificationCategory}){return this.publish({uid:'MIZAN_SYSTEM',role:'system'},{...input,category:input.category||'system'})}
 markRead(userId:string,id:string){const s=this.read();const row=this.stateFor(s,userId,id);row.readAt=now();this.write(s);return {id,readAt:row.readAt}}
 markAllRead(identity:ServerIdentity,contextKey?:string){const s=this.read();const visible=s.notifications.filter(n=>this.matches(identity,n.target)&&(!contextKey||notificationContextKey(n.context,n.target)===contextKey));const at=now();for(const n of visible){const row=this.stateFor(s,identity.uid,n.id);if(!row.archivedAt)row.readAt=at}this.write(s);return {count:visible.length,readAt:at,contextKey:contextKey||undefined}}
 archive(userId:string,id:string){const s=this.read();const row=this.stateFor(s,userId,id);row.archivedAt=now();row.readAt=row.readAt||row.archivedAt;this.write(s);return {id,archivedAt:row.archivedAt}}
}
