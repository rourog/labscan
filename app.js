(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const cameraButton = $('cameraButton');
  const uploadButton = $('uploadButton');
  const processButton = $('processButton');
  const processLabel = $('processLabel');
  const cameraInput = $('cameraInput');
  const fileInput = $('fileInput');
  const fileCount = $('fileCount');
  const progressBox = $('progressBox');
  const progressBar = $('progressBar');
  const progressLabel = $('progressLabel');
  const progressValue = $('progressValue');
  const formattedOutput = $('formattedOutput');
  const resultSection = $('resultSection');
  const resultMeta = $('resultMeta');
  const engineStatus = $('engineStatus');

  let queuedFiles = [];
  let worker = null;

  if (window.Tesseract) {
    engineStatus.classList.add('ready');
    engineStatus.title = 'OCR disponible';
    engineStatus.setAttribute('aria-label', 'OCR disponible');
  } else {
    engineStatus.title = 'No se pudo cargar el OCR';
    engineStatus.setAttribute('aria-label', 'No se pudo cargar el OCR');
  }

  function updateQueueUI() {
    const count = queuedFiles.length;
    fileCount.textContent = String(count);
    processButton.disabled = count === 0;
    processLabel.textContent = count === 1
      ? 'Copiar y dar formato'
      : 'Copiar y dar formato';
  }

  function addFiles(fileList) {
    const files = Array.from(fileList || []).filter(file => file.type.startsWith('image/'));
    if (!files.length) return;

    queuedFiles.push(...files);
    updateQueueUI();

    // Permite volver a seleccionar el mismo archivo o tomar otra foto.
    cameraInput.value = '';
    fileInput.value = '';
  }

  function setProgress(status, progress = 0, fileIndex = null, totalFiles = null) {
    const pct = Math.max(0, Math.min(1, Number(progress) || 0));
    const labels = {
      'loading tesseract core': 'Cargando motor OCR…',
      'initializing tesseract': 'Inicializando OCR…',
      'loading language traineddata': 'Cargando idioma español…',
      'initializing api': 'Preparando reconocimiento…',
      'recognizing text': 'Leyendo documento…',
    };

    let text = labels[status] || status || 'Procesando…';
    if (fileIndex !== null && totalFiles !== null && totalFiles > 1) {
      text = `${text} ${fileIndex}/${totalFiles}`;
    }

    progressLabel.textContent = text;
    progressBar.style.width = `${Math.round(pct * 100)}%`;
    progressValue.textContent = `${Math.round(pct * 100)}%`;
  }

  async function getWorker() {
    if (worker) return worker;
    if (!window.Tesseract) {
      throw new Error('Tesseract.js no está disponible. Revisa la conexión a internet.');
    }

    worker = await Tesseract.createWorker('spa', 1, {
      logger: m => setProgress(m.status, m.progress),
    });
    return worker;
  }

  async function fileToCanvas(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();

      const maxSide = 2400;
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const width = Math.max(1, Math.round(img.naturalWidth * scale));
      const height = Math.max(1, Math.round(img.naturalHeight * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, width, height);

      // Preprocesamiento automático: escala de grises + contraste moderado.
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      const contrast = 1.38;

      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        const adjusted = Math.max(0, Math.min(255, (gray - 128) * contrast + 128));
        data[i] = data[i + 1] = data[i + 2] = adjusted;
      }

      ctx.putImageData(imageData, 0, 0);
      return canvas;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function parseAndFormat(rawText) {
    const normalized = LabParser.normalizeOCR(rawText);
    const parsed = LabParser.parseLabResults(normalized);
    return {
      formatted: LabParser.formatForClipboard(parsed),
      count: LabParser.countResults(parsed),
    };
  }

  async function copyOutput() {
    const text = formattedOutput.value.trim();
    if (!text) return false;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        formattedOutput.focus();
        formattedOutput.select();
        document.execCommand('copy');
      }
      return true;
    } catch {
      formattedOutput.focus();
      formattedOutput.select();
      return false;
    }
  }

  cameraButton.addEventListener('click', () => cameraInput.click());
  uploadButton.addEventListener('click', () => fileInput.click());
  cameraInput.addEventListener('change', () => addFiles(cameraInput.files));
  fileInput.addEventListener('change', () => addFiles(fileInput.files));

  processButton.addEventListener('click', async () => {
    if (!queuedFiles.length) return;

    const filesToProcess = [...queuedFiles];
    processButton.disabled = true;
    cameraButton.disabled = true;
    uploadButton.disabled = true;
    processLabel.textContent = 'Procesando…';
    resultSection.classList.add('is-hidden');
    progressBox.classList.remove('is-hidden');
    setProgress('Preparando OCR…', 0);

    try {
      const ocrWorker = await getWorker();
      const rawPages = [];

      for (let i = 0; i < filesToProcess.length; i++) {
        const pageNumber = i + 1;
        setProgress('Preparando imagen…', i / filesToProcess.length, pageNumber, filesToProcess.length);
        const canvas = await fileToCanvas(filesToProcess[i]);

        const result = await ocrWorker.recognize(canvas, { rotateAuto: true });
        rawPages.push(result.data.text || '');

        const overall = pageNumber / filesToProcess.length;
        setProgress('Leyendo documento…', overall, pageNumber, filesToProcess.length);
      }

      const { formatted, count } = parseAndFormat(rawPages.join('\n\n'));
      formattedOutput.value = formatted || 'No se detectaron laboratorios con el formato conocido.';
      resultSection.classList.remove('is-hidden');

      let copied = false;
      if (formatted) copied = await copyOutput();

      resultMeta.textContent = count
        ? `${count} resultados formateados${copied ? ' · copiados al portapapeles' : ''}.`
        : 'OCR completado, pero no se reconocieron resultados.';

      // Después de procesar, la siguiente captura inicia un lote nuevo.
      queuedFiles = [];
      updateQueueUI();
      setProgress('Completado', 1);
    } catch (err) {
      console.error(err);
      resultSection.classList.remove('is-hidden');
      formattedOutput.value = `Error: ${err.message}`;
      resultMeta.textContent = 'No se pudo completar el OCR.';
      setProgress('Error', 0);
    } finally {
      cameraButton.disabled = false;
      uploadButton.disabled = false;
      processLabel.textContent = 'Copiar y dar formato';
      processButton.disabled = queuedFiles.length === 0;
      setTimeout(() => progressBox.classList.add('is-hidden'), 900);
    }
  });

  updateQueueUI();

  window.addEventListener('pagehide', () => {
    if (worker) {
      worker.terminate();
      worker = null;
    }
  });
})();
