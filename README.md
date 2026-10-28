# SOLIDO CLIMBING TRAINING — prototipo Android 0.1.0

Primera versión funcional de la app de entrenamiento de escalada, en español y con estética oscura y acentos verde lima.

## Incluye
- Inicio y estadísticas locales.
- Plan orientativo de fuerza general de 45 minutos.
- Biblioteca de ejercicios con ilustraciones emoji, categorías e instrucciones.
- Temporizador configurable, pausa, reinicio y vibración al terminar cuando el dispositivo lo permite.
- Registro local de sesiones y preferencias de nivel/objetivo.
- Navegación Inicio, Planes, Ejercicios, Progreso y Perfil.
- Funciona sin conexión; los datos se guardan en el almacenamiento local del WebView.

## Abrir en Android Studio
1. Instala Android Studio y un JDK compatible (JDK 17 recomendado).
2. Abre la carpeta `solido_climbing_training` como proyecto.
3. Espera a que Gradle sincronice y permite que descargue el Android Gradle Plugin/dependencias.
4. Ejecuta en un emulador o móvil Android con depuración USB activada.

El proyecto necesita conexión a Internet la primera vez para descargar las herramientas de compilación. No se ha generado un APK en este entorno porque no hay Android SDK/Gradle instalado aquí.

## Probar sin Android Studio
Abre `app/src/main/assets/index.html` en un navegador moderno. Para probar almacenamiento persistente, es mejor abrirlo mediante un servidor local o ejecutarlo dentro de la app Android.

## Aviso de entrenamiento
Los planes son ejemplos generales y no sustituyen una valoración individual. Las suspensiones en regleta son solo para escaladores con experiencia; evita entrenar con dolor y aumenta la carga gradualmente.

## Generar el APK en la nube (sin instalar Android SDK en tu PC)

El proyecto incluye `.github/workflows/build-apk.yml`. Para usarlo:
1. Crea un repositorio en GitHub y sube el contenido de esta carpeta.
2. Abre la pestaña **Actions** del repositorio.
3. Selecciona **Build SOLIDO CLIMBING APK** y pulsa **Run workflow** (o espera a que termine tras subir a `main`).
4. Cuando el proceso termine correctamente, abre la ejecución y descarga el artefacto `SOLIDO-CLIMBING-TRAINING-debug-apk`.
5. Dentro del ZIP del artefacto estará `app-debug.apk`, que puedes copiar al móvil e instalar habilitando la instalación desde esa fuente si Android te lo pide.

Este flujo genera un APK de depuración para pruebas, no una versión firmada de publicación para Google Play.
