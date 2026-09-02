import { sha256 } from './crypto';
import type { QuorumActionRecord, Role } from '../types';

export function canonicalStringify(value:unknown):string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  const obj=value as Record<string,unknown>;
  return `{${Object.keys(obj).sort().map(k=>`${JSON.stringify(k)}:${canonicalStringify(obj[k])}`).join(',')}}`;
}
export async function hashCanonical(value:unknown){ return sha256(canonicalStringify(value)); }

export async function buildMerkleTree(materials:string[]){
  if(!materials.length)return {root:'',levels:[] as string[][]};
  const first=await Promise.all(materials.map(sha256)); const levels=[first]; let current=first;
  while(current.length>1){const next:string[]=[];for(let i=0;i<current.length;i+=2){const left=current[i],right=current[i+1]??left;next.push(await sha256(left+right));}levels.push(next);current=next;}
  return {root:current[0],levels};
}
export function merkleProofForIndex(levels:string[][],index:number){
  const proof:{position:'left'|'right';hash:string}[]=[];let idx=index;
  for(let level=0;level<levels.length-1;level++){const row=levels[level];const sibling=idx%2===0?idx+1:idx-1;proof.push({position:idx%2===0?'right':'left',hash:row[sibling]??row[idx]});idx=Math.floor(idx/2);}
  return proof;
}
export async function verifyMerkleProof(material:string,proof:{position:'left'|'right';hash:string}[],root:string){
  let current=await sha256(material);for(const item of proof)current=await sha256(item.position==='left'?item.hash+current:current+item.hash);return current===root;
}
export function finishMinutes(clock:string){const [h,m]=clock.replace('+','').split(':').map(Number);return (Number.isFinite(h)?h:0)*60+(Number.isFinite(m)?m:0);}
export function quorumSatisfied(q:Pick<QuorumActionRecord,'requiredRoleGroups'|'approvals'|'distinctActorsRequired'|'minimumApprovals'|'authorizedRoles'>){
  const activeApprovals=q.approvals;
  if(q.minimumApprovals!==undefined){
    const allowed=q.authorizedRoles?.length?q.authorizedRoles:q.requiredRoleGroups.flat();
    const eligible=activeApprovals.filter(a=>allowed.includes(a.actorRole as Role));
    const actorCount=new Set(eligible.map(a=>a.actorId)).size;
    return actorCount>=q.minimumApprovals&&(!q.distinctActorsRequired||actorCount>=q.minimumApprovals);
  }
  const groups=q.requiredRoleGroups.every(group=>activeApprovals.some(a=>group.includes(a.actorRole as Role)));
  const distinct=!q.distinctActorsRequired||new Set(activeApprovals.map(a=>a.actorId)).size>=q.requiredRoleGroups.length;
  return groups&&distinct;
}
