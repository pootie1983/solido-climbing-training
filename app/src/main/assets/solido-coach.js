/* SOLIDO COACH · preferencias locales y lectura del perfil existente */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const read=(key,fallback='')=>{try{return localStorage.getItem(key)||fallback;}catch(e){return fallback;}};
  const write=(key,value)=>{try{localStorage.setItem(key,value);return true;}catch(e){return false;}};
  const safe=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const personalities=[
    {id:'cercano',label:'Cercano',face:'🤝',hint:'Cercano y motivador'},
    {id:'gracioso',label:'Gracioso',face:'😄',hint:'Divertido y desenfadado'},
    {id:'estricto',label:'Estricto',face:'🎯',hint:'Exigente y disciplinado'}
  ];
  window.solidoCoachSetPersonality=function(id){
    if(!personalities.some(p=>p.id===id))return;
    write('solidoCoachPersonality',id);
    render();
  };
  window.solidoCoachSaveDetails=function(event){
    if(event)event.preventDefault();
    const days=$('coachDays')?.value||'3';
    const experience=$('coachExperience')?.value||'intermedio';
    const equipment=$('coachEquipment')?.value||'gimnasio';
    const limitations=$('coachLimitations')?.value.trim()||'';
    const ok=write('solidoCoachDays',days)&&write('solidoCoachExperience',experience)&&write('solidoCoachEquipment',equipment)&&write('solidoCoachLimitations',limitations);
    render();
    const status=$('coachSaveStatus');
    if(status)status.textContent=ok?'Preferencias guardadas en este dispositivo.':'No se pudieron guardar todos los datos.';
  };
  function buildLocalAdvice(sessionList,profile,preferences,personality){
    const now=Date.now(),weekAgo=now-7*24*60*60*1000;
    const dated=sessionList.map(item=>{let date=item.ts?new Date(item.ts):null;if((!date||!Number.isFinite(date.getTime()))&&item.date){const m=String(item.date).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);if(m)date=new Date(Number(m[3]),Number(m[2])-1,Number(m[1]),Number(m[4]||0),Number(m[5]||0),Number(m[6]||0));}return {item,date};}).filter(x=>x.date&&Number.isFinite(x.date.getTime()));
    const recent=dated.filter(x=>x.date.getTime()>=weekAgo&&x.date.getTime()<=now);
    const completed=recent.filter(x=>Number(x.item.mins||0)>0);
    const minutes=completed.reduce((sum,x)=>sum+Math.max(0,Number(x.item.mins)||0),0);
    const last=dated.length?dated.sort((a,b)=>b.date-a.date)[0]:null;
    const days=Math.max(1,Math.min(7,Number(preferences.days)||3));
    const goal=profile.goal||'Fuerza general';
    let title,body;
    if(!sessionList.length){title='Tu punto de partida';body='Aún no hay entrenamientos guardados. Completa una primera sesión en SOLIDO y podré empezar a valorar tu constancia y evolución. Objetivo actual: '+goal+'.';}
    else if(!completed.length){title='Vamos a crear una rutina';body='Ya hay registros de actividad, pero todavía no encuentro sesiones completas con duración en los últimos 7 días. Empieza con una sesión adaptada a tu nivel y deja que el historial vaya marcando el progreso.';}
    else if(completed.length>=days){title='Buena constancia esta semana';body='Has registrado '+completed.length+' sesiones de entrenamiento y '+minutes+' minutos en los últimos 7 días. Con '+days+' días disponibles por semana, prioriza la calidad de cada sesión y reserva tiempo para recuperar.';}
    else{title='Siguiente paso: regularidad';body='Llevas '+completed.length+' sesiones y '+minutes+' minutos registrados en los últimos 7 días. Tu disponibilidad es de '+days+' días por semana. Intenta repartir las sesiones y evita encadenar trabajos intensos de dedos en días consecutivos.';}
    if(last&&now-last.date.getTime()<24*60*60*1000){body+=' Como has registrado actividad en las últimas 24 horas, valora hoy una jornada suave o de descanso antes de volver a cargar fuerte.';}
    if(preferences.limitations.trim()){body+=' Has indicado esta limitación: '+preferences.limitations+'. Ajusta cualquier ejercicio que la empeore y detén la actividad si aparece dolor.';}
    if(personality==='gracioso'){body='¡A por ello, que la roca no se escala sola! '+body;}else if(personality==='estricto'){body='Objetivo claro: '+body;}else{body='Vamos paso a paso: '+body;}
    return {title,body};
  }
  function render(){
    const p=personalities.find(x=>x.id===read('solidoCoachPersonality','cercano'))||personalities[0];
    const profile={
      nickname:read('solidoNickname','Sin apodo'),
      age:read('solidoAge','—'),
      height:read('solidoHeight','—'),
      weight:read('solidoWeight','—'),
      grade:read('solidoGrade','—'),
      level:read('solidoLevel','Intermedio'),
      goal:read('solidoGoal','Fuerza general')
    };
    const sessionList=(()=>{try{return JSON.parse(read('solidoSessions','[]'))||[];}catch(e){return [];}})();
    const preferences={days:read('solidoCoachDays','3'),experience:read('solidoCoachExperience','intermedio'),equipment:read('solidoCoachEquipment','gimnasio'),limitations:read('solidoCoachLimitations','')};
    const advice=buildLocalAdvice(sessionList,profile,preferences,p.id);
    const adviceTitle=$('coachAdviceTitle'),adviceBody=$('coachAdviceBody');
    if(adviceTitle)adviceTitle.textContent=advice.title;
    if(adviceBody)adviceBody.textContent=advice.body;
    const target=$('coachProfileSummary');
    if(target){
      target.innerHTML=[
        ['Escalador',profile.nickname],['Edad',profile.age==='—'?'Sin indicar':profile.age+' años'],
        ['Altura',profile.height==='—'?'Sin indicar':profile.height+' cm'],['Peso',profile.weight==='—'?'Sin indicar':profile.weight+' kg'],
        ['Grado',profile.grade],['Nivel',profile.level],['Objetivo',profile.goal],['Sesiones guardadas',String(sessionList.length)]
      ].map(([label,value])=>'<div class="coach-data"><span>'+safe(label)+'</span><strong>'+safe(value)+'</strong></div>').join('');
    }
    document.querySelectorAll('.coach-personality').forEach(button=>button.classList.toggle('active',button.dataset.personality===p.id));
    const selected=$('coachPersonalitySummary');
    if(selected)selected.textContent='Estilo seleccionado: '+p.label;
    const defaults=preferences;
    if($('coachDays'))$('coachDays').value=defaults.days;
    if($('coachExperience'))$('coachExperience').value=defaults.experience;
    if($('coachEquipment'))$('coachEquipment').value=defaults.equipment;
    if($('coachLimitations'))$('coachLimitations').value=defaults.limitations;
    const hc=$('coachHealthSummary');
    if(hc){
      const values=[
        ['Pasos',$('hcSteps')?.textContent||'—'],['Calorías',$('hcCalories')?.textContent||'—'],
        ['Pulso',$('hcHeart')?.textContent||'—'],['Sueño',$('hcSleep')?.textContent||'—']
      ];
      hc.innerHTML=values.map(([label,value])=>'<div class="coach-data"><span>'+safe(label)+'</span><strong>'+safe(value)+'</strong></div>').join('');
    }
  }
  window.solidoCoachRender=render;
  document.addEventListener('DOMContentLoaded',render);
})();
