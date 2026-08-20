# LabScan

LabScan es una herramienta web para digitalizar resultados de laboratorio impresos y transferir el texto procesado desde un teléfono a una sesión abierta en PC.

## Uso

1. Abre `https://rourog.github.io/labscan/` en la PC.
2. Escanea el QR con el teléfono y confirma que el código de vínculo coincida en ambas pantallas.
3. Toma una fotografía o selecciona una imagen.
4. Pulsa **Analizar datos**.
5. Revisa el resultado recibido en la PC y pulsa **Copiar**.

## Formato de salida

En escritorio se puede cambiar la presentación sin repetir el escaneo:

- Vista reducida o expandida.
- Abreviaturas o nombres completos.
- Conversión a mayúsculas.

Las unidades se conservan en todos los modos.

## Despliegue

El proyecto está preparado para GitHub Pages y utiliza Firebase Authentication y Realtime Database para la vinculación temporal entre dispositivos.

## Aviso

El reconocimiento de texto puede cometer errores. Los resultados deben verificarse contra el documento original antes de incorporarlos a una nota médica o utilizarlos para decisiones clínicas.
