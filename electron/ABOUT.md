# Bienvenida y Acerca de

El contenido se edita en `electron/about-content.json` y se incluye en los paquetes de Windows.

- `heading`, `appName`, `description`, `contactHeading`, `location`: textos que aparecen en la ventana.
- `links`: contactos con un `id` único, `label`, `text` y `url` HTTPS.
- `supportMessage`: invitación a contribuir voluntariamente.
- `supportUrl`: enlace HTTPS del perfil de aportes del desarrollador. Mientras esté vacío, el botón está deshabilitado. Al agregarlo, queda habilitado automáticamente después de reiniciar la app.

La versión se toma de la aplicación, sin duplicarla en este archivo. Los enlaces se abren en el navegador predeterminado.

La bienvenida aparece después de iniciar el servidor desde Electron. «No volver a mostrar» se guarda por usuario de Windows en `interface-preferences.json`, dentro de la carpeta de datos de la aplicación. Desde Ayuda → Acerca de se puede volver a abrir la ventana y desmarcar la opción para recuperar la bienvenida. El arranque `npm run start:web` no abre ventanas de escritorio.
