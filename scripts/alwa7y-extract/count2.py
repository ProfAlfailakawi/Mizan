import json,sys
from digits import *
res=json.load(open(sys.argv[1]))
G=[groups(r['dig']) for r in res]
nd=[sum(2 if asp(g)>1.15 else 1 for g in gs) for gs in G]
one=[len(gs)==1 and asp(gs[0])<0.49 for gs in G]
sur=[];cur=[]
for i,o in enumerate(one):
    if o and cur: sur.append(cur);cur=[]
    cur.append(i)
sur.append(cur)
out=[]
for si,c in enumerate(sur,1):
    errs=[k for k,i in enumerate(c,1) if nd[i]!=len(str(k))]
    out.append({'surah':si,'count':len(c),'pages':[res[c[0]]['page'],res[c[-1]]['page']],'errs':errs[:5]})
print('groups',len(sur),'bad',[ (o['surah'],o['count'],o['pages'],o['errs']) for o in out if o['errs']])
print([o['count'] for o in out])
json.dump(out,open(sys.argv[1]+'.counts','w'))
