import path from 'node:path';
import {ServerQuranSourceRepository} from '../server/quran-source-repository';
import {QuranKnowledgeRepository} from '../server/quran-knowledge-repository';
import {deriveWaqfDatasetFromOfficialSource,verifyWaqfDatasetAgainstOfficialSource} from '../server/kfgqpc-waqf-derive';
import {QURAN_READINGS,quranReadingDefinition} from '../server/quran-intelligence-policy';

const arg=(name:string)=>{const i=process.argv.indexOf(`--${name}`);return i>=0?process.argv[i+1]:undefined};
const sourceDir=arg('source-dir')||process.env.MIZAN_QURAN_SOURCE_DIR||'';
const intelligenceDir=arg('intelligence-dir')||process.env.MIZAN_QURAN_INTELLIGENCE_DIR||(sourceDir?path.join(path.dirname(sourceDir),'quran-intelligence'):'');
const requested=arg('reading')||'all';
if(!sourceDir||!intelligenceDir)throw new Error('WAQF_DERIVE_DIRS_REQUIRED: set --source-dir and --intelligence-dir (or MIZAN_QURAN_SOURCE_DIR / MIZAN_QURAN_INTELLIGENCE_DIR)');

const quran=new ServerQuranSourceRepository(sourceDir);const knowledge=new QuranKnowledgeRepository(path.join(intelligenceDir,'knowledge'));
const readings=requested==='all'?QURAN_READINGS.map(x=>x.id):[quranReadingDefinition(requested)?.id].filter(Boolean) as any[];
if(!readings.length)throw new Error('WAQF_READING_UNSUPPORTED');
let failed=0;
for(const reading of readings){
  try{const dataset=deriveWaqfDatasetFromOfficialSource(quran,reading);verifyWaqfDatasetAgainstOfficialSource(dataset,quran);const status=knowledge.registerWaqf(dataset);console.log(JSON.stringify({reading,derived:true,status,coverage:dataset.coverage,datasetHash:dataset.provenance.generatedArtifactSha256}))}
  catch(err){failed++;console.error(JSON.stringify({reading,derived:false,code:err instanceof Error?err.message:'WAQF_DERIVATION_FAILED'}))}
}
if(failed)process.exitCode=1;
