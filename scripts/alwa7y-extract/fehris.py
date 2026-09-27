import fitz,sys,json
d=fitz.open(sys.argv[1]); counts=[]
pages=[i for i in range(len(d)-150,len(d)) if d[i].search_for('عدد آياتها')]
for i in pages:
    p=d[i]
    hb=[b for b in p.get_text('words') if 'آياتها' in b[4]]
    rs=p.search_for('عدد آياتها'); hx=fitz.Rect(min(r.x0 for r in rs),min(r.y0 for r in rs),max(r.x1 for r in rs),max(r.y1 for r in rs))
    x0,x1=hx.x0-10,hx.x1+10
    digs=[]
    for sp in p.get_texttrace():
        if 'Traditional' not in sp['font']: continue
        for ch in sp['chars']:
            g=ch[1]; b=ch[3]
            if 205<=g<=214 and x0<=(b[0]+b[2])/2<=x1 and b[1]>hx.y1: digs.append((ch[2][1],ch[2][0],str(g-205)))
    digs.sort()
    lines=[]
    for y,x,c in digs:
        if lines and abs(lines[-1][0]-y)<5: lines[-1][1].append((x,c))
        else: lines.append([y,[(x,c)]])
    for y,L in lines:
        if y>p.rect.height*0.93: continue   # رقم صفحة التذييل
        counts.append(int(''.join(c for _,c in sorted(L))))
print(len(counts),sum(counts)); print(counts)
json.dump(counts,open(sys.argv[2],'w'))
