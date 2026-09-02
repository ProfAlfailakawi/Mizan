import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ServerAuditLedgerRepository } from '../server/audit-ledger';

const actor={uid:'judge-1',role:'judge',organizationId:'org-1',competitionId:'comp-1'};
const event=(id:string)=>({eventId:id,organizationId:'org-1',competitionId:'comp-1',action:'JUDGE_LOCK',entityType:'JudgingSession',entityId:'session-1',clientTimestamp:'2026-09-02T01:00:00Z',sessionId:'session-1',authenticationAssurance:'mfa',deviceId:'device-1'});

test('server evidence ledger is append-only, idempotent, tenant scoped and hash-verifiable',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-audit-'));try{const repo=new ServerAuditLedgerRepository(dir);const a=repo.append(actor,event('e1'));const b=repo.append(actor,event('e2'));assert.equal(a.idempotent,false);assert.equal(b.row.sequence,2);assert.equal(repo.append(actor,event('e2')).idempotent,true);assert.equal(repo.verify('org-1','comp-1').valid,true);assert.equal(repo.list(actor,'comp-1').length,2);assert.throws(()=>repo.append(actor,{...event('x'),organizationId:'other'}),/TENANT_MISMATCH/);}finally{fs.rmSync(dir,{recursive:true,force:true})}});

test('server evidence ledger detects on-disk tampering',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-audit-'));try{const repo=new ServerAuditLedgerRepository(dir);repo.append(actor,event('e1'));const file=fs.readdirSync(dir).find(x=>x.startsWith('audit-'))!;const full=path.join(dir,file);const rows=fs.readFileSync(full,'utf8').trim().split('\n').map(x=>JSON.parse(x));rows[0].action='ALTERED';fs.writeFileSync(full,rows.map(x=>JSON.stringify(x)).join('\n')+'\n');assert.equal(repo.verify('org-1','comp-1').valid,false);}finally{fs.rmSync(dir,{recursive:true,force:true})}});
