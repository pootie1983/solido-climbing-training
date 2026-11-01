# SOLIDO COACH — contrato del backend de IA

## Estado

Este documento define la integración prevista. **No hay un backend desplegado ni una llamada de IA activa en la APK.** La aplicación debe seguir funcionando íntegramente con sus recomendaciones locales si el servicio no está configurado o no está disponible.

## Versión local prioritaria (fase actual)

La primera entrega de SOLIDO COACH funciona en el propio dispositivo y no requiere red ni backend. Incluye:
- Consejos calculados a partir del historial local, objetivo, disponibilidad semanal y personalidad elegida.
- Propuestas formadas exclusivamente con ejercicios del catálogo de SOLIDO.
- Una limitación declarada impide generar una sesión automática.
- Un entrenamiento completado en las últimas 24 horas bloquea otra propuesta de carga y muestra un consejo de recuperación.
- Un registro opcional de sueño inferior a seis horas también bloquea la propuesta de carga; si el permiso o el dato no están disponibles, el Coach sigue funcionando con el resto del contexto.
- Los tests de regresión cubren fechas inválidas/futuras, sesiones recientes, mediciones de fuerza, sueño opcional y límites de las propuestas.
- Aceptar una propuesta crea un plan nuevo sin modificar los planes existentes.

La orientación local es conservadora y no equivale a una evaluación médica. El usuario conserva el control de aceptar o no una propuesta.

## Arquitectura obligatoria

1. La APK se comunica únicamente con un endpoint HTTPS propio de SOLIDO.
2. El servidor autentica la instalación/sesión, limita frecuencia y tamaño de petición y valida todos los campos.
3. La clave del proveedor de IA vive exclusivamente como secreto del servidor. Nunca se incluye en HTML, JavaScript, recursos Android, repositorio ni APK.
4. El servidor llama al proveedor de IA y devuelve una respuesta JSON estructurada.
5. La aplicación valida la respuesta contra el catálogo local de ejercicios. La IA no puede ejecutar código, editar almacenamiento ni cambiar planes.
6. Una propuesta solo se incorpora a los planes cuando el usuario pulsa explícitamente aceptar. Se crea un plan nuevo; no se sobrescribe ninguno.

## Endpoint inicial

`POST /v1/coach/recommendation`

Cabeceras:
- `Authorization: Bearer <token de sesión de corta duración>`
- `Content-Type: application/json`

Petición inicial mínima:
```json
{
  "schemaVersion": 1,
  "personality": "cercano",
  "goal": "Fuerza general",
  "experience": "intermedio",
  "daysAvailable": 3,
  "equipment": "gimnasio",
  "trainingSummary": {
    "sessionsLast30Days": 6,
    "minutesLast30Days": 240,
    "forceRecords": 3,
    "bestForceKg": 28.4
  },
  "availableExerciseIds": [2, 5, 9, 11, 17, 19, 21, 23, 28, 29, 31, 32]
}
```

La petición no incluye nombre, correo, fecha de nacimiento, altura, peso, diagnósticos, lesiones, texto libre de limitaciones, datos de salud de Health Connect ni localización. La versión inicial debe trabajar sin esos datos. Si en el futuro se plantea enviar una categoría adicional, debe existir un consentimiento separado, específico, revocable y previo.

Respuesta:
```json
{
  "schemaVersion": 1,
  "message": "Vamos a trabajar la regularidad con una sesión moderada.",
  "session": {
    "name": "SOLIDO COACH · Fuerza general",
    "category": "Fuerza",
    "items": [
      { "id": 19, "sets": 1, "reps": 1, "work": 300, "rest": 0 },
      { "id": 5, "sets": 2, "reps": 3, "work": 5, "rest": 120 }
    ]
  }
}
```

La respuesta puede omitir `session`. El cliente debe rechazarla si contiene IDs que no existen en el catálogo local, valores fuera de límites, categorías no admitidas o demasiados ejercicios. El servidor nunca devuelve HTML ejecutable ni instrucciones para modificar la app.

## Privacidad y seguridad

- No enviar datos hasta que el usuario vea un aviso claro y otorgue consentimiento específico para la función online.
- El consentimiento debe poder revocarse desde SOLIDO COACH; al revocarlo, se vuelve al modo local y no se realizan nuevas peticiones.
- No usar los datos para publicidad, perfiles comerciales ni entrenamiento del proveedor.
- No registrar cuerpos de petición ni respuestas con datos personales en logs. Aplicar retención mínima y documentada.
- TLS obligatorio; sin HTTP en claro. Secretos en el gestor de secretos del servidor.
- Validación de esquema, límites de tamaño, rate limiting, protección contra abuso y respuestas de error sin información sensible.
- Preparar aviso de privacidad y base legal RGPD antes de activar el servicio para usuarios.
- La IA ofrece orientación deportiva general, no diagnostica, trata ni rehabilita lesiones. Ante dolor, lesión o síntomas, no debe proponer cargas y debe recomendar valoración profesional.

## Decisiones pendientes antes de activar producción

- Elegir proveedor y región de procesamiento compatible con RGPD.
- Elegir alojamiento del backend y configurar dominio HTTPS.
- Definir autenticación de usuarios/dispositivos, límites de uso y presupuesto.
- Publicar aviso de privacidad, retención y procedimiento de borrado.
- Ejecutar pruebas de seguridad, validación de respuestas y pruebas de carga.

Hasta completar estos puntos, la función online debe permanecer desactivada. No se debe añadir ninguna clave de API a la APK.
