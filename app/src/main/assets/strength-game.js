/* SOLIDO CLIMBING · Reto de fuerza en la montaña.
   Recordatorio: el récord y el apodo se guardan en localStorage del dispositivo.
   Usa currentForce, alimentado por el WH-C06 ya conectado. No toca el puente Bluetooth. */
const SG_RECORD_KEY = 'solidoFeriaClimberRecordV1';
let sgRecord = null, sgActive = false, sgPeak = 0, sgStartedAt = 0, sgFrame = null;
let sgDurationMs = 12000, sgMaxKg = 20, sgPendingRecord = 0;
let sgReachedSummit=false, sgVictoryShown=false, sgMusicTimer=null, sgAudio=null, sgMusicStep=0, sgLastLevel=0;
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
function sgSensorConnected(){
 const status=document.getElementById('whStatus');
 const homeDot=document.getElementById('homeWHDot');
 return !!((homeDot&&homeDot.classList.contains('connected'))||(status&&/conectado/i.test(status.textContent)));
}
function sgUpdateConnectionUI(){
 const connected=sgSensorConnected();
 ['sgHubConnectDot','sgGameConnectDot'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.toggle('connected',connected);});
 ['sgHubConnectText','sgGameConnectText'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=connected?'WH-C06 conectado · listo para jugar':'WH-C06 desconectado';});
 const connect=document.getElementById('sgHubConnectButton'),disconnect=document.getElementById('sgHubDisconnectButton');
 if(connect)connect.style.display=connected?'none':'inline-flex';
 if(disconnect)disconnect.style.display=connected?'inline-flex':'none';
}
function sgConnectSensor(){
 try{
  if(typeof connectWHC06==='function')connectWHC06();
  else {const status=document.getElementById('sgGameStatus');if(status)status.textContent='No se encuentra el control de conexión WH-C06.';}
  setTimeout(sgUpdateConnectionUI,250);
 }catch(e){const status=document.getElementById('sgGameStatus');if(status)status.textContent='No se pudo iniciar la conexión: '+(e.message||e);}
}
function sgDisconnectSensor(){
 try{if(typeof disconnectWHC06==='function')disconnectWHC06();}catch(e){}
 sgUpdateConnectionUI();
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
  const ctx=sgAudio,master=ctx.createGain(),now=ctx.currentTime;master.gain.setValueAtTime(.0001,now);master.gain.linearRampToValueAtTime(.2,now+.08);master.gain.exponentialRampToValueAtTime(.0001,now+3.3);master.connect(ctx.destination);
  [523.25,659.25,783.99,1046.5,783.99,1046.5,1318.51].forEach((freq,i)=>{const at=now+.08+i*.36,osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='triangle';osc.frequency.value=freq;gain.gain.setValueAtTime(.0001,at);gain.gain.linearRampToValueAtTime(.22,at+.04);gain.gain.exponentialRampToValueAtTime(.0001,at+.33);osc.connect(gain);gain.connect(master);osc.start(at);osc.stop(at+.35);});
 }catch(e){}
}
function sgLaunchFireworks(){
 const host=document.getElementById('sgFireworks');if(!host)return;
 host.innerHTML='';
 const colors=['#fff36b','#ff6b8a','#8af7ff','#b7ff6b','#e9a2ff','#ffb45c'];
 for(let burst=0;burst<9;burst++){
  const cx=8+Math.random()*84,cy=10+Math.random()*68;
  for(let i=0;i<14;i++){
   const dot=document.createElement('i'),angle=(Math.PI*2*i)/14,r=18+Math.random()*30;
   dot.className='sg-firework';dot.style.left=cx+'%';dot.style.top=cy+'%';dot.style.color=colors[burst%colors.length];
   dot.style.setProperty('--fx',(Math.cos(angle)*r)+'px');dot.style.setProperty('--fy',(Math.sin(angle)*r)+'px');
   dot.style.animationDelay=(Math.random()*.7)+'s';host.appendChild(dot);
  }
 }
 host.classList.add('active');
 setTimeout(()=>{host.classList.remove('active');host.innerHTML='';},4200);
}
function sgSetOverlay(title,body){
 const overlay=document.getElementById('sgOverlay');if(!overlay)return;
 overlay.textContent='';
 const strong=document.createElement('strong'),span=document.createElement('span');
 strong.textContent=title;span.textContent=body;overlay.appendChild(strong);overlay.appendChild(span);overlay.style.display='grid';
}
function sgShowVictory(){
 if(sgVictoryShown)return;sgVictoryShown=true;sgStopMusic();
 const scene=document.getElementById('sgScene'),banner=document.getElementById('sgVictoryBanner'),overlay=document.getElementById('sgOverlay');
 if(scene)scene.classList.add('sg-summit-reached');
 if(banner)banner.classList.add('active');
 const climber=document.getElementById('sgCurrentClimber');if(climber)sgSetPose(climber,'victory');
 if(overlay)overlay.style.display='none';
 const phrase=document.getElementById('sgLevelPhrase');if(phrase)phrase.textContent='NIVEL 10 · ¡¡¡ERES EL REY DE LA MONTAÑA!!!';
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
function sgSetClimber(el,v) { if(el){el.style.top='53%';el.style.bottom='auto';} }
function sgSetPose(el,pose){if(!el)return;const img=el.querySelector('img');if(!img)return;if(el.dataset.pose===pose)return;el.dataset.pose=pose;img.src='climber_'+pose+'.png';}
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
 const liveKg=document.getElementById('sgLiveKg'),peakKg=document.getElementById('sgPeakKg');
 const message=document.getElementById('sgMessage'),recordText=document.getElementById('sgRecordText');
 const force=Math.max(0,Number(typeof currentForce!=='undefined'?currentForce:0)||0);
 if(recName)recName.textContent=sgRecord?sgRecord.nickname:'Aún sin récord';
 if(recKg)recKg.textContent=sgRecord?sgFormatKg(sgRecord.kg):'— kg';
 if(recordText)recordText.textContent=sgRecord?'RÉCORD · '+sgRecord.nickname+' · '+sgFormatKg(sgRecord.kg):'¡Sé el primero en llegar a la cima!';
 if(ghost){sgSetClimber(ghost,sgRecord?sgRecord.kg:0);ghost.style.opacity=sgRecord?'.30':'0';}
 if(live){sgSetClimber(live,sgPeak);sgSetPose(live,sgVictoryShown?'victory':(sgActive?(force>=sgMaxKg*.55?'effort':'climbing'):'idle'));}
 if(liveKg)liveKg.textContent=sgFormatKg(force);
 if(peakKg)peakKg.textContent=sgFormatKg(sgPeak);
 if(message)message.textContent=sgMessageFor(sgActive?force:sgPeak);
 const bar=document.getElementById('sgForceBar');if(bar)bar.style.height=(sgProgress(force)*100).toFixed(1)+'%';
 const forceText=document.getElementById('sgForceValue');if(forceText)forceText.textContent=sgFormatKg(force);
 const phrase=document.getElementById('sgLevelPhrase');
 const level=Math.min(10,Math.max(1,Math.ceil(sgProgress(sgPeak)*10)||1));
 if(phrase&&!sgVictoryShown){if(level!==sgLastLevel){phrase.classList.remove('sg-level-pop');void phrase.offsetWidth;phrase.classList.add('sg-level-pop');sgLastLevel=level;}phrase.innerHTML='<span>NIVEL '+level+'</span><strong>'+sgLevelPhrases[level-1]+'</strong>';}
 const summit=document.getElementById('sgScene');
 if(summit){summit.style.setProperty('--sg-progress',String(sgProgress(sgPeak)));summit.classList.toggle('sg-summit-near',sgProgress(sgPeak)>=.72);summit.classList.toggle('sg-summit-reached',sgReachedSummit);}
 const recordTag=document.getElementById('sgRecordTag');if(recordTag)recordTag.style.top='51%';
 const currentTag=document.getElementById('sgCurrentTag');if(currentTag)currentTag.style.top='57%';
 sgUpdateConnectionUI();
}
function strengthGameStart() {
 if(sgActive)return;
 if(!sgSensorConnected()){const status=document.getElementById('sgGameStatus');if(status)status.textContent='Primero conecta el WH-C06 para medir fuerza real.';sgUpdateConnectionUI();return;}
 sgPeak=0;sgReachedSummit=false;sgVictoryShown=false;sgLastLevel=0;sgStartedAt=performance.now();sgActive=true;
 const scene=document.getElementById('sgScene');if(scene){scene.classList.remove('sg-summit-reached','sg-summit-near');scene.style.setProperty('--sg-progress','0');}
 const climber=document.getElementById('sgCurrentClimber');if(climber)sgSetPose(climber,'climbing');
 const banner=document.getElementById('sgVictoryBanner');if(banner)banner.classList.remove('active');
 const overlay=document.getElementById('sgOverlay');if(overlay)overlay.style.display='none';
 const start=document.getElementById('sgStartButton');if(start)start.textContent='Midiendo fuerza…';
 const finish=document.getElementById('sgFinishButton');if(finish)finish.disabled=false;
 const status=document.getElementById('sgGameStatus');if(status)status.textContent='¡Aprieta! La fuerza del sensor te hará subir. Tienes 12 segundos.';
 sgStartSuspenseMusic();
 if(sgFrame)cancelAnimationFrame(sgFrame);sgFrame=requestAnimationFrame(sgTick);
}
function sgTick(now) {
 if(!sgActive)return;
 const force=Math.max(0,Number(typeof currentForce!=='undefined'?currentForce:0)||0);
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
 const status=document.getElementById('sgGameStatus'),overlay=document.getElementById('sgOverlay');
 if(sgPeak<.05){
  if(status)status.textContent='No hemos recibido fuerza del WH-C06. Comprueba que esté conectado y vuelve a intentarlo.';
  if(overlay)sgSetOverlay('NO HEMOS DETECTADO FUERZA','Conecta el WH-C06 y vuelve a intentarlo. No se ha guardado ninguna marca.');
  return;
 }
 if(sgReachedSummit)sgShowVictory();
 else {const climber=document.getElementById('sgCurrentClimber');if(climber)sgSetPose(climber,sgPeak>.05?'fall':'idle');if(overlay)sgSetOverlay('¡BUEN INTENTO!','Has llegado a '+sgFormatKg(sgPeak)+'. ¡Ajusta tu fuerza y vuelve a por la cima!');}
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
 sgActive=false;if(sgFrame)cancelAnimationFrame(sgFrame);sgFrame=null;sgStopMusic();sgPeak=0;sgReachedSummit=false;sgVictoryShown=false;sgLastLevel=0;sgPendingRecord=0;
 const modal=document.getElementById('sgRecordModal');if(modal)modal.style.display='none';
 const banner=document.getElementById('sgVictoryBanner');if(banner)banner.classList.remove('active');
 const fireworks=document.getElementById('sgFireworks');if(fireworks){fireworks.classList.remove('active');fireworks.innerHTML='';}
 const scene=document.getElementById('sgScene');if(scene)scene.classList.remove('sg-summit-reached');
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
  const section=document.getElementById('strengthGame');if(section)section.classList.remove('strength-fullscreen-game');
  try{if(window.AndroidUi&&AndroidUi.exitGameFullscreen)AndroidUi.exitGameFullscreen();}catch(e){}
  show('gameHub');
}
