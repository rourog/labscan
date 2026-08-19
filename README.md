# LabScan MVP

Web estática para fotografiar o subir hojas de laboratorio desde el móvil, extraer texto mediante OCR y formatearlo con la lógica del extractor de laboratorios usado en ECI.

## Interfaz

La interfaz se redujo al flujo principal:

1. **Tomar foto** — abre la cámara trasera en dispositivos compatibles y agrega una imagen al lote.
2. **Subir un archivo** — permite seleccionar una o varias imágenes y agregarlas al mismo lote.
3. **Copiar y dar formato** — muestra un contador con el número de imágenes pendientes, ejecuta OCR sobre todas, interpreta los laboratorios, presenta el texto formateado y trata de copiarlo al portapapeles.

El cuadro de texto del resultado permanece oculto hasta que se procesa el lote.

## GitHub Pages

No requiere Node, compilación ni backend. Copia estos archivos a un repositorio y habilita GitHub Pages desde la rama principal.

## Archivos

- `index.html`: interfaz.
- `styles.css`: diseño móvil.
- `app.js`: captura/subida, cola de imágenes, OCR y portapapeles.
- `lab-parser.js`: parser/normalizador de laboratorios.

## Privacidad

Las imágenes se procesan en el navegador. Esta versión no implementa un servidor propio ni persiste las fotografías.

## Nota

Tesseract.js se carga desde CDN, por lo que la primera carga necesita acceso a internet. El OCR real debe validarse con los formatos de laboratorio usados en producción.
