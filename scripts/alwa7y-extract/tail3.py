import json,sys,fitz
pdf,js=sys.argv[1],sys.argv[2]
res=json.load(open(js)); f=json.load(open(js+'.final')); d=fitz.open(pdf); out=[]
for s,i in enumerate(f['lasts']):
    r=res[i]; pg=r['page']
    if i+1<len(res) and res[i+1]['page']==pg and s<113: continue
    ly=(r['bb'][1]+r['bb'][3])/2; words=0
    for b in d[pg].get_text('rawdict')['blocks']:
        for l in b.get('lines',[]):
            for sp in l['spans']:
                if '_P' not in sp['font']: continue
                for c in sp['chars']:
                    cy=(c['bbox'][1]+c['bbox'][3])/2
                    if c['bbox'][2]-c['bbox'][0]<3 or c['bbox'][0]<90 or c['bbox'][2]>560: continue
                    if cy>ly+8 or (abs(cy-ly)<=8 and c['bbox'][2]<r['bb'][0]-2): words+=1
    if words: out.append((s+1,f['counts'][s],pg,words))
print(out)
