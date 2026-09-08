import type { BrandDisplayPlacements } from '../types';
export interface PublicTenant {
 orgId:string;status?:'active'|'suspended';displayName:string|null;displayNameArabic:string|null;logoUrl:string|null;
 slogan?:string|null;sloganArabic?:string|null;websiteUrl?:string|null;phoneNumber?:string|null;supportEmail?:string|null;address?:string|null;addressArabic?:string|null;displayPlacements?:BrandDisplayPlacements|null;certificateTheme?:'quiet_authority'|'institutional'|'ceremonial'|null;
}
export async function fetchTenant(signal?:AbortSignal):Promise<PublicTenant|null>{
 try{const r=await fetch('/api/public/tenant',{signal,headers:{accept:'application/json'}});if(r.status===204)return null;const body=await r.json().catch(()=>null) as PublicTenant|null;if(!r.ok||!body||typeof body.orgId!=='string'||!body.orgId)return null;return body}catch{return null}
}
