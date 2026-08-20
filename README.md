# LabScan

LabScan es una aplicación web para digitalizar resultados de laboratorio impresos y transferir el texto procesado a una sesión vinculada en otra pantalla.

## Uso

1. Abre `https://rourog.github.io/labscan/` en la PC.
2. Escanea el código QR con el teléfono y verifica que ambas pantallas muestren el mismo código.
3. Toma una fotografía o selecciona una imagen del laboratorio.
4. Pulsa **Analizar datos**.
5. Revisa el resultado en la PC y utiliza **Copiar** para llevarlo a la nota correspondiente.

## Privacidad

Las imágenes se procesan en el navegador. La sincronización entre dispositivos utiliza una sesión temporal y transmite el texto procesado, no la fotografía original.

## Despliegue

El frontend está preparado para GitHub Pages. Requiere Firebase Authentication y Realtime Database configurados para el proyecto, junto con las reglas incluidas en `database.rules.json`.

No requiere Firebase Hosting ni un proceso de compilación.

## Aviso

El reconocimiento óptico puede cometer errores. Los resultados deben verificarse contra el documento original antes de incorporarlos a una nota médica o utilizarlos para decisiones clínicas.
