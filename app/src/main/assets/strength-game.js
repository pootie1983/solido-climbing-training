/* SOLIDO CLIMBING · Reto de fuerza en la montaña.
   Recordatorio: el récord y el apodo se guardan en localStorage del dispositivo.
   Usa currentForce, alimentado por el WH-C06 ya conectado. No toca el puente Bluetooth. */
const SG_RECORD_KEY = 'solidoFeriaClimberRecordV1';
let sgRecord = null, sgActive = false, sgPeak = 0, sgStartedAt = 0, sgFrame = null;
let sgDurationMs = 12000, sgMaxKg = 20, sgPendingRecord = 0;
let sgReachedSummit=false, sgVictoryShown=false, sgMusicTimer=null, sgAudio=null, sgMusicStep=0;
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
  if(!sgAudio)sgAudio=new Ctx();
  if(sgAudio.state==='suspended')sgAudio.resume();
  sgStopMusic();
  const ctx=sgAudio,master=ctx.createGain();master.gain.value=.055;master.connect(ctx.destination);
  const bass=ctx.createOscillator(),bassGain=ctx.createGain();bass.type='sawtooth';bass.frequency.value=55;bassGain.gain.value=.35;bass.connect(bassGain);bassGain.connect(master);bass.start();
  const pulse=()=>{
   if(!sgActive||!sgAudio)return;
   const now=ctx.currentTime,notes=[110,146.83,123.47,164.81],freq=notes[sgMusicStep++%notes.length];
   const osc=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();
   osc.type='triangle';osc.frequency.setValueAtTime(freq,now);osc.frequency.exponentialRampToValueAtTime(freq*.72,now+.45);
   filter.type='lowpass';filter.frequency.value=500;gain.gain.setValueAtTime(.0001,now);gain.gain.linearRampToValueAtTime(.25,now+.04);gain.gain.exponentialRampToValueAtTime(.0001,now+.52);
   osc.connect(filter);filter.connect(gain);gain.connect(master);osc.start(now);osc.stop(now+.55);
   sgMusicTimer=setTimeout(pulse,650);
  };
  sgMusicTimer=setTimeout(pulse,100);
  sgAudio._sgMaster=master;sgAudio._sgBass=bass;
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
   dot.style.transform='translate('+Math.cos(angle)*r+'px,'+Math.sin(angle)*r+'px)';
   dot.style.animationDelay=(Math.random()*.7)+'s';host.appendChild(dot);
  }
 }
 host.classList.add('active');
 setTimeout(()=>{host.classList.remove('active');host.innerHTML='';},4200);
}
function sgShowVictory(){
 if(sgVictoryShown)return;sgVictoryShown=true;sgStopMusic();
 const scene=document.getElementById('sgScene'),banner=document.getElementById('sgVictoryBanner'),overlay=document.getElementById('sgOverlay');
 if(scene)scene.classList.add('sg-summit-reached');
 if(banner)banner.classList.add('active');
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
function sgSetClimber(el,v) { if(el) el.style.bottom='calc(16px + '+(sgProgress(v)*75).toFixed(2)+'%)'; }
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
 if(live)sgSetClimber(live,sgPeak);
 if(liveKg)liveKg.textContent=sgFormatKg(force);
 if(peakKg)peakKg.textContent=sgFormatKg(sgPeak);
 if(message)message.textContent=sgMessageFor(sgActive?force:sgPeak);
 const bar=document.getElementById('sgForceBar');if(bar)bar.style.height=(sgProgress(force)*100).toFixed(1)+'%';
 const forceText=document.getElementById('sgForceValue');if(forceText)forceText.textContent=sgFormatKg(force);
 const phrase=document.getElementById('sgLevelPhrase');
 const level=Math.min(10,Math.max(1,Math.ceil(sgProgress(sgPeak)*10)||1));
 if(phrase&&!sgVictoryShown)phrase.textContent='NIVEL '+level+' · '+sgLevelPhrases[level-1];
 const summit=document.getElementById('sgScene');
 if(summit)summit.classList.toggle('sg-summit-reached',sgReachedSummit);
 const recordTag=document.getElementById('sgRecordTag');if(recordTag)recordTag.style.bottom='calc(16px + '+(sgProgress(sgRecord?sgRecord.kg:0)*75).toFixed(2)+'%)';
 const currentTag=document.getElementById('sgCurrentTag');if(currentTag)currentTag.style.bottom='calc(16px + '+(sgProgress(sgPeak)*75).toFixed(2)+'%)';
 sgUpdateConnectionUI();
}
function strengthGameStart() {
 if(sgActive)return;
 if(!sgSensorConnected()){const status=document.getElementById('sgGameStatus');if(status)status.textContent='Primero conecta el WH-C06 para medir fuerza real.';sgUpdateConnectionUI();return;}
 sgPeak=0;sgReachedSummit=false;sgVictoryShown=false;sgStartedAt=performance.now();sgActive=true;
 const scene=document.getElementById('sgScene');if(scene)scene.classList.remove('sg-summit-reached');
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
  if(overlay){overlay.style.display='grid';overlay.innerHTML='<strong>NO HEMOS DETECTADO FUERZA</strong><span>Conecta el WH-C06 y vuelve a intentarlo. No se ha guardado ninguna marca.</span>';}
  return;
 }
 if(sgReachedSummit)sgShowVictory();
 else if(overlay){overlay.style.display='grid';overlay.innerHTML='<strong>¡BUEN INTENTO!</strong><span>Has llegado a '+sgFormatKg(sgPeak)+'. ¡Ajusta tu fuerza y vuelve a por la cima!</span>';}
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
 if(overlay){overlay.style.display='grid';overlay.innerHTML='<strong>'+(sgReachedSummit?'¡VICTORIA!':'¡NUEVO RÉCORD!')+'</strong><span>¡'+nickname+' ha conseguido '+sgFormatKg(sgRecord.kg)+'! ¡A ver quién consigue superarlo!</span>';}
 sgRender();
}
function strengthGameReset() {
 sgActive=false;if(sgFrame)cancelAnimationFrame(sgFrame);sgFrame=null;sgStopMusic();sgPeak=0;sgReachedSummit=false;sgVictoryShown=false;sgPendingRecord=0;
 const modal=document.getElementById('sgRecordModal');if(modal)modal.style.display='none';
 const banner=document.getElementById('sgVictoryBanner');if(banner)banner.classList.remove('active');
 const fireworks=document.getElementById('sgFireworks');if(fireworks){fireworks.classList.remove('active');fireworks.innerHTML='';}
 const scene=document.getElementById('sgScene');if(scene)scene.classList.remove('sg-summit-reached');
 const overlay=document.getElementById('sgOverlay');
 if(overlay){overlay.style.display='grid';overlay.innerHTML='<strong>¡A POR LA CIMA!</strong><span>Aprieta el WH-C06 para hacer subir al escalador. El récord anterior permanece guardado.</span>';}
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
