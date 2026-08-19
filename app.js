(() => {
  'use strict';

  const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';

  const cameraButton = document.getElementById('cameraButton');
  const uploadButton = document.getElementById('uploadButton');
  const analyzeButton = document.getElementById('analyzeButton');
  const cameraInput = document.getElementById('cameraInput');
  const uploadInput = document.getElementById('uploadInput');
  const output = document.getElementById('output');

  let files = [];
  let worker = null;
  let tesseractLoader = null;

  function setAnalyzeState() {
    analyzeButton.disabled = files.length === 0;
    analyzeButton.textContent = files.length > 1
      ? `Analizar datos · ${files.length}`
      : 'Analizar datos';
  }

  function openFilePicker(input) {
    try {
      if (typeof input.showPicker === 'function') {
        input.showPicker();
      } else {
        input.click();
      }
    } catch (_) {
      input.click();
    }
  }

  function addFiles(fileList) {
    const selected = Array.from(fileList || []).filter(file => file.type.startsWith('image/'));
    if (!selected.length) return;

    files.push(...selected);
    output.value = '';
    setAnalyzeState();

    // Permite elegir otra vez la misma imagen o tomar varias fotos consecutivas.
    cameraInput.value = '';
    uploadInput.value = '';
  }

  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (tesseractLoader) return tesseractLoader;

    tesseractLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = TESSERACT_URL;
      script.async = true;
      script.onload = () => window.Tesseract
        ? resolve(window.Tesseract)
        : reject(new Error('El motor OCR no se inició correctamente.'));
      script.onerror = () => reject(new Error('No se pudo descargar el motor OCR. Verifica la conexión a internet.'));
      document.head.appendChild(script);
    }).catch(error => {
      tesseractLoader = null;
      throw error;
    });

    return tesseractLoader;
  }

  async function getWorker(onProgress) {
    if (worker) return worker;

    const Tesseract = await loadTesseract();
    worker = await Tesseract.createWorker('spa', 1, {
      logger: message => {
        if (message.status === 'recognizing text' && Number.isFinite(message.progress)) {
          onProgress(message.progress);
        }
      }
    });

    return worker;
  }

  async function imageToCanvas(file) {
    const objectUrl = URL.createObjectURL(file);

    try {
      const image = new Image();
      image.decoding = 'async';
      image.src = objectUrl;

      if (typeof image.decode === 'function') {
        await image.decode();
      } else {
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(new Error('No se pudo abrir la imagen.'));
        });
      }

      const maxDimension = 2400;
      const factor = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * factor));
      const height = Math.max(1, Math.round(image.naturalHeight * factor));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('El navegador no permitió procesar la imagen.');

      context.drawImage(image, 0, 0, width, height);

      // Preprocesamiento discreto: gris + contraste. No altera el archivo original.
      const imageData = context.getImageData(0, 0, width, height);
      const pixels = imageData.data;
      const contrast = 1.35;

      for (let i = 0; i < pixels.length; i += 4) {
        const gray = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
        const value = Math.max(0, Math.min(255, (gray - 128) * contrast + 128));
        pixels[i] = value;
        pixels[i + 1] = value;
        pixels[i + 2] = value;
      }

      context.putImageData(imageData, 0, 0);
      return canvas;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function formatOCR(rawText) {
    if (!window.LabParser) {
      throw new Error('No se cargó el intérprete de laboratorios.');
    }

    const normalized = LabParser.normalizeOCR(rawText);
    const parsed = LabParser.parseLabResults(normalized);
    return LabParser.formatForClipboard(parsed);
  }

  cameraButton.addEventListener('click', () => openFilePicker(cameraInput));
  uploadButton.addEventListener('click', () => openFilePicker(uploadInput));

  cameraInput.addEventListener('change', event => addFiles(event.target.files));
  uploadInput.addEventListener('change', event => addFiles(event.target.files));

  analyzeButton.addEventListener('click', async () => {
    if (!files.length) return;

    const batch = [...files];
    const total = batch.length;

    cameraButton.disabled = true;
    uploadButton.disabled = true;
    analyzeButton.disabled = true;
    output.value = '';

    try {
      const ocrWorker = await getWorker(progress => {
        const percent = Math.round(progress * 100);
        analyzeButton.textContent = `Analizando · ${percent}%`;
      });

      const pages = [];

      for (let index = 0; index < total; index++) {
        analyzeButton.textContent = total > 1
          ? `Analizando ${index + 1}/${total}`
          : 'Analizando';

        const canvas = await imageToCanvas(batch[index]);
        const result = await ocrWorker.recognize(canvas, { rotateAuto: true });
        pages.push(result?.data?.text || '');
      }

      const formatted = formatOCR(pages.join('\n\n'));
      output.value = formatted || 'No se reconocieron datos de laboratorio con el formato conocido.';

      files = [];
    } catch (error) {
      console.error(error);
      output.value = `Error: ${error.message}`;
    } finally {
      cameraButton.disabled = false;
      uploadButton.disabled = false;
      setAnalyzeState();
    }
  });

  window.addEventListener('pagehide', () => {
    if (worker) {
      worker.terminate();
      worker = null;
    }
  });

  setAnalyzeState();
})();
