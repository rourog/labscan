(() => {
  'use strict';

  const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
  const RESULT_MARKER = '§RESULT§';

  const cameraButton = document.getElementById('cameraButton');
  const uploadButton = document.getElementById('uploadButton');
  const analyzeButton = document.getElementById('analyzeButton');
  const cameraInput = document.getElementById('cameraInput');
  const uploadInput = document.getElementById('uploadInput');
  const output = document.getElementById('output');

  let files = [];
  let worker = null;
  let tesseractLoader = null;
  let activeRecognitionProgress = null;

  const STRUCTURE_BANDS = 4;
  const RESULT_BANDS = 4;
  const STRUCTURE_PASS_WEIGHT = 1.0;
  const RESULT_PASS_WEIGHT = 0.45;

  function setAnalyzeState() {
    analyzeButton.disabled = files.length === 0;
    analyzeButton.textContent = files.length > 1
      ? `Analizar datos · ${files.length}`
      : 'Analizar datos';
  }

  function createAnalysisProgress(pageCount) {
    const pages = Math.max(1, pageCount);
    const weightPerPage =
      STRUCTURE_BANDS * STRUCTURE_PASS_WEIGHT +
      RESULT_BANDS * RESULT_PASS_WEIGHT;
    const totalWeight = pages * weightPerPage;
    let completedWeight = 0;
    let currentWeight = 0;
    let lastPercent = 0;

    const render = value => {
      const percent = Math.max(lastPercent, Math.min(100, Math.round(value)));
      lastPercent = percent;
      analyzeButton.textContent = `Analizando · ${percent}%`;
    };

    return {
      start() {
        render(0);
      },
      workerReady() {
        // Preparación del motor representa el primer 5% del flujo total.
        render(5);
      },
      beginPass(weight) {
        currentWeight = weight;
        activeRecognitionProgress = progress => {
          const fraction = (completedWeight + currentWeight * progress) / totalWeight;
          render(5 + fraction * 90);
        };
      },
      finishPass() {
        completedWeight += currentWeight;
        currentWeight = 0;
        activeRecognitionProgress = null;
        render(5 + (completedWeight / totalWeight) * 90);
      },
      parsing() {
        activeRecognitionProgress = null;
        render(97);
      },
      complete() {
        activeRecognitionProgress = null;
        render(100);
      },
      cancel() {
        activeRecognitionProgress = null;
      }
    };
  }

  function openFilePicker(input) {
    try {
      if (typeof input.showPicker === 'function') input.showPicker();
      else input.click();
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

  async function getWorker() {
    if (worker) return worker;
    const Tesseract = await loadTesseract();
    worker = await Tesseract.createWorker('spa', 1, {
      logger: message => {
        if (message.status === 'recognizing text' && Number.isFinite(message.progress)) {
          activeRecognitionProgress?.(Math.max(0, Math.min(1, message.progress)));
        }
      }
    });
    await worker.setParameters({
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
      tessedit_pageseg_mode: '11',
    });
    return worker;
  }

  async function fileToBaseCanvas(file) {
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.decoding = 'async';
      image.src = objectUrl;
      if (typeof image.decode === 'function') await image.decode();
      else await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('No se pudo abrir la imagen.'));
      });

      // Una sola página de 3000 px era inestable en algunos teléfonos.
      // Conservamos suficiente detalle, pero el OCR real se hará por franjas.
      const longEdge = Math.max(image.naturalWidth, image.naturalHeight);
      const targetLongEdge = 2800;
      const factor = longEdge < targetLongEdge
        ? Math.min(1.8, targetLongEdge / longEdge)
        : targetLongEdge / longEdge;

      const width = Math.max(1, Math.round(image.naturalWidth * factor));
      const height = Math.max(1, Math.round(image.naturalHeight * factor));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('El navegador no permitió procesar la imagen.');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, 0, 0, width, height);
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

  function normalizeToken(value) {
    return String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  }

  function parseTsvWords(tsv, transform = {}) {
    if (!tsv || typeof tsv !== 'string') return [];
    const rows = tsv.split(/\r?\n/);
    const words = [];
    const scaleX = transform.scaleX || 1;
    const scaleY = transform.scaleY || 1;
    const offsetX = transform.offsetX || 0;
    const offsetY = transform.offsetY || 0;
    const acceptYMin = transform.acceptYMin ?? -Infinity;
    const acceptYMax = transform.acceptYMax ?? Infinity;
    const keyPrefix = transform.keyPrefix || 'p';

    for (let i = 1; i < rows.length; i++) {
      if (!rows[i].trim()) continue;
      const cols = rows[i].split('\t');
      if (cols.length < 12 || Number(cols[0]) !== 5) continue;
      const text = cols.slice(11).join('\t').trim();
      if (!text) continue;

      const left0 = Number(cols[6]);
      const top0 = Number(cols[7]);
      const width0 = Number(cols[8]);
      const height0 = Number(cols[9]);
      const conf = Number(cols[10]);
      if (![left0, top0, width0, height0].every(Number.isFinite)) continue;
      if (Number.isFinite(conf) && conf < 0) continue;

      const left = offsetX + left0 / scaleX;
      const top = offsetY + top0 / scaleY;
      const width = width0 / scaleX;
      const height = height0 / scaleY;
      const cy = top + height / 2;
      if (cy < acceptYMin || cy >= acceptYMax) continue;

      words.push({
        text,
        key: `${keyPrefix}:${cols[2]}:${cols[3]}:${cols[4]}`,
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        cy,
        conf: Number.isFinite(conf) ? conf : 0,
      });
    }
    return words;
  }

  function wordsToVisualRows(words) {
    if (!words.length) return [];
    const typicalHeight = Math.max(5, median(words.map(word => word.height)));
    const mergeTolerance = Math.max(5, typicalHeight * 0.90);

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
        words: segmentWords,
        left: Math.min(...segmentWords.map(word => word.left)),
        right: Math.max(...segmentWords.map(word => word.right)),
        top: Math.min(...segmentWords.map(word => word.top)),
        bottom: Math.max(...segmentWords.map(word => word.bottom)),
        cy: segmentWords.reduce((sum, word) => sum + word.cy, 0) / segmentWords.length,
        conf: segmentWords.reduce((sum, word) => sum + word.conf, 0) / segmentWords.length,
      });
    }

    segments.sort((a, b) => a.cy - b.cy || a.left - b.left);
    const rows = [];

    for (const segment of segments) {
      let best = null;
      let bestDistance = Infinity;
      for (let i = rows.length - 1; i >= 0 && i >= rows.length - 9; i--) {
        const row = rows[i];
        const distance = Math.abs(segment.cy - row.cy);
        if (distance > mergeTolerance || distance >= bestDistance) continue;
        if (row.segments.some(existing => existing.key === segment.key)) continue;

        const overlap = Math.max(0, Math.min(segment.right, row.right) - Math.max(segment.left, row.left));
        const minWidth = Math.max(1, Math.min(segment.right - segment.left, row.right - row.left));
        if (overlap / minWidth >= 0.50) continue;
        best = row;
        bestDistance = distance;
      }

      if (!best) {
        best = {
          segments: [],
          cy: segment.cy,
          top: segment.top,
          bottom: segment.bottom,
          left: segment.left,
          right: segment.right,
        };
        rows.push(best);
      }

      best.segments.push(segment);
      best.cy = best.segments.reduce((sum, item) => sum + item.cy, 0) / best.segments.length;
      best.top = Math.min(best.top, segment.top);
      best.bottom = Math.max(best.bottom, segment.bottom);
      best.left = Math.min(best.left, segment.left);
      best.right = Math.max(best.right, segment.right);
    }

    rows.sort((a, b) => a.top - b.top);
    return rows.map(row => {
      const sorted = row.segments.flatMap(segment => segment.words).sort((a, b) => a.left - b.left);
      let text = '';
      let previous = null;
      for (const word of sorted) {
        if (previous) {
          const gap = word.left - previous.right;
          text += gap > typicalHeight * 2.0 ? '   ' : ' ';
        }
        text += word.text;
        previous = word;
      }
      return {
        text: text.trim(),
        cy: row.cy,
        top: row.top,
        bottom: row.bottom,
        left: row.left,
        right: row.right,
        height: Math.max(1, row.bottom - row.top),
        conf: sorted.reduce((sum, word) => sum + word.conf, 0) / Math.max(1, sorted.length),
      };
    }).filter(row => row.text);
  }

  function makeBandCanvas(baseCanvas, crop, targetWidth, enhance = false) {
    const scale = Math.max(1, Math.min(3.2, targetWidth / crop.width));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(crop.width * scale));
    canvas.height = Math.max(1, Math.round(crop.height * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: enhance });
    if (!ctx) throw new Error('No se pudo preparar una franja de la imagen.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      baseCanvas,
      crop.x, crop.y, crop.width, crop.height,
      0, 0, canvas.width, canvas.height
    );
    if (enhance) enhanceNumericCanvas(canvas);
    return { canvas, scale };
  }

  function enhanceNumericCanvas(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const { width, height } = canvas;
    const src = ctx.getImageData(0, 0, width, height);
    const data = src.data;
    const gray = new Uint8ClampedArray(width * height);

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      gray[p] = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    }

    // Unsharp mask ligero basado en box blur 3x3. En las hojas RASOMA recupera
    // puntos finos que Tesseract pierde en 91.2 / 9.9 sin inventar decimales.
    const amount = 2.25;
    const out = new Uint8ClampedArray(gray.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= width) continue;
            sum += gray[yy * width + xx];
            count++;
          }
        }
        const idx = y * width + x;
        const blur = sum / count;
        out[idx] = Math.max(0, Math.min(255, Math.round(gray[idx] + amount * (gray[idx] - blur))));
      }
    }

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      data[i] = data[i + 1] = data[i + 2] = out[p];
      data[i + 3] = 255;
    }
    ctx.putImageData(src, 0, 0);
  }

  function buildBandSpecs(height, count = 4, overlapRatio = 0.10) {
    const coreHeight = height / count;
    const margin = coreHeight * overlapRatio;
    const bands = [];
    for (let i = 0; i < count; i++) {
      const coreStart = Math.round(i * coreHeight);
      const coreEnd = Math.round(i === count - 1 ? height : (i + 1) * coreHeight);
      const cropStart = Math.max(0, Math.round(coreStart - margin));
      const cropEnd = Math.min(height, Math.round(coreEnd + margin));
      bands.push({ coreStart, coreEnd, cropStart, cropEnd });
    }
    return bands;
  }

  async function recognizeBanded(ocrWorker, baseCanvas, x, width, options = {}) {
    const bands = buildBandSpecs(baseCanvas.height, options.bandCount || 4, options.overlapRatio || 0.10);
    const allWords = [];

    for (let i = 0; i < bands.length; i++) {
      const band = bands[i];
      const crop = {
        x,
        y: band.cropStart,
        width,
        height: band.cropEnd - band.cropStart,
      };
      const prepared = makeBandCanvas(
        baseCanvas,
        crop,
        options.targetWidth || 2200,
        Boolean(options.enhance)
      );

      options.progress?.beginPass(options.passWeight || 1);
      let result;
      try {
        result = await ocrWorker.recognize(
          prepared.canvas,
          { rotateAuto: false },
          { text: true, tsv: true }
        );
      } finally {
        options.progress?.finishPass();
      }
      const words = parseTsvWords(result?.data?.tsv || '', {
        scaleX: prepared.scale,
        scaleY: prepared.scale,
        offsetX: crop.x,
        offsetY: crop.y,
        acceptYMin: band.coreStart,
        acceptYMax: band.coreEnd,
        keyPrefix: `${options.keyPrefix || 'b'}${i}`,
      });
      allWords.push(...words);

      // Libera backing store grande antes de pasar a la siguiente franja.
      prepared.canvas.width = 1;
      prepared.canvas.height = 1;
    }
    return allWords;
  }

  function findResultColumn(words, width) {
    const resultWords = words.filter(word => normalizeToken(word.text) === 'RESULTADO');
    const header = resultWords.sort((a, b) => a.top - b.top)[0];

    if (!header) {
      return {
        left: Math.round(width * 0.42),
        right: Math.round(width * 0.68),
        headerY: 0,
      };
    }

    const sameBand = word => Math.abs(word.cy - header.cy) < Math.max(20, header.height * 3.0);
    const ref = words
      .filter(word => sameBand(word) && word.left > header.right && ['VALOR', 'REFERENCIA'].includes(normalizeToken(word.text)))
      .sort((a, b) => a.left - b.left)[0];
    const study = words
      .filter(word => sameBand(word) && word.right < header.left && normalizeToken(word.text) === 'ESTUDIO')
      .sort((a, b) => b.right - a.right)[0];

    const cx = header.left + header.width / 2;
    let left;
    let right;

    if (study) left = Math.round(((study.left + study.width / 2) + cx) / 2);
    else if (ref) left = Math.round(cx - ((ref.left + ref.width / 2) - cx) * 0.58);
    else left = Math.round(cx - width * 0.12);

    if (ref) right = Math.round((cx + (ref.left + ref.width / 2)) / 2);
    else right = Math.round(cx + width * 0.14);

    left = Math.max(0, left - Math.round(width * 0.015));
    right = Math.min(width, right + Math.round(width * 0.025));
    if (right - left < width * 0.12) {
      left = Math.max(0, Math.round(cx - width * 0.13));
      right = Math.min(width, Math.round(cx + width * 0.16));
    }

    return { left, right, headerY: header.bottom };
  }

  function mergeResultRows(structureRows, resultRows) {
    if (!resultRows.length) return structureRows.map(row => row.text).join('\n');
    const used = new Set();
    const lines = [];

    for (const row of structureRows) {
      let bestIndex = -1;
      let bestDistance = Infinity;
      const tolerance = Math.max(10, row.height * 1.1);

      for (let i = 0; i < resultRows.length; i++) {
        if (used.has(i)) continue;
        const candidate = resultRows[i];
        const distance = Math.abs(candidate.cy - row.cy);
        if (distance <= tolerance && distance < bestDistance) {
          bestIndex = i;
          bestDistance = distance;
        }
      }

      if (bestIndex >= 0) {
        used.add(bestIndex);
        lines.push(`${row.text}   ${RESULT_MARKER} ${resultRows[bestIndex].text}`);
      } else {
        lines.push(row.text);
      }
    }
    return lines.join('\n');
  }

  async function recognizePage(ocrWorker, file, progress) {
    const base = await fileToBaseCanvas(file);

    // PASO 1: estructura. Franjas horizontales reducen memoria y hacen el texto
    // más grande/estable en teléfonos que el OCR de la hoja completa.
    await ocrWorker.setParameters({
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
      tessedit_pageseg_mode: '11',
    });
    const structureWords = await recognizeBanded(
      ocrWorker,
      base,
      0,
      base.width,
      { bandCount: STRUCTURE_BANDS, targetWidth: 2350, keyPrefix: 's', progress, passWeight: STRUCTURE_PASS_WEIGHT }
    );
    const structureRows = wordsToVisualRows(structureWords);

    // PASO 2: solo columna RESULTADO. La ampliamos más y aplicamos un unsharp
    // suave para recuperar puntos decimales pequeños sin tocar los rangos.
    const resultColumn = findResultColumn(structureWords, base.width);
    const resultWidth = Math.max(1, resultColumn.right - resultColumn.left);
    const resultWords = await recognizeBanded(
      ocrWorker,
      base,
      resultColumn.left,
      resultWidth,
      { bandCount: RESULT_BANDS, targetWidth: 1000, enhance: true, keyPrefix: 'r', progress, passWeight: RESULT_PASS_WEIGHT }
    );
    const resultRows = wordsToVisualRows(resultWords)
      .filter(row => row.cy >= resultColumn.headerY - 10);

    const merged = mergeResultRows(structureRows, resultRows);
    base.width = 1;
    base.height = 1;
    return merged;
  }

  function formatOCR(rawText) {
    if (!window.LabParser) throw new Error('No se cargó el intérprete de laboratorios.');
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

    const progress = createAnalysisProgress(total);
    progress.start();

    try {
      const ocrWorker = await getWorker();
      progress.workerReady();

      const pages = [];
      for (let index = 0; index < total; index++) {
        pages.push(await recognizePage(ocrWorker, batch[index], progress));
      }

      progress.parsing();
      const formatted = formatOCR(pages.join('\n\n'));
      output.value = formatted || 'No se reconocieron datos de laboratorio con el formato conocido.';
      if (formatted) {
        window.dispatchEvent(new CustomEvent('labscan:result', {
          detail: { text: formatted }
        }));
      }
      files = [];
      progress.complete();
      await new Promise(resolve => setTimeout(resolve, 350));
    } catch (error) {
      progress.cancel();
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
