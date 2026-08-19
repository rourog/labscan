# LabScan by Rourog — v4

MVP estático para GitHub Pages.

## Flujo

1. **Tomar una foto** o **Subir archivo**.
2. Se pueden acumular varias imágenes del mismo laboratorio.
3. Pulsar **Analizar datos**.
4. Tesseract.js ejecuta OCR en el navegador.
5. El parser universal normaliza los nombres y presenta los datos procesados.

## Cambios v4

- El parser ya no depende de que el documento use los encabezados del Hospital Regional.
- Añade variantes observadas en **Laboratorios RASOMA**.
- Reconoce, entre otras, estas equivalencias:
  - `CLORURO` → `Cl`
  - `ASPARTATO AMINOTRANSFERASA TGO` / `AST` → `TGO`
  - `ALANINA AMINOTRANSFERASA TGP` / `ALT` → `TGP`
  - `GRUPO SANGUÍNEO Y FACTOR Rh` → `Grupo/RH`
  - `VOLUMEN PLAQUETARIO MEDIO` → `VPM`
- Diferencia `NEUTRÓFILOS %` de `NEUTRÓFILOS #` (y equivalentes de linfocitos/monocitos/eosinófilos/basófilos).
- Los encabezados sirven como contexto, pero los analitos se buscan globalmente.
- El bloque de EGO se aísla del resto para evitar confundir glucosa, hemoglobina, eritrocitos o leucocitos urinarios con sangre.

## Publicación

Sube estos archivos al mismo directorio del repositorio y activa GitHub Pages:

- `index.html`
- `styles.css`
- `app.js`
- `lab-parser.js`

No requiere build, Node ni backend.
