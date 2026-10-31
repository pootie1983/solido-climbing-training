/* SOLIDO CLIMBING · Reto de fuerza en la montaña.
   Recordatorio: el récord y el apodo se guardan en localStorage del dispositivo.
   Usa currentForce, alimentado por el WH-C06 ya conectado. No toca el puente Bluetooth. */
const SG_RECORD_KEY = 'solidoFeriaClimberRecordV1';
let sgRecord = null, sgActive = false, sgPeak = 0, sgStartedAt = 0, sgFrame = null;
let sgDurationMs = 12000, sgMaxKg = 20, sgPendingRecord = 0;
function sgLoadRecord() {
  try {
    const v = JSON.parse(localStorage.getItem(SG_RECORD_KEY) || 'null');
    sgRecord = v && Number.isFinite(Number(v.kg)) ? {kg:Math.max(0,Number(v.kg)),nickname:String(v.nickname||'Escalador').slice(0,18),at:v.at||''} : null;
  } catch(e) { sgRecord=null; }
}
function sgFormatKg(v) { return Math.max(0,Number(v)||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})+' kg'; }
function sgProgress(v) { return Math.max(0,Math.min(1,(Number(v)||0)/Math.max(1,sgMaxKg))); }
function sgSetClimber(el,v) { if(el) el.style.bottom='calc(16px + '+(sgProgress(v)*66).toFixed(2)+'%)'; }
function sgMessageFor(v) {
  const p=sgProgress(v);
  if(p>=1)return '¡HAS TOCADO LA CIMA!';
  if(p>=.8)return '¡IMPRESIONANTE, CASI EN LA CIMA!';
  if(p>=.6)return '¡MUY BIEN, SIGUE ASÍ!';
  if(p>=.4)return '¡BUEN IMPULSO!';
  if(p>=.2)return '¡VAS SUBIENDO!';
  if(p>0)return '¡UN POCO MÁS DE FUERZA!';
  return '¡PREPARADO PARA ESCALAR!';
}
function strengthGameOnShow() {
  sgLoadRecord();
  const slider=document.getElementById('sgMaxKg');
  if(slider){const n=Number(localStorage.getItem('solidoFeriaMaxKg')||20);sgMaxKg=Number.isFinite(n)?Math.max(5,Math.min(100,n)):20;slider.value=String(sgMaxKg);}
  const label=document.getElementById('sgMaxKgLabel');
  if(label)label.textContent=sgMaxKg.toLocaleString('es-ES')+' kg = cima';
  sgRender();
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
  if(recName)recName.textContent=sgRecord?sgRecord.nickname:'Aún sin récord';
  if(recKg)recKg.textContent=sgRecord?sgFormatKg(sgRecord.kg):'— kg';
  if(recordText)recordText.textContent=sgRecord?'RÉCORD · '+sgRecord.nickname+' · '+sgFormatKg(sgRecord.kg):'¡Sé el primero en llegar a la cima!';
  if(ghost){sgSetClimber(ghost,sgRecord?sgRecord.kg:0);ghost.style.opacity=sgRecord?'.30':'0';}
  if(live)sgSetClimber(live,sgPeak);
  if(liveKg)liveKg.textContent=sgFormatKg(typeof currentForce!=='undefined'?currentForce:0);
  if(peakKg)peakKg.textContent=sgFormatKg(sgPeak);
  if(message)message.textContent=sgMessageFor(sgPeak);
  const bar=document.getElementById('sgForceBar');
  if(bar)bar.style.width=(sgProgress(sgPeak)*100).toFixed(1)+'%';
}
function strengthGameStart() {
  if(sgActive)return;
  sgPeak=0;sgStartedAt=performance.now();sgActive=true;
  const overlay=document.getElementById('sgOverlay');if(overlay)overlay.style.display='none';
  const start=document.getElementById('sgStartButton');if(start)start.textContent='Midiendo fuerza…';
  const finish=document.getElementById('sgFinishButton');if(finish)finish.disabled=false;
  const status=document.getElementById('sgGameStatus');if(status)status.textContent='Aprieta el WH-C06 con fuerza progresiva durante 12 segundos';
  if(sgFrame)cancelAnimationFrame(sgFrame);
  sgFrame=requestAnimationFrame(sgTick);
}
function sgTick(now) {
  if(!sgActive)return;
  const force=Math.max(0,Number(typeof currentForce!=='undefined'?currentForce:0)||0);
  if(force>sgPeak)sgPeak=force;
  sgRender();
  const left=Math.max(0,Math.ceil((sgDurationMs-(now-sgStartedAt))/1000));
  const timer=document.getElementById('sgTimer');if(timer)timer.textContent=left+' s';
  if(now-sgStartedAt>=sgDurationMs){sgFinish();return;}
  sgFrame=requestAnimationFrame(sgTick);
}
function strengthGameFinishEarly(){if(sgActive)sgFinish();}
function sgFinish() {
  if(!sgActive)return;
  sgActive=false;if(sgFrame)cancelAnimationFrame(sgFrame);sgFrame=null;
  const start=document.getElementById('sgStartButton');if(start)start.textContent='↻ Nueva partida';
  const finish=document.getElementById('sgFinishButton');if(finish)finish.disabled=true;
  const status=document.getElementById('sgGameStatus'),overlay=document.getElementById('sgOverlay');
  if(sgPeak<.05){
    if(status)status.textContent='No hemos recibido fuerza del WH-C06. Comprueba que esté conectado y vuelve a intentarlo.';
    if(overlay){overlay.style.display='grid';overlay.innerHTML='<strong>NO HEMOS DETECTADO FUERZA</strong><span>Conecta el WH-C06 y vuelve a intentarlo. No se ha guardado ninguna marca.</span>';}
    return;
  }
  if(!sgRecord||sgPeak>sgRecord.kg){
    sgPendingRecord=sgPeak;
    const modal=document.getElementById('sgRecordModal'),input=document.getElementById('sgNickname'),score=document.getElementById('sgNewRecordScore');
    if(score)score.textContent=sgFormatKg(sgPeak);if(input)input.value='';if(modal)modal.style.display='grid';
    if(status)status.textContent=sgRecord?'¡Nuevo récord! Escribe tu apodo para guardarlo.':'¡Primera marca! Escribe tu apodo para inaugurar el récord.';
  }else{
    if(status)status.textContent=sgMessageFor(sgPeak)+' Tu marca: '+sgFormatKg(sgPeak)+'. El récord sigue siendo de '+sgRecord.nickname+' ('+sgFormatKg(sgRecord.kg)+').';
    if(overlay){overlay.style.display='grid';overlay.innerHTML='<strong>'+sgMessageFor(sgPeak)+'</strong><span>Has llegado a '+sgFormatKg(sgPeak)+'. El récord de '+sgRecord.nickname+' sigue en '+sgFormatKg(sgRecord.kg)+'.</span>';}
  }
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
  const status=document.getElementById('sgGameStatus');if(status)status.textContent='¡NUEVO RÉCORD! '+nickname+' alcanza '+sgFormatKg(sgRecord.kg)+'. ¡La marca queda guardada en este móvil!';
  const overlay=document.getElementById('sgOverlay');
  if(overlay){overlay.style.display='grid';overlay.innerHTML='<strong>¡NUEVO RÉCORD!</strong><span>'+nickname+' ha subido hasta '+sgFormatKg(sgRecord.kg)+'. ¡A ver quién consigue superarlo!</span>';}
  sgRender();
}
function strengthGameReset() {
  sgActive=false;if(sgFrame)cancelAnimationFrame(sgFrame);sgFrame=null;sgPeak=0;sgPendingRecord=0;
  const modal=document.getElementById('sgRecordModal');if(modal)modal.style.display='none';
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
