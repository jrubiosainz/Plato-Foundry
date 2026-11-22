# Seguridad en Plató · Plataformas 3D

- **Sin claves.** El recurso de Foundry se crea con `disableLocalAuth: true`. El servidor local pide tokens de Entra a tu sesión de Azure CLI (o azd) y usa tu sesión de GitHub Copilot (o la de `gh`). Nada de eso se guarda en el repositorio ni llega al navegador.
- **Solo local.** El servidor escucha en `127.0.0.1` y rechaza las peticiones a `/api` cuyo `Host` u `Origin` no sean los de su propia página, incluida la conexión de voz (WebSocket).
- **Código generado aislado.** Lo que escriben los modelos para inventar piezas nuevas se ejecuta en un Web Worker sin `fetch`, `XMLHttpRequest`, `WebSocket` ni `importScripts`, y nunca dentro de la página, así que no puede llamar a la API local. Del Worker solo vuelven piezas declarativas (formas, colores y posiciones).
- **Filtro de la demo.** Decision-1.1 puntúa cada orden y cada invento como apto o no para una demo pública; por debajo del 8 % la petición se bloquea y el panel lo indica.
- **Datos que salen de Microsoft.** Los modelos de fal (MiniMax H3 Max, LTX-2.5) se ejecutan en fal, fuera de las instalaciones de Microsoft: la toma, el fotograma y el texto de la escena se envían allí solo al pedir «hazlo real».
- **Lo que se guarda.** Las tomas y los vídeos generados quedan en `out/jobs/` en tu equipo; `config/local.json` contiene solo nombres de recursos y endpoints. Ambos están en `.gitignore`.

Si encuentras un problema de seguridad, avísame con un aviso privado en la pestaña **Security** del repositorio (*Report a vulnerability*) en lugar de abrir un issue público.
