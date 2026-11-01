# Recursos gráficos del Coach SOLIDO

Este directorio contiene las seis ilustraciones PNG del mismo entrenador, conservando el diseño aprobado.

- `coach_01_bienvenida.png` — bienvenida
- `coach_02_motivacion.png` — motivación
- `coach_03_consejos.png` — consejos
- `coach_04_felicitacion.png` — felicitación
- `coach_05_descanso.png` — descanso
- `coach_06_cierre.png` — cierre

Durante la reproducción de voz, la interfaz alterna varias poses con transiciones y movimiento suave. La selección de voz masculina depende de que el motor TTS instalado en Android exponga una voz española identificada explícitamente como masculina.

## Animaciones WEBM del entrenador

Se han añadido cinco clips verticales WEBM (VP9, 720 × 1280, 24 fps, aproximadamente 8 segundos cada uno). No contienen pista de audio. SOLIDO Coach los reproduce en secuencia mientras habla y vuelve a la ilustración PNG cuando termina la locución. La reproducción utiliza el encuadre completo con object-fit: contain y mantiene el audio del vídeo silenciado; la voz sigue siendo la voz TTS nativa de Android.
