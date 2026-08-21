# LabScan

LabScan es una herramienta web para digitalizar resultados de laboratorio impresos desde un teléfono y transferir el texto procesado a una sesión abierta en PC.

## Uso

1. Abre `https://rourog.github.io/labscan/` en la PC.
2. Escanea el QR y verifica que el código de vínculo coincida en ambos dispositivos.
3. Toma una fotografía o selecciona una imagen.
4. Pulsa **Analizar datos**.
5. Revisa los resultados recibidos en la PC y pulsa **Copiar**.

Durante el análisis, el propio botón muestra la etapa activa y el progreso global: carga de imagen, preparación del OCR, extracción de texto, interpretación, formato y envío.

## Formato

En escritorio se puede alternar entre vista reducida o expandida, abreviaturas o nombres completos y mayúsculas. Los valores y unidades se conservan al cambiar la presentación.

## Despliegue

El proyecto está preparado para GitHub Pages y utiliza Firebase Authentication y Realtime Database para la vinculación temporal entre dispositivos.

## Aviso

El reconocimiento automático puede cometer errores. Los resultados deben verificarse contra el documento original antes de incorporarlos a una nota médica o utilizarlos para decisiones clínicas.
