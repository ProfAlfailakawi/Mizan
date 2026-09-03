import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(process.cwd());
const read=(p:string)=>fs.readFileSync(path.join(root,p),'utf8');

test('premium splash is wired before onboarding on normal app entry',()=>{
 const app=read('src/App.tsx');
 assert.match(app,/SplashExperience/);
 assert.match(app,/if\(splashOpen\) return <SplashExperience/);
 assert.ok(app.indexOf('if(splashOpen) return <SplashExperience')<app.indexOf('if(onboardingOpen) return <OnboardingExperience'));
});

/*
 * The splash used to letterbox a 941x1672 raster poster, so this suite guarded its
 * weight and preload. The splash is now drawn from the brand geometry itself, which
 * makes the stronger promise the old test was approximating: no asset request at all,
 * and no burned-in text that cannot be corrected.
 */
test('splash is pure vector: no image asset, no burned-in wordmark',()=>{
 const splash=read('src/components/public/SplashExperience.tsx');
 assert.ok(!/<img\b/.test(splash),'splash must not load a raster asset');
 assert.ok(!/url\(|\.webp|\.png|\.jpg/.test(splash),'splash must not reference an image file');
 assert.match(splash,/MizanMark/,'splash renders the vector brand mark');
 assert.match(splash,/نظام المسابقات القرآنية/,'tagline is real text, not pixels');
});

test('splash mark animation is defined in CSS and respects reduced motion',()=>{
 const app=read('src/App.tsx');
 const css=read('src/index.css');
 assert.match(app,/useState\(\(\)=>!window\.location\.hash\)/);
 assert.match(css,/\.mizan-mark\.is-animated \.mz-arch/,'mark parts are choreographed in CSS');
 assert.match(css,/@media \(prefers-reduced-motion: reduce\)\{\s*\.mizan-splash,\.mizan-splash \*/s);
});

test('splash can be dismissed by the reader instead of only by its timer',()=>{
 const splash=read('src/components/public/SplashExperience.tsx');
 assert.match(splash,/Escape/);
 assert.match(splash,/addEventListener\('keydown'/);
});
