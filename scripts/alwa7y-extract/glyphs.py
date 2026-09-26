import fitz,io,collections,sys
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen
def contours(gs,name):
    pen=RecordingPen(); gs[name].draw(pen); cs=[];cur=[]
    for op,args in pen.value:
        cur.append((op,args))
        if op in('closePath','endPath'): cs.append(tuple(cur));cur=[]
    return cs
def page_glyphs(d,i):
    p=d[i]; out=[]
    fonts={f[4]:f for f in p.get_fonts()}
    cache={}
    for b in p.get_text('rawdict')['blocks']:
      for l in b.get('lines',[]):
        for s in l['spans']:
          if '_P' not in s['font']: continue
          cands=[f[0] for f in p.get_fonts() if f[3].endswith(s['font'])]
          for fx in cands:
            if fx not in cache:
              ft=TTFont(io.BytesIO(d.extract_font(fx)[3])); cache[fx]=(ft,ft.getGlyphSet(),ft.getBestCmap() or {})
          for c in s['chars']:
            g=None
            for fx in cands:
              ft,gs,cm=cache[fx]; g=cm.get(ord(c['c']))
              if g and g!='space': break
              g=None
            if g: out.append((s['font'],ord(c['c']),c['bbox'],contours(gs,g)))
    return out
def cbbox(c):
    pts=[p for op,a in c for p in a if p is not None] or [(0,0)]; xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
    return min(xs),min(ys),max(xs),max(ys)
def is_ring(c):
    x0,y0,x1,y1=cbbox(c); return 1600<x1-x0<2000 and 1600<y1-y0<2000
def norm(c):
    x0,y0,_,_=cbbox(c)
    return tuple((op,tuple((round((p[0]-x0)/8),round((p[1]-y0)/8)) for p in a if p is not None)) for op,a in c)
