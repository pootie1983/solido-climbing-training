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
    const status=$('coachSaveStatus');
    if(status)status.textContent=ok?'Preferencias guardadas en este dispositivo.':'No se pudieron guardar todos los datos.';
  };
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
    const defaults={days:read('solidoCoachDays','3'),experience:read('solidoCoachExperience','intermedio'),equipment:read('solidoCoachEquipment','gimnasio'),limitations:read('solidoCoachLimitations','')};
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
