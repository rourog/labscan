# LabScan v8 — GitHub Pages + Firebase Realtime Database

Frontend: `https://rourog.github.io/labscan/`

## Flujo

1. La PC abre `https://rourog.github.io/labscan/`.
2. Firebase autentica la PC de forma anónima y crea una sesión aleatoria de 30 minutos.
3. La página genera un QR que apunta a `https://rourog.github.io/labscan/?session=...`.
4. El teléfono escanea el QR, abre la misma web y reclama esa sesión.
5. El teléfono realiza fotografía → OCR → parser local.
6. Solo el texto ya formateado se escribe en Realtime Database.
7. La PC escucha su sesión con `onValue()` y muestra el resultado inmediatamente.

Las fotografías NO se escriben en Firebase.

## Configuración Firebase requerida

### 1. Authentication

Firebase Console → Security → Authentication → Sign-in method → Anonymous → Enable.

### 2. Dominio autorizado

Firebase Console → Security → Authentication → Settings → Authorized domains.

Añadir, si no aparece:

`rourog.github.io`

### 3. Realtime Database Rules

Firebase Console → Realtime Database → Rules.

Sustituir todo por el contenido de `database.rules.json` y pulsar Publish.

Las reglas hacen lo siguiente:

- La raíz permanece cerrada.
- Crear una sesión exige Authentication.
- Solo el UID de la PC puede crear/borrar su sesión.
- El primer teléfono que conoce el ID aleatorio puede registrar `mobileUid`.
- Después de vincularse, un UID distinto no puede reemplazar al teléfono.
- Solo PC y teléfono vinculados pueden leer la sesión.
- El teléfono no puede cambiar `ownerUid`, `createdAt` ni `expiresAt`.
- Las sesiones solo son legibles/escribibles hasta su vencimiento.
- No se permiten campos arbitrarios.

## Publicar en GitHub Pages

Subir el contenido de esta carpeta a la raíz del repositorio `rourog/labscan` y dejar GitHub Pages publicando esa rama/carpeta.

No necesitas Firebase Hosting, npm ni un proceso de build.

## Prueba mínima

1. Abre la URL en PC.
2. Debe aparecer un QR y `Escanea el QR con el teléfono`.
3. Escanea el QR.
4. En PC debe cambiar a `Teléfono vinculado`.
5. En móvil toma/sube una hoja y pulsa `Analizar datos`.
6. Al terminar debe decir `Enviado al PC`.
7. La salida debe aparecer en el textarea de la PC.

## Si falla

- `La autenticación anónima no está habilitada`: activar Anonymous.
- `Este dominio no está autorizado`: añadir `rourog.github.io` a Authorized domains.
- `Firebase rechazó el acceso`: publicar `database.rules.json` en Realtime Database Rules.
- El QR abre una versión anterior: hacer recarga forzada / limpiar caché de GitHub Pages.
