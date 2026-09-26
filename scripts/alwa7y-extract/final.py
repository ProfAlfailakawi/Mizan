import json,sys
res=json.load(open(sys.argv[1])); nums=json.load(open(sys.argv[1]+'.read'))
idx=[i for i,r in enumerate(res) if r['page']<=640]
sur=[];cur=[]
for i in idx:
    if nums[i]=='1' and cur: sur.append(cur);cur=[]
    cur.append(i)
sur.append(cur)
counts=[];anom=[]
for si,c in enumerate(sur,1):
    e=0
    for i in c:
        r=nums[i]; exp=e+1
        if r==str(exp): e=exp; continue
        if r==str(exp+1): anom.append((si,'GAP',exp,res[i]['page'])); e=exp+1; continue
        if len(r)==len(str(exp))+1 and any(r[:k]+r[k+1:]==str(exp) for k in range(len(r))): anom.append((si,'DUP_DIGIT',exp,r,res[i]['page'])); e=exp; continue
        anom.append((si,'MISREAD',exp,r,res[i]['page'])); e=exp
    counts.append(e)
print(len(sur),'surahs; total',sum(counts))
for a in anom: print(' ',a)
json.dump({'counts':counts,'anomalies':anom},open(sys.argv[1]+'.final','w'))
