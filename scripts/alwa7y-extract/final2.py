import json,sys
res=json.load(open(sys.argv[1])); nums=json.load(open(sys.argv[1]+'.read'))
idx=[i for i,r in enumerate(res) if r['page']<=640]
counts=[];anom=[];e=None;lasts=[];prev_i=None
for i in idx:
    r=nums[i]; v=int(r) if r.isdigit() else -1
    if e is not None:
        exp=e+1
        if r==str(exp): e=exp; prev_i=i; continue
        if r==str(exp+1): anom.append((len(counts),'GAP',exp,res[i]['page'])); e=exp+1; prev_i=i; continue
        if len(r)==len(str(exp))+1 and any(r[:k]+r[k+1:]==str(exp) for k in range(len(r))): anom.append((len(counts),'DUP_DIGIT',exp,r,res[i]['page'])); e=exp; prev_i=i; continue
        if v>exp and all(k<len(idx) and nums[idx[k]]==str(v+j) for j,k in ((j,idx.index(i)+j) for j in (1,2,3))):
            anom.append((len(counts),'RESYNC',exp,r,res[i]['page'])); e=v; prev_i=i; continue
        if not (0<v<=3 and v<e):
            anom.append((len(counts),'MISREAD',exp,r,res[i]['page'])); e=exp; prev_i=i; continue
        counts.append(e); lasts.append(prev_i)
        if v!=1: anom.append((len(counts)+1,'START_UNREAD',v,res[i]['page']))
    e=v
    prev_i=i
counts.append(e); lasts.append(prev_i)
print(len(counts),'surahs total',sum(counts)); [print(' ',a) for a in anom if a[1] not in('GAP','DUP_DIGIT')]
json.dump({'counts':counts,'anomalies':anom,'lasts':lasts},open(sys.argv[1]+'.final','w'))
