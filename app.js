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

    // Mantiene mejor la separación de columnas y comunica una resolución
    // razonable al motor OCR. No limitamos caracteres: necesitamos letras,
    // unidades, signos y puntos decimales.
    await worker.setParameters({
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
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

      // El texto de una hoja completa queda pequeño en fotos de WhatsApp.
      // Tesseract mejora claramente con más resolución; por eso permitimos
      // ampliar la imagen hasta ~3000 px en su lado largo en lugar de reducirla.
      const longEdge = Math.max(image.naturalWidth, image.naturalHeight);
      const targetLongEdge = 3000;
      const factor = longEdge < targetLongEdge
        ? Math.min(2.2, targetLongEdge / longEdge)
        : Math.min(1, targetLongEdge / longEdge);

      const width = Math.max(1, Math.round(image.naturalWidth * factor));
      const height = Math.max(1, Math.round(image.naturalHeight * factor));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d', { willReadFrequently: false });
      if (!context) throw new Error('El navegador no permitió procesar la imagen.');

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, width, height);

      // v5: no aplicamos contraste artificial. En las pruebas reales ese paso
      // podía aclarar puntos decimales y caracteres finos (p.ej. 9.9 -> 9971).
      // Tesseract recibe la imagen ampliada conservando la información original.
      return canvas;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function tsvToVisualText(tsv) {
    if (!tsv || typeof tsv !== 'string') return '';
    const rows = tsv.split(/\r?\n/);
    if (rows.length < 2) return '';

    const words = [];
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i].trim()) continue;
      const cols = rows[i].split('\t');
      if (cols.length < 12 || Number(cols[0]) !== 5) continue;

      const text = cols.slice(11).join('\t').trim();
      if (!text) continue;

      const page = Number(cols[1]);
      const block = Number(cols[2]);
      const paragraph = Number(cols[3]);
      const line = Number(cols[4]);
      const left = Number(cols[6]);
      const top = Number(cols[7]);
      const width = Number(cols[8]);
      const height = Number(cols[9]);
      const conf = Number(cols[10]);
      if (![page, block, paragraph, line, left, top, width, height].every(Number.isFinite)) continue;
      if (Number.isFinite(conf) && conf < 0) continue;

      words.push({
        text, page, block, paragraph, line,
        key: `${page}:${block}:${paragraph}:${line}`,
        left, top, width, height,
        right: left + width,
        bottom: top + height,
        cy: top + height / 2,
      });
    }

    if (!words.length) return '';

    const typicalHeight = Math.max(8, median(words.map(word => word.height)));
    const mergeTolerance = Math.max(9, typicalHeight * 0.88);

    // Primero respetamos las líneas que Tesseract ya identificó. Esto es clave
    // en tablas inclinadas: GLUCOSA, 98 mg/dL y 70-100 pueden tener diferente Y,
    // pero Tesseract sabe que pertenecen a la misma línea lógica.
    const grouped = new Map();
    for (const word of words) {
      if (!grouped.has(word.key)) grouped.set(word.key, []);
      grouped.get(word.key).push(word);
    }

    const segments = [];
    for (const [key, segmentWords] of grouped) {
      segmentWords.sort((a, b) => a.left - b.left);
      segments.push({
        key,
        block: segmentWords[0].block,
        words: segmentWords,
        left: Math.min(...segmentWords.map(word => word.left)),
        right: Math.max(...segmentWords.map(word => word.right)),
        top: Math.min(...segmentWords.map(word => word.top)),
        bottom: Math.max(...segmentWords.map(word => word.bottom)),
        cy: segmentWords.reduce((sum, word) => sum + word.cy, 0) / segmentWords.length,
      });
    }

    segments.sort((a, b) => a.cy - b.cy || a.left - b.left);
    const visualRows = [];

    // Algunos formatos (RASOMA, por ejemplo) separan la columna ESTUDIO de la
    // columna RESULTADO en bloques OCR distintos. Fusionamos solo segmentos de
    // bloques/líneas diferentes que estén a la misma altura y no se superpongan.
    for (const segment of segments) {
      let best = null;
      let bestDistance = Infinity;

      for (let i = visualRows.length - 1; i >= 0 && i >= visualRows.length - 7; i--) {
        const row = visualRows[i];
        const distance = Math.abs(segment.cy - row.cy);
        if (distance > mergeTolerance || distance >= bestDistance) continue;
        if (row.segments.some(existing => existing.key === segment.key)) continue;

        const overlap = Math.max(0, Math.min(segment.right, row.right) - Math.max(segment.left, row.left));
        const minWidth = Math.max(1, Math.min(segment.right - segment.left, row.right - row.left));
        if (overlap / minWidth >= 0.45) continue;

        best = row;
        bestDistance = distance;
      }

      if (!best) {
        best = {
          segments: [],
          cy: segment.cy,
          top: segment.top,
          left: segment.left,
          right: segment.right,
        };
        visualRows.push(best);
      }

      best.segments.push(segment);
      best.cy = best.segments.reduce((sum, item) => sum + item.cy, 0) / best.segments.length;
      best.top = Math.min(best.top, segment.top);
      best.left = Math.min(best.left, segment.left);
      best.right = Math.max(best.right, segment.right);
    }

    visualRows.sort((a, b) => a.top - b.top);

    return visualRows.map(row => {
      const sorted = row.segments
        .flatMap(segment => segment.words)
        .sort((a, b) => a.left - b.left);

      let line = '';
      let previous = null;
      for (const word of sorted) {
        if (previous) {
          const gap = word.left - previous.right;
          line += gap > typicalHeight * 2.2 ? '   ' : ' ';
        }
        line += word.text;
        previous = word;
      }
      return line.trim();
    }).filter(Boolean).join('\n');
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
        const result = await ocrWorker.recognize(
          canvas,
          { rotateAuto: true },
          { text: true, tsv: true }
        );

        const rawText = result?.data?.text || '';
        const visualText = tsvToVisualText(result?.data?.tsv || '');
        pages.push(visualText || rawText);

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
