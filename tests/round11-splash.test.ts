import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(process.cwd());

test('premium splash is wired before onboarding on normal app entry',()=>{
 const app=fs.readFileSync(path.join(root,'src/App.tsx'),'utf8');
 assert.match(app,/SplashExperience/);
 assert.match(app,/if\(splashOpen\) return <SplashExperience/);
 assert.ok(app.indexOf('if(splashOpen) return <SplashExperience')<app.indexOf('if(onboardingOpen) return <OnboardingExperience'));
});

test('splash asset is local, preloaded and web optimized',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const asset=path.join(root,'public/brand/mizan-splash.webp');
 assert.ok(fs.existsSync(asset));
 assert.ok(fs.statSync(asset).size<150_000,'splash should stay lightweight');
 assert.match(html,/preload[^>]+\/brand\/mizan-splash\.webp/);
});

test('splash respects reduced motion and deep links do not block verification routes',()=>{
 const app=fs.readFileSync(path.join(root,'src/App.tsx'),'utf8');
 const css=fs.readFileSync(path.join(root,'src/index.css'),'utf8');
 assert.match(app,/useState\(\(\)=>!window\.location\.hash\)/);
 assert.match(css,/@media \(prefers-reduced-motion: reduce\).*mizan-splash-art/s);
});
