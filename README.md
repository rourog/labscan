# LabScan

LabScan es una herramienta web para digitalizar resultados de laboratorio impresos y transferir el texto procesado desde un teléfono a una sesión abierta en PC.

## Uso

1. Abre `https://rourog.github.io/labscan/` en la PC.
2. Escanea el QR con el teléfono y confirma que el código de vínculo coincida en ambas pantallas.
3. Toma una fotografía o selecciona una imagen.
4. Pulsa **Analizar datos**.
5. Revisa el resultado recibido en la PC y pulsa **Copiar**.

La primera lectura en un dispositivo puede tardar más mientras se cargan los recursos de reconocimiento.

## Formato de salida

En escritorio se puede cambiar la presentación sin repetir el escaneo:

- Vista reducida o expandida.
- Abreviaturas o nombres completos.
- Conversión a mayúsculas.

Los valores y sus unidades se conservan al cambiar la presentación.

## Privacidad

El reconocimiento de la fotografía se realiza en el navegador. La imagen no se guarda en Firebase; la sesión sincroniza únicamente los datos procesados.

## Despliegue

El proyecto está preparado para GitHub Pages y utiliza Firebase Authentication y Realtime Database para la vinculación temporal entre dispositivos.

## Aviso

El reconocimiento de texto puede cometer errores. Los resultados deben verificarse contra el documento original antes de incorporarlos a una nota médica o utilizarlos para decisiones clínicas.
