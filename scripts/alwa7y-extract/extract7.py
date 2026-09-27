import fitz,sys,json,io
from fontTools.ttLib import TTFont
from glyphs import contours
from mk import markers
d=fitz.open(sys.argv[1]); res=[]; cache={}
def font(x):
    if x not in cache:
        try: ft=TTFont(io.BytesIO(d.extract_font(x)[3])); cache[x]=(ft.getGlyphSet(),ft.getGlyphOrder(),{})
        except Exception: cache[x]=None
    return cache[x]
for i in range(len(d)):
    p=d[i]; byname={}
    for f in p.get_fonts(): byname.setdefault(f[3].split('+')[-1],[]).append(f[0])
    for sp in p.get_texttrace():
        fn=sp['font']
        if '_P' not in fn: continue
        if sp.get('opacity',1)==0 or sp.get('type',0)==3: continue
        for ch in sp['chars']:
            gid=ch[1]; found=None
            for x in byname.get(fn,[]):
                F=font(x)
                if not F or gid>=len(F[1]): continue
                gs,go,mc=F
                if gid not in mc: mc[gid]=sorted(markers(contours(gs,go[gid]) or []),key=lambda m:-m[0])
                if mc[gid]: found=mc[gid]; break
            for ox,v,dig in found or []:
                b=ch[3]; res.append({'page':i,'bb':list(b),'ox':ox,'variant':v,'dig':dig})
    if i%150==0: cache.clear()
# drop exact duplicates (same page, same position)
seen=set(); out=[]
for r in res:
    k=(r['page'],round(r['bb'][0]),round(r['bb'][1]),round(r['ox']))
    if k in seen: continue
    seen.add(k); out.append(r)
out.sort(key=lambda r:(r['page'],round((r['bb'][1]+r['bb'][3])/2/16),-r['bb'][0],-r['ox']))
json.dump(out,open(sys.argv[2],'w')); print(len(out))
