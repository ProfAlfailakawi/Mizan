import fitz,sys,json
from glyphs import *
from mk import markers
d=fitz.open(sys.argv[1]); res=[]
for i in range(len(d)):
    for f,u,bb,cs in sorted(page_glyphs(d,i),key=lambda g:(g[0],g[1])):
        for ox,v,dig in sorted(markers(cs),key=lambda m:-m[0]):
            res.append({'page':i,'cp':u,'bb':bb,'ox':ox,'variant':v,'dig':dig})
res.sort(key=lambda r:(r['page'],round((r['bb'][1]+r['bb'][3])/2/16),-r['bb'][0],-r['ox']))
json.dump(res,open(sys.argv[2],'w')); print(len(res), sum(r['variant'] for r in res))
