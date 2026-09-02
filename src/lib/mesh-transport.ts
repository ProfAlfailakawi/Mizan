import type { LocalMeshEventRecord } from '../types';
export interface MeshWireEnvelope {version:'mizan-mesh-wire-v1';competitionId:string;sessionId:string;sentAt:string;event:LocalMeshEventRecord}
export interface MeshTransportAdapter {available:boolean;publish:(e:MeshWireEnvelope)=>void;close:()=>void}
export function createBrowserBroadcastMesh(input:{competitionId:string;sessionId:string;onEnvelope:(e:MeshWireEnvelope)=>void}):MeshTransportAdapter{
  if(typeof BroadcastChannel==='undefined')return {available:false,publish:()=>{},close:()=>{}};
  const channel=new BroadcastChannel(`mizan-mesh:${input.competitionId}:${input.sessionId}`);
  channel.onmessage=(ev)=>{const x=ev.data as MeshWireEnvelope;if(x?.version==='mizan-mesh-wire-v1'&&x.competitionId===input.competitionId&&x.sessionId===input.sessionId)input.onEnvelope(x)};
  return {available:true,publish:e=>channel.postMessage(e),close:()=>channel.close()};
}
