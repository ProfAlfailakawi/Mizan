from glyphs import cbbox
def poly(c): return [p for op,a in c for p in a if p is not None]
def markers(cs):
    bbs=[cbbox(c) for c in cs]; out=[]
    W=lambda b:b[2]-b[0]; H=lambda b:b[3]-b[1]
    for o in bbs:
        h=H(o)
        if h<1000: continue
        for kind,ri,rw in (('std',(0.80,0.83),(0.77,0.81)),('var',(0.715,0.745),(0.95,0.975))):
            I=[b for b in bbs if ri[0]<=H(b)/h<=ri[1] and 0.8<=W(b)/H(b)<=1.15 and o[0]-50<=b[0] and b[2]<=o[2]+50]
            Wc=[b for b in bbs if b is not o and rw[0]<=H(b)/h<=rw[1]]
            if I and Wc:
                r=I[0]; sx=1720/W(r); sy=1721/H(r)
                dig=[[[(p[0]-r[0])*sx,(p[1]-r[1])*sy] for p in poly(c)] for b,c in zip(bbs,cs)
                     if b!=r and r[0]<b[0] and b[2]<r[2] and r[1]<b[1] and b[3]<r[3] and W(b)<0.8*W(r)]
                out.append((r[0],kind=='var',dig)); break
    # dedupe same ring
    seen=set(); res=[]
    for m in out:
        if m[0] in seen: continue
        seen.add(m[0]); res.append(m)
    return res
