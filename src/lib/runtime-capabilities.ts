export interface MizanRuntimeHealth {
  status:'ok'|'unknown';
  questionEscrowConfigured:boolean;
  passSigningConfigured:boolean;
  certificateSigningConfigured:boolean;
  trustSigningConfigured:boolean;
  edgeRelayConfigured:boolean;
  checkedAt:string;
  source:'server'|'unavailable';
}

export function normalizeRuntimeHealth(input:unknown):MizanRuntimeHealth{
  const x=(input&&typeof input==='object'?input:{}) as Record<string,unknown>;
  return {
    status:x.status==='ok'?'ok':'unknown',
    questionEscrowConfigured:x.questionEscrowConfigured===true,
    passSigningConfigured:x.passSigningConfigured===true,
    certificateSigningConfigured:x.certificateSigningConfigured===true,
    trustSigningConfigured:x.trustSigningConfigured===true,
    edgeRelayConfigured:x.edgeRelayConfigured===true,
    checkedAt:new Date().toISOString(),
    source:x.status==='ok'?'server':'unavailable'
  };
}

export async function fetchRuntimeHealth(signal?:AbortSignal):Promise<MizanRuntimeHealth>{
  try{
    const response=await fetch('/api/health',{method:'GET',headers:{Accept:'application/json'},signal,cache:'no-store'});
    if(!response.ok)return normalizeRuntimeHealth(null);
    return normalizeRuntimeHealth(await response.json());
  }catch{return normalizeRuntimeHealth(null)}
}

export function questionEscrowAssuranceFromHealth(health:MizanRuntimeHealth|undefined){
  return health?.questionEscrowConfigured?'production_server_escrow' as const:'operational_panel_gate' as const;
}
