import json,sys,fitz
pdf,js=sys.argv[1],sys.argv[2]
res=json.load(open(js)); nums=json.load(open(js+'.read')); fin=json.load(open(js+'.final'))
d=fitz.open(pdf)
def lastline_y(pg):
    ys=[]
    for b in d[pg].get_text('rawdict')['blocks']:
        for l in b.get('lines',[]):
            for s in l['spans']:
                if '_P' in s['font'] and any(ord(c['c'])>0x2000 for c in s['chars']): ys.append(l['bbox'][3])
    return max(ys) if ys else 0
idx=[i for i,r in enumerate(res) if r['page']<=640]
starts=[i for i in idx if nums[i]=='1']
flags=[]
for s in range(114):
    last=(starts[s+1] if s<113 else idx[-1]+1)-1
    r=res[last]; nxt=res[starts[s+1]] if s<113 else None
    ly=lastline_y(r['page'])
    on_last = r['bb'][3] >= ly-6
    if not on_last and (nxt is None or nxt['page']>r['page']):
        flags.append((s+1,fin['counts'][s],r['page']))
print(flags)
json.dump(flags,open(js+'.flags','w'))
