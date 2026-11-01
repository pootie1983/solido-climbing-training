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
    const saveResults=[
      write('solidoCoachDays',days),
      write('solidoCoachExperience',experience),
      write('solidoCoachEquipment',equipment),
      write('solidoCoachLimitations',limitations)
    ];
    const ok=saveResults.every(Boolean);
    render();
    const status=$('coachSaveStatus');
    if(status)status.textContent=ok?'Preferencias guardadas en este dispositivo.':'No se pudieron guardar todos los datos.';
  };
  function sessionDate(item){
    if(item&&item.ts){const parsed=new Date(item.ts);if(Number.isFinite(parsed.getTime()))return parsed;}
    const value=String(item&&item.date||'');
    const match=value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if(!match)return null;
    const parsed=new Date(Number(match[3]),Number(match[2])-1,Number(match[1]),Number(match[4]||0),Number(match[5]||0),Number(match[6]||0));
    if(parsed.getFullYear()!==Number(match[3])||parsed.getMonth()!==Number(match[2])-1||parsed.getDate()!==Number(match[1]))return null;
    return Number.isFinite(parsed.getTime())?parsed:null;
  }
  function getActivityStats(sessionList){
    const now=Date.now(),monthAgo=now-30*24*60*60*1000;
    const dated=sessionList.map(item=>({item,date:sessionDate(item)})).filter(row=>row.date&&Number.isFinite(row.date.getTime()));
    const month=dated.filter(row=>row.date.getTime()>=monthAgo&&row.date.getTime()<=now);
    const minutes=month.reduce((sum,row)=>sum+Math.max(0,Number(row.item.mins)||0),0);
    const forceRows=month.filter(row=>Number(row.item.force)>0);
    const allForceRows=dated.filter(row=>row.date.getTime()<=now&&Number(row.item.force)>0).sort((a,b)=>b.date-a.date);
    const bestForce=allForceRows.reduce((best,row)=>Math.max(best,Number(row.item.force)||0),0);
    const latestForce=allForceRows[0]||null;
    return {total:sessionList.filter(item=>{if(Number(item.force))return false;const date=sessionDate(item);if(date)return date.getTime()<=now;return !item.ts&&!item.date;}).length,month:month.filter(row=>!Number(row.item.force)).length,minutes,bestForce,forceCount:forceRows.length,latestForce:latestForce?Number(latestForce.item.force):0,latestForceDate:latestForce?latestForce.date.toLocaleDateString('es-ES'):'',latestForceHand:latestForce?String(latestForce.item.hand||''):'',latestForceGrip:latestForce?String(latestForce.item.grip||''):''};
  }
  function buildLocalAdvice(sessionList,profile,preferences,personality){
    const now=Date.now(),weekAgo=now-7*24*60*60*1000;
    const dated=sessionList.map(item=>({item,date:sessionDate(item)})).filter(x=>x.date&&Number.isFinite(x.date.getTime())&&x.date.getTime()<=now);
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
  function buildProposal(profile,preferences){
    if(preferences.limitations.trim())return null;
    const goal=profile.goal||'Fuerza general',age=Number(profile.age)||0,equipment=preferences.equipment||'casa',level=String(profile.level||'').toLowerCase(),beginner=level==='principiante'||preferences.experience==='principiante',advanced=level==='avanzado'||preferences.experience==='avanzado',days=Math.max(1,Math.min(7,Number(preferences.days)||3));
    const warmup=[{id:19,sets:1,reps:1,work:300,rest:0,label:'Calentamiento general',detail:'5 minutos a intensidad suave'},{id:21,sets:1,reps:1,work:30,rest:0,label:'Movilidad de hombros',detail:'30 segundos de movimientos controlados'},{id:23,sets:1,reps:1,work:30,rest:0,label:'Movilidad de muñecas',detail:'30 segundos de activación suave'}];
    let main=[],category='Fuerza',name='SOLIDO COACH · Fuerza general',note='Mantén una intensidad cómoda y deja varias repeticiones en reserva.';
    if(goal==='Fuerza de dedos'){
      category='Fuerza';name='SOLIDO COACH · Cuidado y fuerza de manos';
      if(age>=18&&(equipment==='gimnasio'||equipment==='completo')){main=[{id:2,sets:2,reps:12,work:5,rest:45,label:'Trabajo de agarre con pelota',detail:'Apretón suave, sin llegar al fallo'},{id:28,sets:2,reps:15,work:5,rest:45,label:'Fuerza de dedos antagonistas',detail:'Aperturas suaves con goma ligera'},{id:17,sets:2,reps:12,work:5,rest:45,label:'Rotadores de hombro con banda',detail:'Resistencia ligera y controlada'}];note='Sesión conservadora: no incluye suspensiones máximas ni trabajo al fallo.';}
      else{main=[{id:24,sets:2,reps:10,work:5,rest:20,label:'Movilidad de dedos',detail:'Aperturas y cierres suaves'},{id:9,sets:2,reps:1,work:20,rest:30,label:'Plancha abdominal',detail:'Mantén una postura cómoda y estable'},{id:32,sets:2,reps:12,work:5,rest:45,label:'Puente de glúteos',detail:'Movimiento controlado, sin dolor'}];note='Por edad o material disponible, la propuesta evita cargas específicas de dedos y ejercicios que requieren rocódromo.';}
    }else if(goal==='Resistencia'){
      category='Resistencia';name='SOLIDO COACH · Resistencia técnica';
      main=(equipment==='gimnasio'||equipment==='completo')?[{id:29,sets:1,reps:1,work:600,rest:60,label:'Escalada en volumen bajo',detail:'10 minutos en vías muy fáciles'},{id:11,sets:1,reps:1,work:600,rest:60,label:'Trabajo de pies en muro',detail:'10 minutos de precisión y fluidez'},{id:9,sets:2,reps:1,work:20,rest:45,label:'Plancha abdominal',detail:'2 series de 20 segundos, con técnica limpia'}]:[{id:43,sets:2,reps:8,work:5,rest:45,label:'Escaladores controlados',detail:'Ritmo cómodo, sin perder la postura'},{id:46,sets:2,reps:8,work:5,rest:45,label:'Pájaro-perro',detail:'Alterna lados con control'},{id:9,sets:2,reps:1,work:20,rest:45,label:'Plancha abdominal',detail:'2 series de 20 segundos, con técnica limpia'}];
    }else if(goal==='Preparación para vías ferratas'){
      category='Escalada';name='SOLIDO COACH · Preparación para vías ferratas';
      main=(equipment==='gimnasio'||equipment==='completo')?[{id:11,sets:1,reps:1,work:600,rest:60,label:'Trabajo de pies en muro',detail:'10 minutos de precisión y equilibrio'},{id:9,sets:2,reps:1,work:20,rest:45,label:'Plancha abdominal',detail:'2 series de 20 segundos'},{id:32,sets:2,reps:12,work:5,rest:45,label:'Puente de glúteos',detail:'2 series de 12 repeticiones controladas'}]:[{id:31,sets:2,reps:10,work:5,rest:45,label:'Pájaro / remo invertido',detail:'Usa solo un apoyo estable y una carga ligera'},{id:9,sets:2,reps:1,work:20,rest:45,label:'Plancha abdominal',detail:'2 series de 20 segundos'},{id:32,sets:2,reps:12,work:5,rest:45,label:'Puente de glúteos',detail:'2 series de 12 repeticiones controladas'}];
    }else{
      if(equipment==='gimnasio'||equipment==='completo'){main=[{id:5,sets:2,reps:beginner?3:5,work:5,rest:120,label:'Dominadas adaptadas',detail:'Usa asistencia si la necesitas; sin llegar al fallo'},{id:9,sets:2,reps:1,work:beginner?20:25,rest:45,label:'Plancha abdominal',detail:'2 series de 25 segundos'},{id:17,sets:2,reps:12,work:5,rest:45,label:'Rotadores de hombro con banda',detail:'Resistencia ligera'}];}
      else if(equipment==='basico'){main=[{id:31,sets:2,reps:beginner?8:10,work:5,rest:60,label:'Pájaro / remo invertido',detail:'Carga ligera y espalda estable'},{id:9,sets:2,reps:1,work:25,rest:45,label:'Plancha abdominal',detail:'2 series de 25 segundos'},{id:32,sets:2,reps:12,work:5,rest:45,label:'Puente de glúteos',detail:'Movimiento controlado'}];}
      else{main=[{id:9,sets:2,reps:1,work:20,rest:45,label:'Plancha abdominal',detail:'2 series de 20 segundos'},{id:32,sets:2,reps:12,work:5,rest:45,label:'Puente de glúteos',detail:'2 series de 12 repeticiones'},{id:13,sets:2,reps:6,work:5,rest:30,label:'Movilidad de cadera',detail:'6 movimientos cómodos por lado'}];}
    }
    if(advanced&&!beginner&&goal!=='Fuerza de dedos'){
      main=main.map(item=>({...item,sets:Math.min(3,item.sets+1)}));
      note+=' Ajuste para experiencia avanzada: volumen moderadamente superior, sin aumentar la carga específica de dedos.';
    }
    note+=' Disponibilidad semanal: '+days+' '+(days===1?'día':'días')+'. Esta es una propuesta de una sesión, no un calendario semanal automático; distribuye las sesiones intensas y reserva recuperación.';
    return {category,name,items:warmup.concat(main),note,daysAvailable:days};
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
    const activityStats=getActivityStats(sessionList);
    const proposal=buildProposal(profile,preferences);
    window.solidoCoachCurrentProposal=proposal?{category:proposal.category,name:proposal.name,items:proposal.items.map(({id,sets,reps,work,rest})=>({id,sets,reps,work,rest}))}:null;
    const proposalBody=$('coachProposalBody'),proposalItems=$('coachProposalItems'),proposalButton=$('coachProposalAccept');
    if(proposalBody)proposalBody.textContent=proposal?proposal.note:'Has indicado una lesión o limitación. No voy a generar una sesión automática: conviene adaptar los ejercicios con un profesional que conozca tu situación.';
    if(proposalItems)proposalItems.innerHTML=proposal?proposal.items.map(item=>'<div class="coach-proposal-item"><strong>'+safe(item.label)+'</strong><span>'+safe(item.detail)+'</span></div>').join(''):'';
    if(proposalButton)proposalButton.style.display=proposal?'block':'none';
    const advice=buildLocalAdvice(sessionList,profile,preferences,p.id);
    const adviceTitle=$('coachAdviceTitle'),adviceBody=$('coachAdviceBody');
    if(adviceTitle)adviceTitle.textContent=advice.title;
    if(adviceBody)adviceBody.textContent=advice.body;
    const target=$('coachProfileSummary');
    if(target){
      target.innerHTML=[
        ['Escalador',profile.nickname],['Edad',profile.age==='—'?'Sin indicar':profile.age+' años'],
        ['Altura',profile.height==='—'?'Sin indicar':profile.height+' cm'],['Peso',profile.weight==='—'?'Sin indicar':profile.weight+' kg'],
        ['Grado',profile.grade],['Nivel',profile.level],['Objetivo',profile.goal],['Sesiones guardadas',String(activityStats.total)],['Sesiones últimos 30 días',String(activityStats.month)],['Minutos últimos 30 días',String(activityStats.minutes)],['Mediciones de fuerza últimos 30 días',String(activityStats.forceCount)],['Mejor fuerza registrada',activityStats.bestForce?activityStats.bestForce.toFixed(2)+' kg':'Sin registros'],['Última medición',activityStats.latestForce?activityStats.latestForce.toFixed(2)+' kg · '+activityStats.latestForceDate:'Sin registros'],['Configuración última medición',activityStats.latestForce?activityStats.latestForceHand+' · '+activityStats.latestForceGrip+' mm':'—']
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
        ['Pulso medio (24 h)',$('hcHeart')?.textContent||'—'],['Sueño',$('hcSleep')?.textContent||'—']
      ];
      hc.innerHTML=values.map(([label,value])=>'<div class="coach-data"><span>'+safe(label)+'</span><strong>'+safe(value)+'</strong></div>').join('');
    }
  }
  window.solidoCoachRender=render;
  document.addEventListener('DOMContentLoaded',render);
})();
