import json,sys,fitz
pdf,js=sys.argv[1],sys.argv[2]
res=json.load(open(js)); flags=json.load(open(js+'.flags')); nums=json.load(open(js+'.read'))
d=fitz.open(pdf); out=[]
idx=[i for i,r in enumerate(res) if r['page']<=640]; starts=[i for i in idx if nums[i]=='1']
for s,cnt,pg in flags:
    last=(starts[s] if s<114 else idx[-1]+1)-1; r=res[last]
    ly=(r['bb'][1]+r['bb'][3])/2
    words=0
    for b in d[pg].get_text('rawdict')['blocks']:
        for l in b.get('lines',[]):
            for sp in l['spans']:
                if 'Dory1_P' not in sp['font'] and 'Sosy_P' not in sp['font']: continue
                for c in sp['chars']:
                    cy=(c['bbox'][1]+c['bbox'][3])/2; w=c['bbox'][2]-c['bbox'][0]
                    if w<3: continue
                    if cy>ly+8 or (abs(cy-ly)<=8 and c['bbox'][2]<r['bb'][0]-2): words+=1
    out.append((s,cnt,pg,words))
print([o for o in out if o[3]>0])
json.dump(out,open(js+'.tail','w'))
