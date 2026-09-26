import json,sys,numpy as np
from PIL import Image,ImageDraw
from digits import *
res=json.load(open(sys.argv[1])); cnt=json.load(open(sys.argv[1]+'.counts'))
def split(gs):
    out=[]
    for g in gs:
        if asp(g)>1.15:  # two overlapped digits drawn as one outline
            b=g[0]; m=(b[0]+b[2])/2; out+= [((b[0],b[1],m,b[3]),g[1]),((m,b[1],b[2],b[3]),g[1])]
        else: out.append(g)
    return out
def img(g):
    (x0,y0,x1,y1),ps=g; S=40; s=max(x1-x0,y1-y0) or 1
    im=Image.new('L',(S,S)); dr=ImageDraw.Draw(im)
    for k,p in enumerate(ps):
        pts=[((a[0]-x0)/s*(S-4)+(S-(x1-x0)/s*(S-4))/2,(y1-a[1])/s*(S-4)+2) for a in p]
        pts=[(min(max(x,0),S),min(max(y,0),S)) for x,y in pts]
        if len(pts)>2: dr.polygon(pts,fill=255 if k==0 else 0)
    v=np.asarray(im.resize((20,20)),float).ravel()/255
    return np.append(v,[asp(g)*4,(y1-y0)/200])
G=[split(groups(r['dig'])) for r in res]
V=[[img(g) for g in gs] for gs in G]
X=[];Y=[]; i=0
for c in cnt:
    if not c['errs'] and c['count']>1:
        for k in range(1,c['count']+1):
            if len(V[i+k-1])==len(str(k)):
                for v,ch in zip(V[i+k-1],str(k)): X.append(v);Y.append(ch)
    i+=c['count']
X=np.array(X);Y=np.array(Y); print('train',len(X))
def cls(v):
    d=((X-v)**2).sum(1); idx=d.argsort()[:5]; vals,cn=np.unique(Y[idx],return_counts=True); return vals[cn.argmax()]
nums=[''.join(cls(v) for v in vs) for vs in V]
json.dump(nums,open(sys.argv[1]+'.read','w'))
# strict sequence: split at '1'
sur=[];cur=[]
for j,s in enumerate(nums):
    if s=='1' and cur: sur.append(cur);cur=[]
    cur.append(j)
sur.append(cur)
bad=[]
for si,c in enumerate(sur,1):
    ns=[nums[j] for j in c]
    if ns!=[str(k) for k in range(1,len(c)+1)]:
        k=next(k for k in range(len(c)) if ns[k]!=str(k+1)); bad.append((si,len(c),res[c[k]]['page'],ns[max(0,k-2):k+3]))
print('surahs',len(sur),'bad',len(bad)); [print(' ',b) for b in bad]
print([len(c) for c in sur])
json.dump([[res[j]['page'] for j in c] for c in sur],open(sys.argv[1]+'.sur','w'))
