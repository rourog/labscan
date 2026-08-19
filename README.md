# LabScan MVP

Web estática para fotografiar una hoja de laboratorio desde el móvil, extraer el texto con OCR y formatear los resultados con la lógica del extractor ECI/Tampermonkey.

## Flujo

1. Abrir la web desde el celular.
2. Pulsar **Tomar foto**.
3. Fotografiar la hoja completa.
4. Girar la imagen si hace falta.
5. Pulsar **Extraer y formatear**.
6. Revisar el resultado y copiarlo.

## Privacidad del MVP

- El OCR se ejecuta en el navegador con Tesseract.js.
- La imagen seleccionada se mantiene en memoria local del navegador.
- Este código no implementa backend, subida de archivos ni almacenamiento de fotografías.
- Tesseract.js y el modelo de idioma se descargan desde recursos externos al abrir/usar la web por primera vez.

## Publicar en GitHub Pages

No requiere build.

1. Crear un repositorio.
2. Subir `index.html`, `styles.css`, `app.js` y `lab-parser.js` a la raíz.
3. En **Settings → Pages**, seleccionar **Deploy from a branch**.
4. Elegir la rama principal y `/ (root)`.
5. Abrir la URL publicada desde el celular.

GitHub Pages entrega la web por HTTPS, que es conveniente para APIs del navegador y portapapeles.

## Archivos

- `index.html`: interfaz y carga de Tesseract.js.
- `styles.css`: interfaz responsive móvil/escritorio.
- `app.js`: captura, preprocesamiento de imagen, OCR y presentación.
- `lab-parser.js`: parser adaptado desde Copiar Labs 3.0.

## Notas del parser

La versión original del extractor trabajaba con texto extraído de PDF. Esta variante conserva:

- orden de secciones;
- abreviaturas clínicas;
- separación de EGO respecto a sangre;
- búsqueda global de estudios que pueden quedar fuera de una sección.

Además añade tolerancia inicial a errores de OCR frecuentes y a resultados que aparecen en la línea siguiente a la etiqueta.

## Limitaciones actuales

- No corrige perspectiva del documento.
- No recorta automáticamente bordes de la hoja.
- No hay todavía enlace PC ↔ celular por QR.
- OCR sobre fotos borrosas, sombras o tablas complejas puede confundir caracteres.
- El parser necesitará ajustes conforme aparezcan errores reales del OCR.

## Siguiente etapa recomendada

Probar con 10–20 fotografías reales y guardar únicamente ejemplos desidentificados de errores de reconocimiento. Con esos fallos se ajustan preprocesamiento y alias antes de construir el emparejamiento QR.
