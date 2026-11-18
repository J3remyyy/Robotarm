'use strict';
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
const defs=[['Basis',800,3450,'Q','A'],['Schulter',900,3200,'W','S'],['Ellbogen',1000,3050,'E','D'],['Handgelenk · Neigung',900,3200,'R','F'],['Werkzeug · Rotation',180,3900,'T','G'],['Greifer',1230,2600,'Z','H']];
const neutral=[1929,2044,2093,2044,2056,2445];
let pose=[1929,3867,48,2044,2056,2445],actual=null,desired=null,port=null,writer=null,reader=null,pending=null,connected=false,ready=false,connecting=false,paused=false,drag=null,held=null,lastQuery=0,session=0,endTarget=null,lastFrame=0;
const touches=new Map();let pinch=null;
const clamp=v=>Math.max(0,Math.min(4095,Math.round(v))),rad=a=>a*Math.PI/180,deg=a=>a*180/Math.PI;
const angle=(i,v=pose[i])=>(defs[i][1]+v/4095*(defs[i][2]-defs[i][1])-2048)*360/4096;
const fromAngle=(i,a)=>clamp((2048+a*4096/360-defs[i][1])/(defs[i][2]-defs[i][1])*4095);
const bounds=[1,2,3].map(i=>[angle(i,0),angle(i,4095)]);
function msg(s){$('message').textContent=s}function log(s){const e=$('log');e.textContent=(e.textContent+s+'\n').split('\n').slice(-100).join('\n');e.scrollTop=e.scrollHeight}
function geometry(p=pose){let a=rad(90-angle(1,p[1])),b=a-rad(90+angle(2,p[2])),c=b-rad(angle(3,p[3]));let pts=[[0,0]];[[115,a],[135,b],[165,c]].forEach(([l,t])=>{let q=pts.at(-1);pts.push([q[0]+l*Math.cos(t),q[1]+l*Math.sin(t)])});return pts}
function world(p=pose){const [r,z]=geometry(p)[3],a=rad(angle(0,p[0]));return [r*Math.cos(a),r*Math.sin(a),z]}
function planarPoints(q){const p=[...pose];q.forEach((v,i)=>p[i+1]=fromAngle(i+1,v));return geometry(p)}
// Wall mount approximation: all link centre lines remain in front of the mounting plane X=0.
function inFront(p){const c=Math.cos(rad(angle(0,p[0])));return geometry(p).every(([r])=>r*c>=-0.5)}
function pathClear(a,b){for(let n=1;n<=40;n++){const p=a.map((v,i)=>v+(b[i]-v)*n/40);if(!inFront(p))return false}return true}
function endpoint(q){let a=rad(90-q[0]),b=a-rad(90+q[1]),c=b-rad(q[2]);return [115*Math.cos(a)+135*Math.cos(b)+165*Math.cos(c),115*Math.sin(a)+135*Math.sin(b)+165*Math.sin(c)]}
// One elbow branch, continuity scoring, horizontal tool preference.
// Follow Cartesian targets incrementally instead of switching between distant IK poses.
function solveIK(r,z,start=pose){
 const initial=[1,2,3].map(i=>angle(i,start[i])), current=endpoint(initial);
 const score=(q,error)=>error*error*30+q.reduce((sum,v,i)=>sum+(v-initial[i])**2,0)*.025+(q[0]+q[1]+q[2])**2*.8;
 let best={q:initial,error:Math.hypot(r-current[0],z-current[1]),cost:Infinity};
 const toolAngle=-initial[0]-initial[1]-initial[2];
 for(const phi of [0,toolAngle,...Array.from({length:181},(_,i)=>-180+i*2)]){
  const x=r-165*Math.cos(rad(phi)),y=z-165*Math.sin(rad(phi));
  const c=Math.max(-1,Math.min(1,(x*x+y*y-115*115-135*135)/(2*115*135)));
  const delta=-Math.acos(c),a=Math.atan2(y,x)-Math.atan2(135*Math.sin(delta),115+135*Math.cos(delta));
  let q=[90-deg(a),-deg(delta)-90,deg(a+delta)-phi];
  q=q.map((v,i)=>{while(v>180)v-=360;while(v< -180)v+=360;return Math.max(bounds[i][0],Math.min(bounds[i][1],v))});
  const candidate=[...start];q.forEach((v,i)=>candidate[i+1]=fromAngle(i+1,v));if(!inFront(candidate))continue;
  const p=endpoint(q),error=Math.hypot(r-p[0],z-p[1]),cost=score(q,error);
  if(cost<best.cost)best={q,error,cost};
 }
 const out=[...start];best.q.forEach((v,i)=>out[i+1]=fromAngle(i+1,v));return {pose:out,error:best.error,cost:best.cost};
}
function solveWorld(target,view,start=pose){
 let [X,Y,Z]=target;X=Math.max(0,X);const requestedX=X;
 let best=null;
 // The back view constrains Y and Z. X can give way when the arm is extended.
 const maxX=Math.sqrt(Math.max(0,415*415-Y*Y-Z*Z));
 const xs=view==='back'?[X,Math.min(X,maxX),...Array.from({length:13},(_,i)=>maxX*i/12)]:[X];
 for(const x of xs){const yaw=Math.max(-90,Math.min(90,deg(Math.atan2(Y,x))));const result=solveIK(Math.hypot(x,Y),Z,start);result.pose[0]=fromAngle(0,yaw);const w=world(result.pose),screenError=view==='back'?Math.hypot(w[1]-Y,w[2]-Z):Math.hypot(w[0]-X,w[1]-Y,w[2]-Z);const cost=screenError*screenError*100+(x-requestedX)**2*.012+result.cost*.002;if(!best||cost<best.cost)best={...result,cost,screenError};if(screenError<.5&&Math.abs(x-requestedX)<.5)break;}
 return best;
}
function setTarget(target,view){if(paused||connected&&!ready)return;endTarget={point:target,view};}
function animate(time){const dt=Math.min(32,Math.max(1,time-(lastFrame||time-16)));lastFrame=time;
 if(endTarget&&!paused&&(!connected||ready)){
  const target=endTarget,w=world(),distance=Math.hypot(...target.point.map((v,i)=>v-w[i]));
  let nextPoint;
  if(target.view==='back'){
   // Do not spend the Cartesian step budget on the hidden depth coordinate.
   const dist=Math.hypot(target.point[1]-w[1],target.point[2]-w[2]);const f=Math.min(1,dt*.24/Math.max(.001,dist));
   nextPoint=[target.point[0],w[1]+(target.point[1]-w[1])*f,w[2]+(target.point[2]-w[2])*f];
  }else{const f=Math.min(1,dt*.24/Math.max(.001,distance));nextPoint=w.map((v,i)=>v+(target.point[i]-v)*f)}
  const result=solveWorld(nextPoint,target.view),next=result.pose;
  const maxDelta=Math.max(...next.slice(0,4).map((v,i)=>Math.abs(angle(i,v)-angle(i,pose[i]))));
  const f=Math.min(1,dt*.075/Math.max(.001,maxDelta));const limited=pose.map((v,i)=>i<4?clamp(v+(next[i]-v)*f):v);
  if(inFront(limited)&&pathClear(pose,limited))apply(limited);
  const final=world(),error=target.view==='back'?Math.hypot(final[1]-target.point[1],final[2]-target.point[2]):Math.hypot(...final.map((v,i)=>v-target.point[i]));
  const progress=Math.hypot(...final.map((v,i)=>v-w[i]));target.stalled=progress<.04?(target.stalled||0)+1:0;
  if(target.stalled>24){endTarget=null;msg('Gelenkgrenze erreicht · nächstmögliche Position.')}
  else if(error<1){if(endTarget===target)endTarget=null;msg(connected?'Arm folgt · USB verbunden.':'Vorschau · alle Ansichten synchronisiert.')}else if(result.screenError>3)msg('Gelenkgrenze erreicht · nächstmögliche Position.');
 }
 requestAnimationFrame(animate);
}
function apply(next){if(paused||connected&&!ready)return false;next=next.map(clamp);if(!inFront(next)||!pathClear(pose,next)){msg('Montagegrenze erreicht: Der Arm bleibt vor der Wandebene.');return false}pose=next;if(connected)desired=[...pose];render();return true}
function setAxis(i,v){endTarget=null;const next=[...pose];next[i]=clamp(v);apply(next)}
defs.forEach((d,i)=>{const row=document.createElement('div');row.className='axis';row.innerHTML=`<div class="axis-title"><label for="axis${i}"><small>0${i+1}</small>${d[0]}</label><span id="deg${i}"></span></div><div class="axis-row"><button data-jog="${i},-1" aria-label="${d[0]} verringern">−</button><input id="axis${i}" type="range" min="0" max="4095" aria-label="${d[0]}"><button data-jog="${i},1" aria-label="${d[0]} erhöhen">+</button><input class="number" id="value${i}" type="number" min="0" max="4095" aria-label="${d[0]} Wert"></div>`;$('axes').append(row);$('axis'+i).oninput=e=>setAxis(i,+e.target.value);$('value'+i).onchange=e=>{if(Number.isFinite(e.target.valueAsNumber))setAxis(i,e.target.valueAsNumber)}});
function el(tag,attrs,parent){const n=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));parent.append(n);return n}function line(svg,a,b,attrs={}){return el('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],...attrs},svg)}
function gripper(svg,p,a,handle=false,toolLength=43){
 const g=el('g',{transform:`translate(${p}) rotate(${a})`,...(handle?{class:'handle','data-tip':1,tabindex:0,role:'button','aria-label':'Greifer ziehen; Pfeiltasten zum Bewegen'}:{})},svg);
 // L3 includes the wrist assembly AND the tool, not only a thin arm segment.
 const spread=3+pose[5]/4095*8,roll=rad(angle(4)),w=.35+.65*Math.abs(Math.cos(roll)),length=Math.max(8,toolLength);
 el('rect',{x:-length,y:-7,width:length*.4,height:14,fill:'black',rx:2},g);
 [-1,1].forEach(side=>el('path',{d:`M ${-length*.65} ${side*5*w} L ${-length*.27} ${side*spread*w} L 0 ${side*3*w}`,fill:'none',stroke:'black','stroke-width':3.5,'stroke-linejoin':'round'},g));
 el('circle',{r:18,fill:'transparent',stroke:'#bcbcbc','stroke-width':1,class:'ring'},g);return g;
}
function arm(svg,pts,tip,view){
 line(svg,[pts[0][0]-9,pts[0][1]],[pts[0][0]+9,pts[0][1]],{stroke:'black','stroke-width':18});
 const yaw=rad(angle(0));
 for(let i=0;i<3;i++){
  // The narrow wrist link is only the first 28% of L3; the rest is the gripper.
  const to=i===2?pts[i].map((v,k)=>v+(pts[i+1][k]-v)*.28):pts[i+1];
  line(svg,pts[i],to,{stroke:'black','stroke-width':i===2?6:9});
 }

 for(let i=0;i<3;i++){
  const p=pts[i];
  // Hinge axle normal to the arm plane. Project its round end and barrel.
  const face=view==='side'?Math.abs(Math.cos(yaw)):0;
  const n=view==='side'?[0,0]:[Math.cos(yaw),Math.sin(yaw)];
  if(view==='side')el('ellipse',{cx:p[0],cy:p[1],rx:Math.max(2,6.5*face),ry:6.5,fill:'black',stroke:'#f8f8f8','stroke-width':2.5},svg);
  else{const tangent=[-n[1],n[0]],h=5;const corners=[[-h,-6],[h,-6],[h,6],[-h,6]].map(([a,b])=>[p[0]+n[0]*a+tangent[0]*b,p[1]+n[1]*a+tangent[1]*b]);el('polygon',{points:corners.map(p=>p.join(',')).join(' '),fill:'black',stroke:'#f8f8f8','stroke-width':2},svg)}
 }
 const p=pts[3],q=pts[2],length=Math.hypot(p[0]-q[0],p[1]-q[1])*.72;gripper(svg,p,deg(Math.atan2(p[1]-q[1],p[0]-q[0])),tip,length);
}
function drawBackRanges(svg){
 // These are guide envelopes for joint 4 (not targets or collision limits).
 // The center red circle shows its arm-plane radius; blue/purple show yaw extremes.
 const ox=190,oy=210,r=(115+135)*.36;
 el('circle',{cx:ox,cy:oy,r,fill:'none',stroke:'#ff4146','stroke-width':.8},svg);
 [-1,1].forEach((side,i)=>{const offset=side*12;el('path',{d:`M ${ox+offset-r} ${oy} A ${r} ${r} 0 0 0 ${ox+offset+r} ${oy}`,fill:'none',stroke:i?'#ca41ff':'#526aff','stroke-width':.8},svg)});
 const p=geometry()[2],yaw=rad(angle(0));el('circle',{cx:190+p[0]*Math.sin(yaw)*.36,cy:210-p[1]*.36,r:4,fill:Math.abs(angle(0))<2?'#ff4146':angle(0)<0?'#526aff':'#ca41ff'},svg);
}
function render(){defs.forEach((d,i)=>{$('axis'+i).value=pose[i];$('value'+i).value=pose[i];$('deg'+i).textContent=angle(i).toFixed(1)+'°'});$('roll').value=pose[4];$('grip').value=pose[5];$('roll-label').textContent=angle(4).toFixed(0)+'°';$('grip-label').textContent='';const pts=geometry(),yaw=rad(angle(0)),s=.36;
 for(const id of ['side','back','top']){const svg=$(id);svg.replaceChildren();if(id==='side'){const ox=130,oy=210;el('path',{d:`M ${ox} ${oy-150} A 150 150 0 0 1 ${ox} ${oy+150} Z`,fill:'none',stroke:'#d0d0d0'},svg);el('rect',{x:72,y:137,width:17,height:153,fill:'#775035'},svg);el('path',{d:'M 89 177 H 120 V 199 H 99 V 222 H 120 V 229 H 89 Z',fill:'black'},svg);arm(svg,pts.map(([r,z])=>[ox+r*Math.cos(yaw)*s,oy-z*s]),true,'side')}
 else if(id==='back'){const ox=190,oy=210;[150,138,125].forEach(r=>el('path',{d:`M ${ox-r} ${oy-13} A ${r} ${r} 0 0 0 ${ox+r} ${oy-13} Z`,fill:'none',stroke:'#cecece'},svg));el('circle',{cx:ox,cy:oy-13,r:150,fill:'none',stroke:'#aaa'},svg);drawBackRanges(svg);const backPoints=pts.map(([r,z])=>[ox+r*Math.sin(yaw)*s,oy-z*s]);for(let i=0;i<3;i++)line(svg,backPoints[i],backPoints[i+1],{stroke:'#888','stroke-width':3,opacity:.4});const p=world(),point=[ox+p[1]*s,oy-p[2]*s];const g=el('g',{transform:`translate(${point})`,class:'handle','data-tip':1,tabindex:0,role:'button','aria-label':'Fadenkreuz ziehen; Pfeiltasten bewegen den Arm'},svg);el('circle',{r:14,fill:'black',stroke:'white','stroke-width':1,class:'ring'},g);el('circle',{r:4,fill:'none',stroke:'white','stroke-width':.7},g);line(g,[-8,0],[8,0],{stroke:'white','stroke-width':.7});line(g,[0,-8],[0,8],{stroke:'white','stroke-width':.7});}
 else{const ox=190,oy=230,r=150;// Symmetric usable yaw envelope at a wall: -90..+90 degrees.
 const point=a=>[ox+r*Math.sin(rad(a)),oy-r*Math.cos(rad(a))];[[-90,0,'#526aff'],[0,90,'#ca41ff']].forEach(([left,right,col])=>{const p=point(left),q=point(right);el('path',{d:`M ${ox} ${oy} L ${p} A ${r} ${r} 0 0 1 ${q} Z`,fill:'none',stroke:col,'stroke-width':.8},svg)});el('rect',{x:168,y:268,width:44,height:13,fill:'#775035'},svg);el('rect',{x:181,y:240,width:18,height:28,fill:'black'},svg);arm(svg,pts.map(([d,z])=>[ox+d*Math.sin(yaw)*s,oy-d*Math.cos(yaw)*s]),true,'top')}}}
function projected(id,w){return id==='side'?[130+w[0]*.36,210-w[2]*.36]:id==='back'?[190+w[1]*.36,210-w[2]*.36]:[190+w[1]*.36,230-w[0]*.36]}
function pointerPoint(svg,e){return new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse())}
function startDrag(svg,e){
 if(paused||connected&&!ready)return;
 const p=pointerPoint(svg,e);
 if(svg.id==='back'){
  if(!e.target.closest('[data-tip]')&&!drag&&!touches.size)return;
  touches.set(e.pointerId,{x:p.x,y:p.y});svg.setPointerCapture(e.pointerId);
  if(touches.size===2){const points=[...touches.values()],w=world();pinch={distance:Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y),world:w,center:[(points[0].x+points[1].x)/2,(points[0].y+points[1].y)/2]};drag=null;e.preventDefault();return}
 }
 if(!e.target.closest('[data-tip]'))return;
 const w=world(),tip=projected(svg.id,w);drag={svg,id:e.pointerId,startWorld:w,offset:[tip[0]-p.x,tip[1]-p.y]};svg.setPointerCapture(e.pointerId);e.preventDefault();
}
function moveTarget(id,x,y,reference){
 const target=id==='side'?[Math.max(0,(x-130)/.36),reference[1],(210-y)/.36]:id==='back'?[Math.max(0,reference[0]),(x-190)/.36,(210-y)/.36]:[Math.max(0,(230-y)/.36),(x-190)/.36,reference[2]];
 setTarget(target,id);
}
function finishPointer(id){touches.delete(id);if(pinch){pinch=null;drag=null;touches.clear()}else if(drag&&drag.id===id)drag=null}
['side','back','top'].forEach(id=>{const svg=$(id);
 svg.addEventListener('pointerdown',e=>startDrag(svg,e));
 svg.addEventListener('pointermove',e=>{
  const p=pointerPoint(svg,e);
  if(id==='back'&&touches.has(e.pointerId)){touches.set(e.pointerId,{x:p.x,y:p.y});
   if(pinch&&touches.size===2){const points=[...touches.values()],dist=Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y),center=[(points[0].x+points[1].x)/2,(points[0].y+points[1].y)/2];setTarget([Math.max(0,pinch.world[0]+(dist-pinch.distance)*2),pinch.world[1]+(center[0]-pinch.center[0])/.36,pinch.world[2]-(center[1]-pinch.center[1])/.36],'depth');e.preventDefault();return}
  }
  if(!drag||drag.svg!==svg||e.pointerId!==drag.id)return;moveTarget(id,p.x+drag.offset[0],p.y+drag.offset[1],drag.startWorld);
 });
 for(const event of ['pointerup','lostpointercapture'])svg.addEventListener(event,e=>finishPointer(e.pointerId));svg.addEventListener('pointercancel',()=>clearMotion());
 svg.addEventListener('keydown',e=>{if(!e.target.closest('[data-tip]')||!e.key.startsWith('Arrow'))return;e.preventDefault();const w=world(),p=projected(id,w);moveTarget(id,p[0]+(e.key==='ArrowRight'?3:e.key==='ArrowLeft'?-3:0),p[1]+(e.key==='ArrowDown'?3:e.key==='ArrowUp'?-3:0),w)});
});
// macOS trackpad pinch is delivered as ctrl+wheel in Chromium; touch uses pointers.
$('back').addEventListener('wheel',e=>{if(!e.ctrlKey&&!e.altKey)return;e.preventDefault();const w=endTarget?[...endTarget.point]:world();w[0]=Math.max(0,w[0]-e.deltaY*.6);setTarget(w,'depth')},{passive:false});
$('back').addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});
$('roll').oninput=e=>setAxis(4,+e.target.value);$('grip').oninput=e=>setAxis(5,+e.target.value);
function clearMotion(){held=null;drag=null;desired=null;endTarget=null;touches.clear();pinch=null}function pause(){paused=!paused;clearMotion();if(actual&&connected){pose=[...actual];render()}$('stop').textContent=paused?'Fortsetzen':'Bewegung pausieren';msg(paused?'Neue Befehle pausiert. Bereits gestartete Bewegungen laufen weiter.':'Steuerung freigegeben.')} $('stop').onclick=pause;window.addEventListener('blur',clearMotion);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearMotion()});
function jog(i,s){setAxis(i,pose[i]+s*+$('step').value)}document.querySelectorAll('[data-jog]').forEach(b=>{b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);let [i,s]=b.dataset.jog.split(',').map(Number);jog(i,s);held={i,s,time:performance.now()}};b.onpointerup=b.onpointercancel=()=>held=null;b.onclick=e=>{if(!e.detail){let [i,s]=b.dataset.jog.split(',').map(Number);jog(i,s)}}});window.addEventListener('pointerup',()=>held=null);$('step').oninput=e=>$('stepValue').textContent=e.target.value;document.addEventListener('keydown',e=>{if(e.code==='Space'&&!e.target.matches('input,button,summary')){e.preventDefault();if(!e.repeat)pause()}});
async function write(command){if(!writer||pending)return;pending={command,time:Date.now()};log('> '+command);try{await writer.write(new TextEncoder().encode(command+'\n'))}catch(e){msg('USB-Schreibfehler: '+e.message);void disconnect()}}
function handleLine(line){if(!line)return;log(line);const match=/^POS\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/.exec(line);if(match){const values=match.slice(1).map(Number);if(values.some(v=>v>4095))return;actual=values;pending=null;const first=!ready;ready=true;if(first){desired=null;endTarget=null;pose=[...actual];msg('Aktuelle Roboterposition übernommen.')}else if(!desired&&!endTarget)pose=[...actual];if(desired&&actual.every((v,i)=>Math.abs(v-desired[i])<=2)){desired=null;pose=[...actual]}render()}else if(line.startsWith('ERR')){pending=null;clearMotion();if(actual)pose=[...actual];render();msg('Roboter meldet: '+line)}}
async function readLoop(r,token){const decoder=new TextDecoder();let buffer='';try{while(token===session){const {value,done}=await r.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split('\n');buffer=lines.pop();lines.forEach(l=>handleLine(l.trim()));if(buffer.length>8192)buffer=''}}catch(e){log(e.message)}finally{if(token===session&&connected)void disconnect()}}
async function disconnect(){session++;connected=false;ready=false;clearMotion();pending=null;const r=reader;reader=null;try{if(r){await r.cancel();r.releaseLock()}if(writer){writer.releaseLock();writer=null}if(port){await port.close();port=null}}catch(e){log(e.message)}$('connect').textContent='Roboter verbinden ↗';$('status').textContent='Nicht verbunden';$('status').classList.remove('live');msg('USB getrennt · Vorschau aktiv.')}
$('connect').onclick=async()=>{if(connected){await disconnect();return}if(connecting)return;if(!navigator.serial){msg('Bitte diese Datei in Chrome oder Edge öffnen (Web Serial).');return}connecting=true;$('connect').disabled=true;try{port=await navigator.serial.requestPort();await port.open({baudRate:115200});writer=port.writable.getWriter();reader=port.readable.getReader();connected=true;ready=false;actual=null;clearMotion();$('connect').textContent='Verbindung trennen';$('status').textContent='Position wird erfasst …';$('status').classList.add('live');const token=++session;void readLoop(reader,token);msg('Board startet. Position wird abgefragt, ohne den Arm zu bewegen.');await write('?')}catch(e){if(e.name!=='NotFoundError')msg('Verbindungsfehler: '+e.message);if(port)await disconnect()}finally{connecting=false;$('connect').disabled=false}};
if(navigator.serial)navigator.serial.addEventListener('disconnect',()=>{if(connected)void disconnect()});
// One acknowledged command at a time. Move all joints together with small steps.
setInterval(()=>{if(held&&performance.now()-held.time>100){jog(held.i,held.s);held.time=performance.now()}if(!connected)return;if(pending){if(Date.now()-pending.time>2500){const query=pending.command==='?';pending=null;ready=false;clearMotion();msg('Keine Positionsantwort. Bewegung gesperrt; Position wird erneut abgefragt.');if(!query)log('Bewegungsantwort ausgeblieben.')}return}if(!ready){void write('?');return}if(desired&&!paused&&actual){const distance=Math.max(...desired.map((v,i)=>Math.abs(v-actual[i])));if(distance<=2){desired=null;return}const f=Math.min(1,60/distance),step=actual.map((v,i)=>clamp(v+(desired[i]-v)*f));if(!inFront(step)||!pathClear(actual,step)){desired=null;pose=[...actual];render();msg('Montagegrenze: Bewegung angehalten.');return}void write('A '+step.join(' '));lastQuery=Date.now()}else if(Date.now()-lastQuery>700){lastQuery=Date.now();void write('?')}if(ready)$('status').textContent='Verbunden · Position synchronisiert'},60);
function preset(values){endTarget=null;if(apply(values))msg(connected?'Pose wird schrittweise angefahren.':'Pose in der Vorschau gesetzt.')} $('neutral').onclick=()=>preset(neutral);$('home').onclick=()=>preset(Array(6).fill(2048));$('query').onclick=()=>{if(connected&&!pending){clearMotion();void write('?')}else msg(connected?'Positionsantwort wird erwartet.':'Zuerst den Roboter verbinden.')};
$('send').onclick=()=>{const c=$('raw').value.trim().toUpperCase();if(!/^(\?|H|M [1-6] [+-]?\d+|P [1-6] \d+|A \d+ \d+ \d+ \d+ \d+ \d+)$/.test(c)||c.length>63){msg('Ungültiger Befehl.');return}if(!connected||pending||!ready||paused&&c!=='?'){msg('Befehl gesperrt. Verbindung, Position und Pause prüfen.');return}clearMotion();if(c==='?'){void write(c)}else{const parts=c.split(' '),next=[...pose];if(parts[0]==='H')next.fill(2048);if(parts[0]==='A')parts.slice(1).forEach((v,i)=>next[i]=clamp(+v));if(parts[0]==='P')next[+parts[1]-1]=clamp(+parts[2]);if(parts[0]==='M')next[+parts[1]-1]=clamp(next[+parts[1]-1]+ +parts[2]);apply(next)}$('raw').value=''};$('raw').onkeydown=e=>{if(e.key==='Enter')$('send').click()};render();requestAnimationFrame(animate);
