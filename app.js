(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const imageInput = $('imageInput');
  const previewCanvas = $('previewCanvas');
  const previewWrap = $('previewWrap');
  const scanButton = $('scanButton');
  const progressBox = $('progressBox');
  const progressBar = $('progressBar');
  const progressLabel = $('progressLabel');
  const progressValue = $('progressValue');
  const formattedOutput = $('formattedOutput');
  const rawOutput = $('rawOutput');
  const resultCard = $('resultCard');
  const resultSummary = $('resultSummary');
  const copyButton = $('copyButton');
  const preprocessToggle = $('preprocessToggle');
  const manualInput = $('manualInput');
  const parseManualButton = $('parseManualButton');
  const engineStatus = $('engineStatus');

  let sourceImage = null;
  let rotation = 0;
  let worker = null;

  if (window.Tesseract) {
    engineStatus.textContent = 'OCR disponible';
    engineStatus.classList.add('ready');
  } else {
    engineStatus.textContent = 'Error al cargar OCR';
  }

  function setProgress(status, progress = 0) {
    const pct = Math.max(0, Math.min(1, Number(progress) || 0));
    const labels = {
      'loading tesseract core': 'Cargando motor OCR…',
      'initializing tesseract': 'Inicializando OCR…',
      'loading language traineddata': 'Cargando idioma español…',
      'initializing api': 'Preparando reconocimiento…',
      'recognizing text': 'Leyendo documento…',
    };
    progressLabel.textContent = labels[status] || status || 'Procesando…';
    progressBar.style.width = `${Math.round(pct * 100)}%`;
    progressValue.textContent = `${Math.round(pct * 100)}%`;
  }

  async function getWorker() {
    if (worker) return worker;
    if (!window.Tesseract) throw new Error('Tesseract.js no está disponible. Revisa la conexión a internet.');

    worker = await Tesseract.createWorker('spa', 1, {
      logger: m => setProgress(m.status, m.progress),
    });
    return worker;
  }

  async function fileToImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return img;
    } finally {
      // Se revoca después de que decode terminó; la imagen ya está decodificada en memoria.
      URL.revokeObjectURL(url);
    }
  }

  function drawPreview() {
    if (!sourceImage) return;
    const maxSide = 2200;
    const rotated = rotation % 180 !== 0;
    const srcW = sourceImage.naturalWidth;
    const srcH = sourceImage.naturalHeight;
    const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));

    previewCanvas.width = rotated ? h : w;
    previewCanvas.height = rotated ? w : h;
    const ctx = previewCanvas.getContext('2d', { willReadFrequently: true });
    ctx.save();
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    ctx.translate(previewCanvas.width / 2, previewCanvas.height / 2);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.drawImage(sourceImage, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function buildOCRCanvas() {
    const src = previewCanvas;
    const canvas = document.createElement('canvas');
    canvas.width = src.width;
    canvas.height = src.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0);

    if (!preprocessToggle.checked) return canvas;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;

    // Contraste moderado: evita destruir caracteres finos de impresoras térmicas.
    const contrast = 1.38;
    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      const adjusted = Math.max(0, Math.min(255, (gray - 128) * contrast + 128));
      d[i] = d[i + 1] = d[i + 2] = adjusted;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  function presentText(rawText) {
    const normalized = LabParser.normalizeOCR(rawText);
    const parsed = LabParser.parseLabResults(normalized);
    const formatted = LabParser.formatForClipboard(parsed);
    const count = LabParser.countResults(parsed);

    rawOutput.value = normalized;
    formattedOutput.value = formatted || 'No se detectaron laboratorios con el formato conocido.';
    resultSummary.textContent = count
      ? `${count} resultados reconocidos y formateados.`
      : 'OCR completado, pero el parser no reconoció resultados.';
    resultCard.classList.remove('is-hidden');
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  imageInput.addEventListener('change', async () => {
    const file = imageInput.files?.[0];
    if (!file) return;

    try {
      sourceImage = await fileToImage(file);
      rotation = 0;
      drawPreview();
      previewWrap.classList.remove('is-hidden');
      scanButton.disabled = false;
      resultCard.classList.add('is-hidden');
    } catch (err) {
      alert(`No se pudo abrir la imagen: ${err.message}`);
    }
  });

  $('rotateLeft').addEventListener('click', () => {
    rotation = (rotation - 90 + 360) % 360;
    drawPreview();
  });

  $('rotateRight').addEventListener('click', () => {
    rotation = (rotation + 90) % 360;
    drawPreview();
  });

  scanButton.addEventListener('click', async () => {
    if (!sourceImage) return;
    scanButton.disabled = true;
    progressBox.classList.remove('is-hidden');
    setProgress('Preparando imagen…', .02);

    try {
      const ocrCanvas = buildOCRCanvas();
      const ocrWorker = await getWorker();
      const result = await ocrWorker.recognize(ocrCanvas, { rotateAuto: true });
      setProgress('Completado', 1);
      presentText(result.data.text || '');
    } catch (err) {
      console.error(err);
      setProgress('Error', 0);
      alert(`No se pudo completar el OCR: ${err.message}`);
    } finally {
      scanButton.disabled = false;
    }
  });

  copyButton.addEventListener('click', async () => {
    const text = formattedOutput.value.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      const before = copyButton.textContent;
      copyButton.textContent = 'Copiado';
      setTimeout(() => { copyButton.textContent = before; }, 1200);
    } catch {
      formattedOutput.focus();
      formattedOutput.select();
      document.execCommand('copy');
    }
  });

  parseManualButton.addEventListener('click', () => {
    if (!manualInput.value.trim()) return;
    presentText(manualInput.value);
  });

  window.addEventListener('pagehide', () => {
    if (worker) {
      worker.terminate();
      worker = null;
    }
  });
})();
