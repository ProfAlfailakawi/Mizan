#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(process.argv[2]||process.env.MIZAN_QURAN_INTELLIGENCE_ROOT||'.mizan-quran-intelligence');
const readings=['hafs','warsh','shubah','qaloun','douri-abu-amr','sousi-abu-amr'];
const exists=(...parts:string[])=>fs.existsSync(path.join(root,...parts));
const rows=readings.map(reading=>({reading,vector:exists('vector',`${reading}.json`)?'PRESENT':'PENDING_OFFICIAL_MASTER',waqf:exists('knowledge',`waqf-${reading}.json`)?'PRESENT':'PENDING_OFFICIAL_TEXT',tajweed:exists('knowledge',`tajweed-${reading}.json`)?'PRESENT':'PENDING_OFFICIAL_SCIENCE',benchmark:exists('benchmarks',`${reading}.json`)?'PRESENT':'PENDING_ALIGNMENT_ENGINE'}));
console.log(JSON.stringify({protocol:'MIZAN-QURAN-READINESS-LOCAL-1',root,rows},null,2));
