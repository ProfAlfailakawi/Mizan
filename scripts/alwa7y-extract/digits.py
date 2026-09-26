def bb(p): xs=[a[0] for a in p]; ys=[a[1] for a in p]; return min(xs),min(ys),max(xs),max(ys)
def area(b): return max(0,b[2]-b[0])*max(0,b[3]-b[1])
def inter(a,b): return area((max(a[0],b[0]),max(a[1],b[1]),min(a[2],b[2]),min(a[3],b[3])))
def inside(a,b): return inter(a,b)>=0.97*area(a) and area(a)<0.5*area(b)
def groups(dig):
    bs=[bb(p) for p in dig]
    tops=[i for i,b in enumerate(bs) if not any(inside(b,o) for j,o in enumerate(bs) if j!=i)]
    gs=[]
    for t in tops:
        b=bs[t]
        if b[3]-b[1]<150 and b[1]>950: continue          # corner ornament dot
        if any(area(g[0]) and inter(b,g[0])>0.6*min(area(b),area(g[0])) for g in gs): continue  # redrawn duplicate
        gs.append((b,[dig[t]]+[dig[j] for j,o in enumerate(bs) if j!=t and inside(o,b)]))
    gs.sort(key=lambda g:g[0][0]); return gs
def asp(g): b=g[0]; return (b[2]-b[0])/max(1,b[3]-b[1])
