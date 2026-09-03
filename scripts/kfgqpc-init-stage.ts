#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(process.argv[2]||'.mizan-ingest');
const dev='https://qurancomplex.gov.sa/en/techquran/dev/';
const audio='https://qurancomplex.gov.sa/category/kfgqpc-quran-audio/recite/';
const fonts='https://fonts.qurancomplex.gov.sa/';
const specs=[
 ['hafs',dev,'Hafs Uthmanic 13.0'],['warsh',dev,'Warsh Uthmanic 6.0'],['shubah',dev,"Shu'bah Uthmanic 4.0"],['qalun',dev,'Qalun Uthmanic 5.0'],['duri-data',dev,"Al-Duri an Abi Amr Uthmanic 3.0"],['susi-data',dev,"Al-Susi an Abi Amr Uthmanic 3.0"],['tafsir',dev,'Tafseer Muyassar'],['ghareeb',dev,'Muyassar Ghareeb'],['tajweed',dev,'Tajweed Muyassar'],
 ['mushaf-pages','https://dm.qurancomplex.gov.sa/','Official Madinah Mushaf 604 delivery pages'],
 ['font-hafs',fonts,'Official KFGQPC Quran font - Hafs'],['font-warsh',fonts,'Official KFGQPC Quran font - Warsh'],['font-shubah',fonts,"Official KFGQPC Quran font - Shu'bah"],['font-qalun',fonts,'Official KFGQPC Quran font - Qalun'],['font-duri',fonts,'Official KFGQPC Quran font - Al-Duri'],['font-susi',fonts,'Official KFGQPC Quran font - Al-Susi'],
 ['audio-hafs',audio,'Hafs - Maher Al-Muaiqly'],['audio-shubah',audio,"Shu'bah - Ali Al-Hudhaifi"],['audio-qalun',audio,'Qalun - Ali Al-Hudhaifi'],['audio-susi',audio,'Al-Susi - Uthman Al-Siddiqi'],
 ['audio-duri','https://qurancomplex.gov.sa/sounds-douri-juhani/','Al-Duri - Abdullah Al-Juhani'],['audio-warsh','https://qc-dev.qurancomplex.gov.sa/quran-audios/','Warsh - Ibrahim Al-Dawsari']
] as const;
for(const [id,sourceUrl,packageName] of specs){const dir=path.join(root,id);fs.mkdirSync(path.join(dir,'payload'),{recursive:true});const meta=path.join(dir,'source.json');if(!fs.existsSync(meta))fs.writeFileSync(meta,JSON.stringify({sourceUrl,packageName,downloadedAt:'',sourceArchive:'',directOfficialDownloadVerified:id.startsWith('audio-')||id.startsWith('font-')?false:undefined},null,2)+'\n')}
fs.mkdirSync(path.join(root,'reports'),{recursive:true});console.log(root);
