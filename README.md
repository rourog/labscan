# LabScan by Rourog — v5

MVP estático para GitHub Pages.

## Flujo

1. Tomar una foto o subir una imagen.
2. `Analizar datos`.
3. El resultado formateado aparece en el cuadro de texto.

## Cambios de v5

- OCR con salida TSV para conservar la posición de las palabras.
- Reconstrucción de las filas `ESTUDIO | RESULTADO | REFERENCIA` antes de interpretar los datos.
- El parser prioriza el valor asociado a la unidad del estudio en vez del primer número encontrado.
- Se conservan puntos decimales y se muestran unidades.
- Compatibilidad ampliada con RASOMA y el formato previo del Hospital Regional.
- Diferenciación de recuentos absolutos y porcentajes en la biometría.
- Correcciones para `CLORURO`, AST/TGO, ALT/TGP, Grupo/Rh y variantes frecuentes de OCR.
- Se eliminó el aumento artificial de contraste para no perder puntos decimales y caracteres finos.
- Las imágenes de baja resolución se amplían antes del OCR.
- Los recursos locales usan `?v=5` para evitar que GitHub Pages reutilice JavaScript antiguo desde caché.

## Archivos

- `index.html`: interfaz.
- `styles.css`: interfaz minimalista.
- `app.js`: captura/subida, OCR y reconstrucción espacial de tablas.
- `lab-parser.js`: intérprete universal de laboratorios.

No requiere Node, build ni backend.
