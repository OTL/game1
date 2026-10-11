// うさどくのステージ生成: node tools/generate.js out.json
// くぎり・行・列に 1 ぴきずつ、となりあわない。答えが 1 とおりで、推理だけで解けるものをえらぶ
let seed = 20261011;
function rnd(){ seed = (seed*1664525+1013904223)>>>0; return seed/4294967296; }
function ri(n){ return Math.floor(rnd()*n); }
function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=ri(i+1);[a[i],a[j]]=[a[j],a[i]];} return a; }

function placeQueens(n){
  const cols=[]; const used=new Array(n).fill(false);
  function rec(r){
    if(r===n) return true;
    const order=shuffle([...Array(n).keys()]);
    for(const c of order){
      if(used[c]) continue;
      if(r>0 && Math.abs(cols[r-1]-c)<=1) continue;
      used[c]=true; cols[r]=c;
      if(rec(r+1)) return true;
      used[c]=false;
    }
    return false;
  }
  rec(0); return cols;
}
function growRegions(n, q){
  const g=new Array(n*n).fill(-1);
  const frontier=[];
  for(let r=0;r<n;r++){ g[r*n+q[r]]=r; }
  // weights per region to vary sizes
  const w=[...Array(n)].map(()=>0.3+rnd()*1.7);
  let left=n*n-n;
  while(left>0){
    // pick region weighted, then random boundary cell
    let tot=0; for(const x of w) tot+=x;
    let t=rnd()*tot, reg=0; for(;reg<n;reg++){ t-=w[reg]; if(t<=0) break; } if(reg>=n) reg=n-1;
    const cand=[];
    for(let i=0;i<n*n;i++) if(g[i]===reg){
      const r=(i/n)|0,c=i%n;
      for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const rr=r+dr,cc=c+dc; if(rr<0||cc<0||rr>=n||cc>=n) continue;
        if(g[rr*n+cc]===-1) cand.push(rr*n+cc);
      }
    }
    if(!cand.length){ w[reg]*=0.2; if(w.every(x=>x<1e-6)) break; 
      // check if any region can still grow
      let any=false; for(let i=0;i<n*n&&!any;i++) if(g[i]===-1){const r=(i/n)|0,c=i%n; for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){const rr=r+dr,cc=c+dc; if(rr>=0&&cc>=0&&rr<n&&cc<n&&g[rr*n+cc]>=0) any=true;}}
      if(!any) break; continue; }
    g[cand[ri(cand.length)]]=reg; left--;
  }
  return g;
}
function countSolutions(n,g,limit=2){
  let cnt=0; const usedC=new Array(n).fill(false), usedR=new Array(n).fill(false); const cols=[];
  function rec(r){
    if(cnt>=limit) return;
    if(r===n){ cnt++; return; }
    for(let c=0;c<n;c++){
      if(usedC[c]) continue; const reg=g[r*n+c]; if(usedR[reg]) continue;
      if(r>0 && Math.abs(cols[r-1]-c)<=1) continue;
      usedC[c]=usedR[reg]=true; cols[r]=c; rec(r+1); usedC[c]=usedR[reg]=false;
    }
  }
  rec(0); return cnt;
}
// logical solver; returns {solved, score}
function logicSolve(n,g){
  const N=n*n; const st=new Array(N).fill(0); // 0 unknown, 1 X, 2 bunny
  const units=[]; // rows, cols, regions
  for(let r=0;r<n;r++){ units.push([...Array(n).keys()].map(c=>r*n+c)); }
  for(let c=0;c<n;c++){ units.push([...Array(n).keys()].map(r=>r*n+c)); }
  for(let k=0;k<n;k++){ const u=[]; for(let i=0;i<N;i++) if(g[i]===k) u.push(i); units.push(u); }
  const nb=i=>{const r=(i/n)|0,c=i%n,res=[];for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){if(!dr&&!dc)continue;const rr=r+dr,cc=c+dc;if(rr>=0&&cc>=0&&rr<n&&cc<n)res.push(rr*n+cc);}return res;};
  const cellUnits=[...Array(N)].map((_,i)=>[ (i/n)|0, n+i%n, 2*n+g[i] ]);
  function place(i,s){ s[i]=2; for(const u of cellUnits[i]) for(const j of units[u]) if(j!==i&&s[j]===0) s[j]=1; for(const j of nb(i)) if(s[j]===0) s[j]=1; }
  function contradiction(s){ for(const u of units){ let ok=false; for(const j of u) if(s[j]!==1){ok=true;break;} if(!ok) return true; } return false; }
  let score=0, level=0;
  for(let iter=0;iter<500;iter++){
    if(st.filter(x=>x===2).length===n) return {solved:true,score,level};
    let prog=false;
    // L1: single candidate in unit
    for(const u of units){ if(u.some(j=>st[j]===2)) continue; const c=u.filter(j=>st[j]===0); if(c.length===1){ place(c[0],st); prog=true; score+=1; } }
    if(prog) continue;
    // L2: a cell whose placement empties some unit -> X
    for(let i=0;i<N;i++){ if(st[i]!==0) continue; const s=st.slice(); place(i,s); if(contradiction(s)){ st[i]=1; prog=true; score+=3; level=Math.max(level,2);} }
    if(prog) continue;
    // L3: k units confined to k lines (k up to 3) -> eliminate other cells in those lines
    for(let k=1;k<=4 && !prog;k++){
      // regions combos within rows / cols
      const regs=[]; for(let r=0;r<n;r++){ const u=units[2*n+r]; if(!u.some(j=>st[j]===2)) regs.push(r); }
      const combos=(arr,k)=>{const res=[];const f=(s,cur)=>{if(cur.length===k){res.push(cur.slice());return;}for(let i=s;i<arr.length;i++){cur.push(arr[i]);f(i+1,cur);cur.pop();}};f(0,[]);return res;};
      if(regs.length<=k) break;
      for(const cb of combos(regs,k)){
        for(const axis of [0,1]){
          const lines=new Set();
          for(const reg of cb) for(const j of units[2*n+reg]) if(st[j]===0) lines.add(axis?j%n:(j/n)|0);
          if(lines.size===k){
            for(const L of lines){ const u=units[axis? n+L : L]; for(const j of u) if(st[j]===0 && !cb.includes(g[j])){ st[j]=1; prog=true; } }
          }
          // inverse: k lines fully inside k regions
        }
        if(prog){ score+=4*k; level=Math.max(level,2+k); break; }
      }
      if(prog) break;
      // lines confined to regions
      const freeLines=[]; for(let a=0;a<2;a++) for(let L=0;L<n;L++){ const u=units[a*n+L]; if(!u.some(j=>st[j]===2)) freeLines.push([a,L]); }
      for(const axis of [0,1]){
        const ls=freeLines.filter(x=>x[0]===axis).map(x=>x[1]);
        if(ls.length<=k) continue;
        for(const cb of combos(ls,k)){
          const rs=new Set(); for(const L of cb) for(const j of units[axis*n+L]) if(st[j]===0) rs.add(g[j]);
          if(rs.size===k){ for(const reg of rs) for(const j of units[2*n+reg]) if(st[j]===0){ const L=axis?j%n:(j/n)|0; if(!cb.includes(L)){ st[j]=1; prog=true; } } }
          if(prog) break;
        }
        if(prog){ score+=4*k; level=Math.max(level,2+k); break; }
      }
    }
    if(!prog) return {solved:false,score,level};
  }
  return {solved:false,score,level};
}

function findAlt(n,g,q){
  let res=null; const usedC=new Array(n).fill(false), usedR=new Array(n).fill(false); const cols=[];
  function rec(r){
    if(res) return;
    if(r===n){ if(cols.some((c,i)=>c!==q[i])) res=cols.slice(); return; }
    for(let c=0;c<n;c++){
      if(usedC[c]) continue; const reg=g[r*n+c]; if(usedR[reg]) continue;
      if(r>0 && Math.abs(cols[r-1]-c)<=1) continue;
      usedC[c]=usedR[reg]=true; cols[r]=c; rec(r+1); usedC[c]=usedR[reg]=false; if(res) return;
    }
  }
  rec(0); return res;
}
function connected(n,g,reg){
  const cells=[]; for(let i=0;i<n*n;i++) if(g[i]===reg) cells.push(i);
  if(!cells.length) return false;
  const seen=new Set([cells[0]]), st=[cells[0]];
  while(st.length){ const i=st.pop(); const r=(i/n)|0,c=i%n; for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){const rr=r+dr,cc=c+dc; if(rr<0||cc<0||rr>=n||cc>=n) continue; const j=rr*n+cc; if(g[j]===reg&&!seen.has(j)){seen.add(j);st.push(j);}}}
  return seen.size===cells.length;
}
function gen2(n, minLevel){
  for(let t=0;t<100000;t++){
    const q=placeQueens(n); const g=growRegions(n,q);
    if(g.includes(-1)) continue;
    const qset=new Set(q.map((c,r)=>r*n+c));
    let ok=false;
    for(let step=0;step<60;step++){
      const alt=findAlt(n,g,q);
      if(!alt){ ok=true; break; }
      // alt queen cells not in true solution
      const altCells=shuffle(alt.map((c,r)=>r*n+c).filter(i=>!qset.has(i)));
      let changed=false;
      for(const a of altCells){
        const r=(a/n)|0,c=a%n, R=g[a];
        const nbr=shuffle([[1,0],[-1,0],[0,1],[0,-1]].map(([dr,dc])=>[r+dr,c+dc]).filter(([rr,cc])=>rr>=0&&cc>=0&&rr<n&&cc<n).map(([rr,cc])=>g[rr*n+cc]).filter(S=>S!==R));
        for(const S of nbr){ g[a]=S; if(connected(n,g,R)){changed=true;break;} g[a]=R; }
        if(changed) break;
      }
      if(!changed) break;
    }
    if(!ok) continue;
    const ls=logicSolve(n,g); if(!ls.solved || ls.level<minLevel) continue;
    return {n,g,q,score:ls.score,level:ls.level,tries:t};
  }
}
function gen(n){
  for(let t=0;t<200000;t++){
    const q=placeQueens(n); const g=growRegions(n,q);
    if(g.includes(-1)) continue;
    if(countSolutions(n,g)!==1) continue;
    const ls=logicSolve(n,g); if(!ls.solved) continue;
    return {n,g,q,score:ls.score,level:ls.level,tries:t};
  }
}
const plan=[[5,10],[6,15],[7,20],[8,20],[9,20],[10,15]];
const out=[];
for(const [n,k] of plan){
  const list=[]; const t0=Date.now();
  for(let i=0;i<k*2;i++) list.push(i<2&&n===5?gen2(n,0):gen2(n,n<=5?0:2));
  // choose k spread by difficulty: sort and take evenly
  list.sort((a,b)=>a.level-b.level||a.score-b.score);
  const step=list.length/k; const pick=[]; for(let i=0;i<k;i++) pick.push(list[Math.floor(i*step+step/2)]);
  console.error(n, Date.now()-t0+'ms', pick.map(p=>p.level+':'+p.score).join(' '));
  out.push(...pick);
}
const A='ABCDEFGHIJ';
const enc=out.map(p=>p.g.map(x=>A[x]).join('')+'|'+p.q.join(''));
require('fs').writeFileSync(process.argv[2], JSON.stringify(enc));
