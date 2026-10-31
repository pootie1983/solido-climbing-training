/* SOLIDO CLIMBING · Reto de fuerza en la montaña.
   Recordatorio: el récord y el apodo se guardan en localStorage del dispositivo.
   Usa currentForce, alimentado por el WH-C06 ya conectado. No toca el puente Bluetooth. */
const SG_RECORD_KEY = 'solidoFeriaClimberRecordV1';
let sgRecord = null, sgActive = false, sgPeak = 0, sgStartedAt = 0, sgFrame = null;
let sgDurationMs = 12000, sgMaxKg = 20, sgPendingRecord = 0, sgVisualProgress = 0, sgVisualLastAt = 0, sgThermoBroken = false, sgThermoBreakTimer = null;
let sgCountdownActive=false,sgCountdownTimer=null,sgCountdownValue=8;
let sgReachedSummit=false, sgVictoryShown=false, sgMusicTimer=null, sgAudio=null, sgMusicStep=0, sgLastLevel=0, sgVictoryTimer=null, sgForceFiltered=0, sgForceInitialized=false, sgLastSensorPacketAt=0;
const sgLevelPhrases=[
 '¡Hasta las cabras suben más rápido!',
 '¡Vamos, que no estás subiendo al sofá!',
 '¡Tus brazos empiezan a negociar!',
 '¡La montaña ya sabe quién eres!',
 '¡Medio camino! ¡No te rajes ahora!',
 '¡Tus antebrazos están pidiendo vacaciones!',
 '¡Ya casi puedes tocar las nubes!',
 '¡La cima está temblando al verte!',
 '¡Un último esfuerzo, leyenda!',
 '¡¡¡ERES EL REY DE LA MONTAÑA!!!'
];
function sgOnSensorReading(value){
 const raw=Number(value);if(!Number.isFinite(raw))return;
 const now=performance.now();if(!sgActive&&!sgCountdownActive)return;
 const kg=Math.max(0,raw);
 if(!sgForceInitialized){sgForceFiltered=kg;sgForceInitialized=true;}
 else{
  const dt=Math.max(1,Math.min(250,now-sgLastSensorPacketAt));
  const alpha=1-Math.exp(-dt/42);
  sgForceFiltered+= (kg-sgForceFiltered)*Math.max(.72,Math.min(.94,alpha));
  if(Math.abs(kg-sgForceFiltered)<.035)sgForceFiltered=kg;
 }
 sgLastSensorPacketAt=now;
}
function sgReadGameForce(){
 if(!sgActive)return Math.max(0,sgForceFiltered);
 if(!sgForceInitialized)return Math.max(0,Number(typeof currentForce!=='undefined'?currentForce:0)||0);
 if(performance.now()-sgLastSensorPacketAt>1500)return 0;
 return Math.max(0,sgForceFiltered);
}
function sgSensorConnected(){
 const status=document.getElementById('whStatus');
 const homeDot=document.getElementById('homeWHDot');
 return !!((homeDot&&homeDot.classList.contains('connected'))||(status&&/conectado/i.test(status.textContent)));
}
function sgUpdateConnectionUI(){
 const connected=sgSensorConnected();
 const dot=document.getElementById('sgGameConnectDot');
 if(dot)dot.classList.toggle('connected',connected);
 const label=document.getElementById('sgGameConnectText');
 if(label)label.textContent=connected?'WH-C06 conectado · listo para jugar':'WH-C06 desconectado';
}
function sgConnectSensor(){
 try{
  if(typeof homeConnectWHC06==='function')homeConnectWHC06();
  else if(typeof connectWHC06==='function')connectWHC06();
  else {const status=document.getElementById('sgGameStatus');if(status)status.textContent='No se encuentra el control de conexión WH-C06.';}
  setTimeout(sgUpdateConnectionUI,250);
 }catch(e){const status=document.getElementById('sgGameStatus');if(status)status.textContent='No se pudo iniciar la conexión: '+(e.message||e);}
}
function sgDisconnectSensor(){
 try{if(typeof disconnectWHC06==='function')disconnectWHC06();}catch(e){}
 sgUpdateConnectionUI();
}
function sgEnterFullscreen(){
 const section=document.getElementById('strengthGame');
 document.body.classList.add('br-fullscreen-active');
 if(section){section.classList.remove('hide');section.classList.add('strength-fullscreen-game');}
 document.documentElement.style.setProperty('overflow','hidden');
 document.body.style.setProperty('overflow','hidden');
 try{if(window.AndroidUi&&AndroidUi.enterGameFullscreen)AndroidUi.enterGameFullscreen();}catch(e){}
 requestAnimationFrame(()=>{if(section){section.classList.add('strength-fullscreen-game');section.scrollTop=0;}});
}
function sgStartSuspenseMusic(){
 try{
  const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;
  if(!sgAudio)sgAudio=new Ctx();if(sgAudio.state==='suspended')sgAudio.resume();sgStopMusic();
  const ctx=sgAudio,master=ctx.createGain();master.gain.value=.105;master.connect(ctx.destination);sgAudio._sgMaster=master;
  const chords=[[146.83,174.61,220],[116.54,146.83,174.61],[130.81,164.81,196],[98,130.81,164.81]];
  const notes=[293.66,349.23,440,392,349.23,293.66,261.63,329.63];let step=0;
  const pad=(frequencies,duration)=>frequencies.forEach((freq,i)=>{
   const osc=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();osc.type='sawtooth';osc.frequency.value=freq*(i===0?.5:1);filter.type='lowpass';filter.frequency.value=850;
   gain.gain.setValueAtTime(.0001,ctx.currentTime);gain.gain.linearRampToValueAtTime(.026,ctx.currentTime+.35);gain.gain.setTargetAtTime(.0001,ctx.currentTime+duration-.35,.18);
   osc.connect(filter);filter.connect(gain);gain.connect(master);osc.start();osc.stop(ctx.currentTime+duration);
  });
  const pulse=()=>{
   if(!sgActive||!sgAudio||!sgAudio._sgMaster)return;
   const now=ctx.currentTime,idx=step%8;if(idx===0)pad(chords[Math.floor(step/8)%chords.length],3.35);
   const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='triangle';osc.frequency.setValueAtTime(notes[idx],now);osc.frequency.exponentialRampToValueAtTime(notes[idx]*.985,now+.22);
   gain.gain.setValueAtTime(.0001,now);gain.gain.linearRampToValueAtTime(.075,now+.025);gain.gain.exponentialRampToValueAtTime(.0001,now+.34);osc.connect(gain);gain.connect(master);osc.start(now);osc.stop(now+.36);
   if(idx===0||idx===4){const drum=ctx.createOscillator(),dg=ctx.createGain();drum.type='sine';drum.frequency.setValueAtTime(92,now);drum.frequency.exponentialRampToValueAtTime(43,now+.22);dg.gain.setValueAtTime(.0001,now);dg.gain.linearRampToValueAtTime(.16,now+.012);dg.gain.exponentialRampToValueAtTime(.0001,now+.27);drum.connect(dg);dg.connect(master);drum.start(now);drum.stop(now+.29);}
   step++;sgMusicTimer=setTimeout(pulse,430);
  };pulse();
 }catch(e){}
}
function sgStopMusic(){
 if(sgMusicTimer){clearTimeout(sgMusicTimer);sgMusicTimer=null;}
 if(sgAudio){try{if(sgAudio._sgBass){sgAudio._sgBass.stop();sgAudio._sgBass=null;}if(sgAudio._sgMaster){sgAudio._sgMaster.gain.setTargetAtTime(.0001,sgAudio.currentTime,.08);sgAudio._sgMaster=null;}}catch(e){}}
}
function sgPlayVictoryMusic(){
 try{
  const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;
  if(!sgAudio)sgAudio=new Ctx();if(sgAudio.state==='suspended')sgAudio.resume();
  const ctx=sgAudio,master=ctx.createGain(),now=ctx.currentTime;
  master.gain.setValueAtTime(.0001,now);master.gain.linearRampToValueAtTime(.23,now+.12);master.gain.setValueAtTime(.2,now+4.7);master.gain.exponentialRampToValueAtTime(.0001,now+5.8);master.connect(ctx.destination);
  const notes=[523.25,659.25,783.99,1046.5,783.99,1046.5,1318.51,1046.5,1318.51,1567.98,1318.51,1567.98,2093];
  notes.forEach((freq,i)=>{const at=now+.08+i*.42,osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='triangle';osc.frequency.value=freq;gain.gain.setValueAtTime(.0001,at);gain.gain.linearRampToValueAtTime(.2,at+.04);gain.gain.exponentialRampToValueAtTime(.0001,at+.38);osc.connect(gain);gain.connect(master);osc.start(at);osc.stop(at+.4);});
  const bass=ctx.createOscillator(),bassGain=ctx.createGain();bass.type='sine';bass.frequency.setValueAtTime(65.41,now);bassGain.gain.setValueAtTime(.0001,now);bassGain.gain.linearRampToValueAtTime(.16,now+.3);bassGain.gain.setTargetAtTime(.0001,now+5.1,.2);bass.connect(bassGain);bassGain.connect(master);bass.start(now);bass.stop(now+5.6);
 }catch(e){}
}
function sgLaunchFireworks(){
 const host=document.getElementById('sgFireworks');if(!host)return;
 host.innerHTML='';
 const colors=['#fff36b','#ff6b8a','#8af7ff','#b7ff6b','#e9a2ff','#ffb45c'];
 for(let burst=0;burst<13;burst++){
  const cx=8+Math.random()*84,cy=10+Math.random()*68;
  for(let i=0;i<18;i++){
   const dot=document.createElement('i'),angle=(Math.PI*2*i)/14,r=18+Math.random()*30;
   dot.className='sg-firework';dot.style.left=cx+'%';dot.style.top=cy+'%';dot.style.color=colors[burst%colors.length];
   dot.style.setProperty('--fx',(Math.cos(angle)*r)+'px');dot.style.setProperty('--fy',(Math.sin(angle)*r)+'px');
   dot.style.animationDelay=(Math.random()*.7)+'s';host.appendChild(dot);
  }
 }
 host.classList.add('active');
 setTimeout(()=>{host.classList.remove('active');host.innerHTML='';},5600);
}
function sgSetOverlay(title,body){
 const overlay=document.getElementById('sgOverlay');if(!overlay)return;
 const isCountdown=/^\d+$/.test(String(title))||/PREPARADOS|LISTOS|VAMOS/i.test(String(title));
 overlay.classList.toggle('sg-countdown',/^\d+$/.test(String(title)));
 overlay.classList.toggle('sg-ready-call',/PREPARADOS|LISTOS|VAMOS/i.test(String(title)));
 overlay.textContent='';
 const strong=document.createElement('strong'),span=document.createElement('span');
 strong.textContent=title;span.textContent=body;overlay.appendChild(strong);overlay.appendChild(span);
 if(!isCountdown){const start=document.createElement('button');start.type='button';start.className='btn sg-overlay-start';start.textContent=/BUEN INTENTO|NO HEMOS DETECTADO|VICTORIA/i.test(String(title))?'↻ Nueva partida':'▶ Empezar partida';start.onclick=()=>strengthGameStart();overlay.appendChild(start);}
 overlay.style.display='grid';
}
function sgShowVictory(){
 if(sgVictoryShown)return;sgVictoryShown=true;sgStopMusic();
 const scene=document.getElementById('sgScene'),banner=document.getElementById('sgVictoryBanner'),overlay=document.getElementById('sgOverlay');
 if(scene){scene.classList.add('sg-summit-near','sg-summit-reached','sg-victory-camera');const world=document.getElementById('sgWorld');if(world){world.style.setProperty('--sg-progress','1');world.style.transform='translateY(0%)';}}
 if(banner)banner.classList.add('active');
 const climber=document.getElementById('sgCurrentClimber');if(climber){sgSetClimber(climber,1);climber.style.top='2.5%';climber.style.left='73%';climber.style.zIndex='14';climber.classList.add('sg-at-summit');sgSetPose(climber,'victory');}
 if(overlay)overlay.style.display='none';
 const phrase=document.getElementById('sgLevelPhrase');if(phrase)phrase.innerHTML='<span>NIVEL 10</span><strong>¡¡¡ERES EL REY DE LA MONTAÑA!!!</strong>';
 sgLaunchFireworks();sgPlayVictoryMusic();
}
function sgLoadRecord() {
  try {
    const v = JSON.parse(localStorage.getItem(SG_RECORD_KEY) || 'null');
    sgRecord = v && Number.isFinite(Number(v.kg)) ? {kg:Math.max(0,Number(v.kg)),nickname:String(v.nickname||'Escalador').slice(0,18),at:v.at||''} : null;
  } catch(e) { sgRecord=null; }
}
function sgFormatKg(v) { return Math.max(0,Number(v)||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})+' kg'; }
function sgProgress(v) { return Math.max(0,Math.min(1,(Number(v)||0)/Math.max(1,sgMaxKg))); }
function sgClimberWallX(progress){
 const p=Math.max(0,Math.min(1,Number(progress)||0));
 // Puntos de apoyo que siguen los quiebros visibles del borde de la pared.
 const path=[[0,34],[.07,39],[.15,37],[.23,42],[.32,39],[.40,45],[.48,42],[.56,49],[.65,45],[.73,52],[.82,49],[.90,58],[1,56]];
 for(let i=1;i<path.length;i++){if(p<=path[i][0]){const a=path[i-1],b=path[i],t=(p-a[0])/(b[0]-a[0]);return a[1]+(b[1]-a[1])*t;}}
 return path[path.length-1][1];
}
function sgSetClimber(el,v) { if(el){const p=Math.max(0,Math.min(1,Number(v)||0));el.style.top=(90-p*87)+'%';el.style.left=sgClimberWallX(p)+'%';el.style.bottom='auto';} }
function sgBreakThermometer(){if(sgThermoBroken)return;sgThermoBroken=true;const scene=document.getElementById('sgScene');if(scene){scene.classList.remove('sg-thermo-broken');void scene.offsetWidth;scene.classList.add('sg-thermo-broken');}try{if(navigator.vibrate)navigator.vibrate([120,60,180,70,260]);}catch(e){}if(sgThermoBreakTimer)clearTimeout(sgThermoBreakTimer);sgThermoBreakTimer=setTimeout(()=>{const s=document.getElementById('sgScene');if(s)s.classList.add('sg-thermo-broken-settled');sgThermoBreakTimer=null;},3200);}
function sgSetPose(el,pose){
 if(!el)return;
 const img=el.querySelector('img');if(!img)return;
 const safePose=['idle','climbing','effort','fall','victory'].includes(pose)?pose:'idle';
 const imageByPose={
  idle:'climber_idle.png',
  climbing:'climber_climbing.png',
  effort:'climber_effort.png',
  fall:'climber_fall.png',
  victory:'climber_victory.png'
 };
 const imageFile=imageByPose[safePose]||imageByPose.idle;
 if(el.dataset.pose!==safePose||!img.getAttribute('src')||!img.getAttribute('src').endsWith(imageFile)){
  img.src=imageFile;
  el.dataset.pose=safePose;
 }
}
function sgMessageFor(v) {
 const p=sgProgress(v),level=Math.min(10,Math.max(1,Math.ceil(p*10)||1));
 return sgLevelPhrases[level-1];
}
function strengthGameOnShow() {
 sgLoadRecord();
 const slider=document.getElementById('sgMaxKg');
 if(slider){const n=Number(localStorage.getItem('solidoFeriaMaxKg')||20);sgMaxKg=Number.isFinite(n)?Math.max(5,Math.min(100,n)):20;slider.value=String(sgMaxKg);}
 const label=document.getElementById('sgMaxKgLabel');if(label)label.textContent=sgMaxKg.toLocaleString('es-ES')+' kg = cima';
 sgUpdateConnectionUI();sgRender();
}
function sgSetMaxKg(v) {
  sgMaxKg=Math.max(5,Math.min(100,Number(v)||20));
  try{localStorage.setItem('solidoFeriaMaxKg',String(sgMaxKg));}catch(e){}
  const label=document.getElementById('sgMaxKgLabel');
  if(label)label.textContent=sgMaxKg.toLocaleString('es-ES')+' kg = cima';
  sgRender();
}
function sgRender() {
 const ghost=document.getElementById('sgRecordClimber'),live=document.getElementById('sgCurrentClimber');
 const recName=document.getElementById('sgRecordName'),recKg=document.getElementById('sgRecordKg');
 const liveKg=document.getElementById('sgLiveKg'),peakKg=document.getElementById('sgPeakKg'),targetHud=document.getElementById('sgTargetHud');
 const message=document.getElementById('sgMessage'),recordText=document.getElementById('sgRecordText');
 const force=sgReadGameForce();
 if(recName)recName.textContent=sgRecord?sgRecord.nickname:'Aún sin récord';
 if(recKg)recKg.textContent=sgRecord?sgFormatKg(sgRecord.kg):'— kg';
 if(recordText)recordText.textContent=sgRecord?'RÉCORD · '+sgRecord.nickname+' · '+sgFormatKg(sgRecord.kg):'¡Sé el primero en llegar a la cima!';
 if(ghost){const rp=sgRecord?sgProgress(sgRecord.kg):0;sgSetClimber(ghost,rp);ghost.style.opacity=sgRecord?'1':'0';ghost.style.visibility=sgRecord?'visible':'hidden';}
 const now=performance.now(),dt=sgVisualLastAt?Math.min(80,now-sgVisualLastAt):16;sgVisualLastAt=now;const targetProgress=sgProgress(sgPeak);sgVisualProgress+=(targetProgress-sgVisualProgress)*(1-Math.exp(-dt/115));if(Math.abs(targetProgress-sgVisualProgress)<.001)sgVisualProgress=targetProgress;
 if(live){sgSetClimber(live,sgVisualProgress);sgSetPose(live,sgVictoryShown?'victory':(sgActive?(sgVisualProgress>=.82?'effort':'climbing'):'idle'));}
 if(liveKg)liveKg.textContent=sgFormatKg(force);
 if(peakKg)peakKg.textContent=sgFormatKg(sgPeak);
 if(targetHud)targetHud.textContent=sgFormatKg(sgMaxKg);
 if(message)message.textContent=sgMessageFor(sgActive?force:sgPeak);
 const progressForce=sgProgress(force),bar=document.getElementById('sgForceBar');if(bar){bar.style.height=(progressForce*100).toFixed(1)+'%';const hue=Math.round(125*(1-progressForce));bar.style.background='linear-gradient(180deg,hsl('+hue+',95%,62%),hsl('+hue+',88%,40%))';}
 const ball=document.getElementById('sgForceBall');if(ball){ball.style.bottom=(progressForce*100).toFixed(1)+'%';const hue=Math.round(125*(1-progressForce));ball.style.background='radial-gradient(circle at 32% 25%,#fff,hsl('+hue+',100%,75%) 35%,hsl('+hue+',88%,43%) 75%)';}
 if(force>=sgMaxKg)sgBreakThermometer();
 const forceText=document.getElementById('sgForceValue');if(forceText)forceText.textContent=sgFormatKg(force);
 const phrase=document.getElementById('sgLevelPhrase');
 const level=Math.min(10,Math.max(1,Math.ceil(sgProgress(sgPeak)*10)||1));
 if(phrase&&!sgVictoryShown){if(level!==sgLastLevel){phrase.classList.remove('sg-level-pop');void phrase.offsetWidth;phrase.classList.add('sg-level-pop');sgLastLevel=level;}phrase.innerHTML='<span>NIVEL '+level+'</span><strong>'+sgLevelPhrases[level-1]+'</strong>';}
 const summit=document.getElementById('sgScene'),world=document.getElementById('sgWorld');
 if(summit){const progress=sgVisualProgress;if(world){world.style.setProperty('--sg-progress',String(progress));world.style.transform='translateY('+(-82.5*(1-progress)).toFixed(3)+'%)';}summit.classList.toggle('sg-summit-near',progress>=.82);summit.classList.toggle('sg-summit-reached',sgReachedSummit);}
 const recordTag=document.getElementById('sgRecordTag');if(recordTag){const rp=sgRecord?sgProgress(sgRecord.kg):0;recordTag.style.top=(90-rp*87)+'%';recordTag.style.left=(sgClimberWallX(rp)+7)+'%';}
 const currentTag=document.getElementById('sgCurrentTag');if(currentTag){currentTag.style.top=(90-sgVisualProgress*87)+'%';currentTag.style.left=(sgClimberWallX(sgVisualProgress)+7)+'%';}
 sgUpdateConnectionUI();
}
function strengthGameStart() {
 if(sgActive||sgCountdownActive)return;
 if(!sgSensorConnected()){const status=document.getElementById('sgGameStatus');if(status)status.textContent='Primero conecta el WH-C06 desde la pantalla de inicio.';return;}
 sgEnterFullscreen();
 if(sgCountdownTimer){clearInterval(sgCountdownTimer);sgCountdownTimer=null;}
 if(sgVictoryTimer){clearTimeout(sgVictoryTimer);sgVictoryTimer=null;}
 sgPeak=0;sgReachedSummit=false;sgVictoryShown=false;sgLastLevel=0;sgVisualProgress=0;sgVisualLastAt=performance.now();sgThermoBroken=false;if(sgThermoBreakTimer){clearTimeout(sgThermoBreakTimer);sgThermoBreakTimer=null;}
 const section=document.getElementById('strengthGame');if(section)section.classList.add('sg-playing');
 sgForceFiltered=Math.max(0,Number(typeof currentForce!=='undefined'?currentForce:0)||0);sgForceInitialized=true;sgLastSensorPacketAt=performance.now();
 sgCountdownActive=true;sgCountdownValue=8;sgActive=false;
 const scene=document.getElementById('sgScene');if(scene){scene.classList.remove('sg-summit-reached','sg-summit-near','sg-victory-camera','sg-thermo-broken','sg-thermo-broken-settled');scene.style.setProperty('--sg-progress','0');}
 const climber=document.getElementById('sgCurrentClimber');if(climber){climber.classList.remove('sg-at-summit');climber.style.zIndex='6';sgSetPose(climber,'idle');}
 const banner=document.getElementById('sgVictoryBanner');if(banner)banner.classList.remove('active');
 const overlay=document.getElementById('sgOverlay');if(overlay)sgSetOverlay('8','');
 const start=document.getElementById('sgStartButton');if(start){start.textContent='Cuenta atrás…';start.disabled=true;}
 const finish=document.getElementById('sgFinishButton');if(finish)finish.disabled=true;
 const status=document.getElementById('sgGameStatus');if(status)status.textContent='Cuenta atrás: prepárate. Cuando llegue a cero tendrás 12 segundos.';
 const timer=document.getElementById('sgTimer');if(timer)timer.textContent='8';
 sgRender();
 sgCountdownTimer=setInterval(()=>{
  sgCountdownValue--;
  if(sgCountdownValue>0){
   const readyText=sgCountdownValue===3?'¡PREPARADOS!':sgCountdownValue===2?'¡LISTOS!':sgCountdownValue===1?'¡VAMOS!':'';
   const countdownDisplay=sgCountdownValue>=4?String(sgCountdownValue):readyText;
   if(overlay)sgSetOverlay(countdownDisplay,'');
   if(timer)timer.textContent=countdownDisplay;
   if(status)status.textContent=countdownDisplay;
   const idle=document.getElementById('sgCurrentClimber');if(idle)sgSetPose(idle,'idle');
   return;
  }
  clearInterval(sgCountdownTimer);sgCountdownTimer=null;sgCountdownActive=false;
  sgBeginTimedGame();
 },1000);
}
function sgBeginTimedGame(){
 sgPeak=0;sgReachedSummit=false;sgVictoryShown=false;sgStartedAt=performance.now();sgActive=true;
 const overlay=document.getElementById('sgOverlay');if(overlay)overlay.style.display='none';
 const climber=document.getElementById('sgCurrentClimber');if(climber)sgSetPose(climber,'climbing');
 const start=document.getElementById('sgStartButton');if(start){start.textContent='Midiendo fuerza…';start.disabled=false;}
 const finish=document.getElementById('sgFinishButton');if(finish)finish.disabled=false;
 const status=document.getElementById('sgGameStatus');if(status)status.textContent='¡YA! Aprieta: tienes 12 segundos para llegar a la cima.';
 const timer=document.getElementById('sgTimer');if(timer)timer.textContent='12 s';
 sgStartSuspenseMusic();
 if(sgFrame)cancelAnimationFrame(sgFrame);sgFrame=requestAnimationFrame(sgTick);
}
function sgTick(now) {
 if(!sgActive)return;
 const force=sgReadGameForce();
 if(force>sgPeak)sgPeak=force;
 if(force>=sgMaxKg)sgReachedSummit=true;
 sgRender();
 if(sgReachedSummit){sgFinish();return;}
 const left=Math.max(0,Math.ceil((sgDurationMs-(now-sgStartedAt))/1000));
 const timer=document.getElementById('sgTimer');if(timer)timer.textContent=left+' s';
 if(now-sgStartedAt>=sgDurationMs){sgFinish();return;}
 sgFrame=requestAnimationFrame(sgTick);
}
function strengthGameFinishEarly(){if(sgActive)sgFinish();}
function sgFinish() {
 if(!sgActive)return;
 sgActive=false;if(sgFrame)cancelAnimationFrame(sgFrame);sgFrame=null;sgStopMusic();
 const start=document.getElementById('sgStartButton');if(start)start.textContent='↻ Nueva partida';
 const finish=document.getElementById('sgFinishButton');if(finish)finish.disabled=true;
 const status=document.getElementById('sgGameStatus');
 if(sgPeak<.05){
  if(status)status.textContent='No hemos recibido fuerza del WH-C06. Comprueba que esté conectado y vuelve a intentarlo.';
  const overlay=document.getElementById('sgOverlay');if(overlay)sgSetOverlay('NO HEMOS DETECTADO FUERZA','Conecta el WH-C06 y vuelve a intentarlo. No se ha guardado ninguna marca.');
  return;
 }
 if(sgReachedSummit){
  sgShowVictory();
  if(status)status.textContent='¡CIMA CONQUISTADA! Disfruta de la victoria…';
  if(sgVictoryTimer)clearTimeout(sgVictoryTimer);
  sgVictoryTimer=setTimeout(()=>{sgVictoryTimer=null;sgCompleteFinish();},5500);
  return;
 }
 sgCompleteFinish();
}
function sgCompleteFinish(){
 const status=document.getElementById('sgGameStatus'),overlay=document.getElementById('sgOverlay');
 const climber=document.getElementById('sgCurrentClimber');
 if(!sgReachedSummit){if(climber)sgSetPose(climber,sgPeak>.05?'fall':'idle');if(overlay)sgSetOverlay('¡BUEN INTENTO!','Has llegado a '+sgFormatKg(sgPeak)+'. ¡Ajusta tu fuerza y vuelve a por la cima!');}
 if(!sgRecord||sgPeak>sgRecord.kg){
  sgPendingRecord=sgPeak;
  const modal=document.getElementById('sgRecordModal'),input=document.getElementById('sgNickname'),score=document.getElementById('sgNewRecordScore');
  if(score)score.textContent=sgFormatKg(sgPeak);if(input)input.value='';if(modal)modal.style.display='grid';
  if(status)status.textContent=sgReachedSummit?'¡Has conquistado la cima y superado el récord! Guarda tu nombre.':'¡Nuevo récord de fuerza! Guarda tu apodo.';
 }else if(status)status.textContent=(sgReachedSummit?'¡CIMA CONQUISTADA! ':'¡Buen intento! ')+ 'Tu marca: '+sgFormatKg(sgPeak)+'. Récord: '+sgRecord.nickname+' ('+sgFormatKg(sgRecord.kg)+').';
 sgRender();
}
function strengthGameSaveRecord(event) {
 if(event)event.preventDefault();
 const input=document.getElementById('sgNickname'),nickname=String(input&&input.value||'').trim().slice(0,18);
 if(!nickname||!sgPendingRecord){if(input)input.focus();return;}
 sgRecord={kg:sgPendingRecord,nickname:nickname,at:new Date().toISOString()};
 try{localStorage.setItem(SG_RECORD_KEY,JSON.stringify(sgRecord));}catch(e){}
 sgPendingRecord=0;
 const modal=document.getElementById('sgRecordModal');if(modal)modal.style.display='none';
 const status=document.getElementById('sgGameStatus');if(status)status.textContent=(sgReachedSummit?'¡VICTORIA! ':'¡NUEVO RÉCORD! ')+nickname+' consigue '+sgFormatKg(sgRecord.kg)+'. ¡La marca queda guardada en este móvil!';
 const overlay=document.getElementById('sgOverlay');
 if(overlay)sgSetOverlay(sgReachedSummit?'¡VICTORIA!':'¡NUEVO RÉCORD!','¡'+nickname+' ha conseguido '+sgFormatKg(sgRecord.kg)+'! ¡A ver quién consigue superarlo!');
 sgRender();
}
function strengthGameReset() {
 sgActive=false;sgCountdownActive=false;sgVisualProgress=0;sgVisualLastAt=0;sgThermoBroken=false;if(sgThermoBreakTimer){clearTimeout(sgThermoBreakTimer);sgThermoBreakTimer=null;}const section=document.getElementById('strengthGame');if(section)section.classList.remove('sg-playing');if(sgCountdownTimer){clearInterval(sgCountdownTimer);sgCountdownTimer=null;}if(sgFrame)cancelAnimationFrame(sgFrame);sgFrame=null;sgStopMusic();if(sgVictoryTimer){clearTimeout(sgVictoryTimer);sgVictoryTimer=null;}sgPeak=0;sgReachedSummit=false;sgVictoryShown=false;sgLastLevel=0;sgForceFiltered=0;sgForceInitialized=false;sgLastSensorPacketAt=0;sgPendingRecord=0;
 const modal=document.getElementById('sgRecordModal');if(modal)modal.style.display='none';
 const banner=document.getElementById('sgVictoryBanner');if(banner)banner.classList.remove('active');
 const fireworks=document.getElementById('sgFireworks');if(fireworks){fireworks.classList.remove('active');fireworks.innerHTML='';}
 const scene=document.getElementById('sgScene');if(scene){scene.classList.remove('sg-summit-reached','sg-summit-near','sg-victory-camera','sg-thermo-broken','sg-thermo-broken-settled');scene.style.setProperty('--sg-progress','0');}const world=document.getElementById('sgWorld');if(world){world.style.setProperty('--sg-progress','0');world.style.transform='translateY(-82.5%)';}
 const climber=document.getElementById('sgCurrentClimber');if(climber)sgSetPose(climber,'idle');
 const overlay=document.getElementById('sgOverlay');
 if(overlay)sgSetOverlay('¡A POR LA CIMA!','Aprieta el WH-C06 para hacer subir al escalador. El récord anterior permanece guardado.');
 const start=document.getElementById('sgStartButton');if(start)start.textContent='▶ Empezar partida';
 const finish=document.getElementById('sgFinishButton');if(finish)finish.disabled=true;
 const timer=document.getElementById('sgTimer');if(timer)timer.textContent='12 s';
 const status=document.getElementById('sgGameStatus');if(status)status.textContent='Partida preparada. Tu récord se conserva.';
 sgRender();
}
function strengthGameClose() {
  strengthGameReset();document.body.classList.remove('br-fullscreen-active');
  const section=document.getElementById('strengthGame');if(section){section.classList.remove('strength-fullscreen-game');section.style.removeProperty('display');}document.documentElement.style.removeProperty('overflow');document.body.style.removeProperty('overflow');
  try{if(window.AndroidUi&&AndroidUi.exitGameFullscreen)AndroidUi.exitGameFullscreen();}catch(e){}
  show('gameHub');
}
