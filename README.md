# Holyrics Web Control 3.0.0

Nueva versión para controlar Holyrics desde el navegador y mantener una aplicación local de Windows para la configuración y aprobación de dispositivos. Esta versión 3.0.0 en Node.js y Electron sucede a la versión 2.4.1 en Python.

## Iniciar en modo desarrollo

1. Instala Node.js 24 LTS (o una versión compatible, como 22.12 o posterior).
2. Desde esta carpeta, ejecuta `npm ci` para instalar las versiones del archivo de dependencias.
3. Ejecuta `npm start` para abrir la ventana de escritorio y el servidor web.
4. En **Holyrics y servidor**, configura la IP, el puerto API y el token de Holyrics. Usa **Probar conexión** y luego guarda.
5. En otro equipo de la red, abre la dirección LAN mostrada en la ventana de escritorio. Escribe un nombre para el dispositivo. Acepta la solicitud desde **Acceso remoto** en Windows.

La página local de configuración está en `http://localhost:5000/desktop`. También se puede iniciar solo el servidor con `npm run start:web` y abrir esa URL desde el mismo equipo.

## Páginas

- `/` — inicio con enlaces a las funciones.
- `/ppt` — panel sencillo con botones anterior/siguiente y una transmisión de la diapositiva actual; se puede añadir la transmisión de la siguiente desde los ajustes de escritorio.
- `/biblia` — selector de libros, capítulos y versículos basado en los datos de la versión anterior.
- `/letras` — buscador fijo, vista previa y proyección de canciones, con miniaturas de sus temas y un selector para las canciones sin tema asignado.
- `/playlists` — lista temporal de medios y listas de eventos/servicios programados en el mes actual.
- `/medios` — reproductor fijo y plegable con controles de reproducción, repetición, aleatorio, pantalla completa y volumen; bibliotecas de imágenes, videos, audio, archivos y textos.
- `/chat` — acceso al chat de Holyrics, usando la IP y el puerto HTML del equipo seleccionado.

## Configuración y datos

En el modo escritorio, la configuración y la lista de dispositivos autorizados se guardan en la carpeta de datos de usuario de Windows. En modo `start:web`, se guardan en `data/` dentro del proyecto. Los tokens de Holyrics no se envían al navegador.

El botón **Importar ajustes de la versión anterior** acepta el `config.json` existente y migra nombres de equipos, IP, puerto, token, puerto web, contraseña y modo de proyección.

En **Control de diapositivas y OBS**, elige la transmisión para la diapositiva actual y, si quieres, otra para la siguiente. Las opciones son **Imagen**, **HTML 1**, **HTML 2** y **HTML 3**. El puerto HTML se guarda por equipo, es 80 de forma predeterminada y también se usa para el chat.

Los dispositivos autorizados se conservan hasta revocarlos desde la aplicación de Windows. La ventana de escritorio puede ocultarse a la bandeja; el servidor sigue funcionando hasta salir de la aplicación.

En **Acceso remoto**, puedes elegir las páginas permitidas para cada dispositivo y usar **Solo Presentación** para un orador. Los permisos se comprueban en el servidor, tanto para las páginas como para sus acciones. El acceso directo al servidor propio de Holyrics se administra por separado.

## Inicio con Windows y bandeja

En **Holyrics y servidor → Inicio de la aplicación**:

- **Iniciar la app con Windows**: registra el ejecutable para iniciar con la sesión de tu usuario. Disponible en el ejecutable instalado o portable; no se registra el entorno de desarrollo de `npm start`.
- **Iniciar minimizado a la bandeja del sistema**: inicia el servidor sin abrir la ventana de configuración ni la bienvenida. También funciona en desarrollo.
- Pulsa **Guardar opciones de inicio** para aplicar las preferencias. Ambas opciones comienzan desactivadas.

Para abrir la configuración, haz doble clic en el icono de la bandeja o usa su menú. Abrir de nuevo el ejecutable recupera la instancia existente. Para cerrar realmente la app, elige **Salir**.

Si usas el portable con inicio automático, guárdalo en una ubicación fija antes de activarlo. Si cambias de ubicación, vuelve a configurar esa opción desde el nuevo ejecutable.


## Estado de esta base

Esta es una base funcional de la versión 3.0.0. La creación y edición de letras/temas, la incorporación de nuevos medios y algunas funciones ampliadas de listas y controles todavía requieren su siguiente iteración. `CreateItem` y `EditItem` además requieren un plan de Holyrics y permisos avanzados.

En Letras, el tema general se recuerda en cada navegador y por equipo de Holyrics. Se aplica al proyectar canciones sin un tema propio. Si aún no se eligió uno y no hay presentación activa, el selector permite elegirlo; también se puede proyectar normalmente y tomar el tema que Holyrics use para esa canción. Los temas asignados a canciones y a diapositivas se conservan en Holyrics.
