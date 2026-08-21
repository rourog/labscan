(() => {
  'use strict';

  const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
  const RESULT_MARKER = '§RESULT§';

  const cameraButton = document.getElementById('cameraButton');
  const uploadButton = document.getElementById('uploadButton');
  const analyzeButton = document.getElementById('analyzeButton');
  const analyzeButtonLabel = document.getElementById('analyzeButtonLabel');
  const cameraInput = document.getElementById('cameraInput');
  const uploadInput = document.getElementById('uploadInput');
  const output = document.getElementById('output');

  let files = [];
  let worker = null;
  let tesseractLoader = null;
  let activeRecognitionProgress = null;

  const STRUCTURE_BANDS = 4;
  const RESULT_CELL_CHUNKS = 2;
  const STRUCTURE_PASS_WEIGHT = 1.0;
  const RESULT_PASS_WEIGHT = 0.65;

  function setAnalyzeLabel(text) {
    if (analyzeButtonLabel) analyzeButtonLabel.textContent = text;
    else analyzeButton.textContent = text;
  }

  function setAnalyzeState() {
    analyzeButton.disabled = files.length === 0;
    setAnalyzeLabel(files.length > 1
      ? `Analizar datos · ${files.length}`
      : 'Analizar datos');
  }

  function createAnalysisProgress(pageCount) {
    const pages = Math.max(1, pageCount);
    const weightPerPage =
      STRUCTURE_BANDS * STRUCTURE_PASS_WEIGHT +
      RESULT_CELL_CHUNKS * RESULT_PASS_WEIGHT;
    const totalWeight = pages * weightPerPage;
    let completedWeight = 0;
    let currentWeight = 0;
    let lastPercent = 0;

    const render = value => {
      const percent = Math.max(lastPercent, Math.min(100, Math.round(value)));
      lastPercent = percent;
      setAnalyzeLabel(`Analizando · ${percent}%`);
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
        left: Math.round(width * 0.43),
        right: Math.round(width * 0.64),
        headerY: 0,
      };
    }

    const sameBand = word => Math.abs(word.cy - header.cy) < Math.max(20, header.height * 3.0);
    const refCandidates = words
      .filter(word => sameBand(word) && word.left > header.right && ['VALOR', 'REFERENCIA'].includes(normalizeToken(word.text)))
      .sort((a, b) => a.left - b.left);
    const ref = refCandidates[0];
    const study = words
      .filter(word => sameBand(word) && word.right < header.left && normalizeToken(word.text) === 'ESTUDIO')
      .sort((a, b) => b.right - a.right)[0];

    const cx = header.left + header.width / 2;
    let left = study
      ? Math.round((study.right + header.left) / 2)
      : Math.round(cx - width * 0.11);

    // En RASOMA la columna de referencia está bastante separada. Usamos su
    // borde izquierdo real cuando existe, en vez del centro del encabezado,
    // para no contaminar el OCR de RESULTADO con 4.5–11, 23–45, etc.
    let right = ref
      ? Math.round(ref.left - width * 0.018)
      : Math.round(cx + width * 0.12);

    left = Math.max(0, left - Math.round(width * 0.012));
    right = Math.min(width, right);

    // Límites conservadores si el encabezado salió deformado por perspectiva.
    const minWidth = Math.round(width * 0.14);
    const maxWidth = Math.round(width * 0.28);
    if (right - left < minWidth) {
      left = Math.max(0, Math.round(cx - width * 0.10));
      right = Math.min(width, Math.round(cx + width * 0.10));
    } else if (right - left > maxWidth) {
      left = Math.max(0, Math.round(cx - width * 0.11));
      right = Math.min(width, Math.round(cx + width * 0.13));
    }

    return { left, right, headerY: header.bottom };
  }

  function splitEvenly(items, chunkCount) {
    const count = Math.max(1, Math.min(chunkCount, items.length || 1));
    const chunks = [];
    for (let i = 0; i < count; i++) {
      const start = Math.floor(items.length * i / count);
      const end = Math.floor(items.length * (i + 1) / count);
      chunks.push(items.slice(start, end));
    }
    return chunks;
  }

  function buildResultCellCanvas(baseCanvas, structureRows, resultColumn) {
    if (!structureRows.length) return null;

    const typicalHeight = Math.max(8, median(structureRows.map(row => row.height).filter(Number.isFinite)));
    const sourceWidth = Math.max(1, resultColumn.right - resultColumn.left);
    const targetWidth = 900;
    const scale = Math.max(1.7, Math.min(3.3, targetWidth / sourceWidth));
    const sidePadding = 24;
    const topPadding = 18;
    const bottomPadding = 18;
    const gap = 30;

    const cells = structureRows.map((row, sourceIndex) => {
      // La altura del texto del analito y la del resultado no siempre coincide.
      // Este margen absorbe inclinación de la hoja sin alcanzar la fila vecina.
      const half = Math.max(typicalHeight * 0.78, row.height * 0.80);
      const y1 = Math.max(0, Math.round(row.cy - half));
      const y2 = Math.min(baseCanvas.height, Math.round(row.cy + half));
      const sourceHeight = Math.max(1, y2 - y1);
      const drawnHeight = Math.max(28, Math.round(sourceHeight * scale));
      return { row, sourceIndex, y1, sourceHeight, drawnHeight };
    });

    const canvasWidth = Math.round(sourceWidth * scale) + sidePadding * 2;
    const canvasHeight = cells.reduce((sum, cell) => sum + cell.drawnHeight + topPadding + bottomPadding + gap, gap);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, canvasWidth);
    canvas.height = Math.max(1, canvasHeight);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('No se pudo preparar la lectura de resultados.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    let cursorY = gap;
    const mapping = [];
    for (const cell of cells) {
      const contentTop = cursorY + topPadding;
      ctx.drawImage(
        baseCanvas,
        resultColumn.left, cell.y1, sourceWidth, cell.sourceHeight,
        sidePadding, contentTop, Math.round(sourceWidth * scale), cell.drawnHeight
      );

      mapping.push({
        sourceIndex: cell.sourceIndex,
        top: cursorY,
        bottom: contentTop + cell.drawnHeight + bottomPadding,
        contentTop,
        contentBottom: contentTop + cell.drawnHeight,
      });
      cursorY = contentTop + cell.drawnHeight + bottomPadding + gap;
    }

    enhanceNumericCanvas(canvas);
    return { canvas, mapping };
  }

  function wordsByMappedCell(words, mapping) {
    const result = new Map();
    for (const map of mapping) {
      const cellWords = words
        .filter(word => word.cy >= map.top && word.cy < map.bottom)
        .sort((a, b) => a.left - b.left);
      if (!cellWords.length) continue;

      // Una celda puede contener ruido de la línea punteada. Conservamos solo
      // texto reconocido y dejamos que el parser valide número + unidad.
      const text = cellWords.map(word => word.text).join(' ').replace(/\s+/g, ' ').trim();
      if (text) result.set(map.sourceIndex, text);
    }
    return result;
  }

  async function recognizeResultCells(ocrWorker, baseCanvas, structureRows, resultColumn, progress) {
    const eligible = structureRows
      .map((row, index) => ({ ...row, sourceIndex: index }))
      .filter(row => row.cy >= resultColumn.headerY - 6);

    const chunks = splitEvenly(eligible, RESULT_CELL_CHUNKS);
    const refined = new Map();

    await ocrWorker.setParameters({
      preserve_interword_spaces: '1',
      user_defined_dpi: '350',
      tessedit_pageseg_mode: '6',
    });

    for (const chunk of chunks) {
      progress?.beginPass(RESULT_PASS_WEIGHT);
      try {
        if (!chunk.length) continue;
        const built = buildResultCellCanvas(baseCanvas, chunk, resultColumn);
        if (!built) continue;
        let result;
        try {
          result = await ocrWorker.recognize(
            built.canvas,
            { rotateAuto: false },
            { text: true, tsv: true }
          );
        } finally {
          built.canvas.width = 1;
          built.canvas.height = 1;
        }

        const words = parseTsvWords(result?.data?.tsv || '', { keyPrefix: 'cell' });
        const local = wordsByMappedCell(words, built.mapping);
        for (const [localIndex, text] of local) {
          const sourceIndex = chunk[localIndex]?.sourceIndex;
          if (Number.isInteger(sourceIndex)) refined.set(sourceIndex, text);
        }
      } finally {
        progress?.finishPass();
      }
    }

    // Restaurar PSM disperso para la siguiente página.
    await ocrWorker.setParameters({
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
      tessedit_pageseg_mode: '11',
    });
    return refined;
  }

  function mergeResultCells(structureRows, refinedByRow) {
    return structureRows.map((row, index) => {
      const refined = refinedByRow.get(index);
      return refined ? `${row.text}   ${RESULT_MARKER} ${refined}` : row.text;
    }).join('\n');
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

    // PASO 2: la columna RESULTADO ya no se OCRiza como una lista independiente.
    // Construimos una celda por cada fila detectada y mantenemos un mapa exacto
    // fila→celda. Esto evita desplazamientos como Na←Cl, Glucosa←Urea o Eri←Hb.
    const resultColumn = findResultColumn(structureWords, base.width);
    const refinedByRow = await recognizeResultCells(
      ocrWorker,
      base,
      structureRows,
      resultColumn,
      progress
    );

    const merged = mergeResultCells(structureRows, refinedByRow);
    base.width = 1;
    base.height = 1;
    return merged;
  }

  function formatOCR(rawText) {
    if (!window.LabParser) throw new Error('No se cargó el intérprete de laboratorios.');
    const normalized = LabParser.normalizeOCR(rawText);
    const parsed = LabParser.parseLabResults(normalized);
    const formatted = LabParser.formatForClipboard(parsed);
    return { parsed, formatted };
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
      const result = formatOCR(pages.join('\n\n'));
      output.value = result.formatted || 'No se reconocieron datos de laboratorio con el formato conocido.';
      if (result.formatted) {
        window.dispatchEvent(new CustomEvent('labscan:result', {
          detail: { text: result.formatted, parsed: result.parsed }
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
