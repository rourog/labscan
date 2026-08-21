/*
 * LabScan — PaddleOCR adapter v12.2
 * OCR en navegador con PP-OCRv6 + reconstrucción geométrica de tabla.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LabPaddleOCR = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const PADDLE_CDN = 'https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.4.2/+esm';
  const PADDLE_CDN_FALLBACK = 'https://esm.sh/@paddleocr/paddleocr-js@0.4.2?bundle';
  const ORT_WASM_PATH = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
  const RESULT_MARKER = '§RESULT§';

  let sdkPromise = null;
  let ocrPromise = null;
  let ocrInstance = null;

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function median(values) {
    const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!clean.length) return 0;
    const mid = Math.floor(clean.length / 2);
    return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
  }

  function normalizeToken(value) {
    return String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9%#]/g, '');
  }

  function normalizeText(value) {
    return String(value || '')
      .replace(/[\u00a0\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function loadSDK() {
    if (sdkPromise) return sdkPromise;
    sdkPromise = (async () => {
      try {
        return await import(PADDLE_CDN);
      } catch (primaryError) {
        console.warn('[LabScan] jsDelivr PaddleOCR import falló; probando CDN alterno.', primaryError);
        return await import(PADDLE_CDN_FALLBACK);
      }
    })().catch(error => {
      sdkPromise = null;
      throw new Error(`No se pudo cargar PaddleOCR.js: ${error?.message || error}`);
    });
    return sdkPromise;
  }

  function withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  async function initialize(onStage) {
    if (ocrInstance) return ocrInstance;
    if (ocrPromise) return ocrPromise;

    ocrPromise = (async () => {
      onStage?.('Cargando biblioteca OCR');
      const mod = await loadSDK();
      onStage?.('Biblioteca OCR lista');
      const PaddleOCR = mod?.PaddleOCR;
      if (!PaddleOCR?.create) throw new Error('El SDK PaddleOCR no expuso PaddleOCR.create().');

      // v12.1: tiny es el modelo primario en móvil. El par det+rec pesa
      // aproximadamente 6.3 MB frente a ~30 MB del small, por lo que evita
      // dejar la interfaz aparentemente congelada durante la inicialización.
      onStage?.('Descargando modelo OCR ligero (~6 MB)');

      const createTiny = PaddleOCR.create({
        textDetectionModelName: 'PP-OCRv6_tiny_det',
        textRecognitionModelName: 'PP-OCRv6_tiny_rec',
        textDetectionBatchSize: 1,
        textRecognitionBatchSize: 2,
        ortOptions: {
          backend: 'wasm',
          wasmPaths: ORT_WASM_PATH,
          numThreads: 1,
          simd: true,
        },
      });

      try {
        ocrInstance = await withTimeout(
          createTiny,
          75000,
          'PaddleOCR tardó demasiado en cargar el modelo ligero. Recarga la página y verifica la conexión.'
        );
      } catch (tinyError) {
        console.error('[LabScan] No se pudo iniciar PP-OCRv6 tiny.', tinyError);
        throw tinyError;
      }

      onStage?.('Motor OCR listo');
      return ocrInstance;
    })().catch(error => {
      ocrPromise = null;
      ocrInstance = null;
      throw error;
    });

    return ocrPromise;
  }

  async function fileToCanvas(file, targetLongEdge = 2600) {
    const bitmap = typeof createImageBitmap === 'function'
      ? await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null)
      : null;

    let source = bitmap;
    let revokeUrl = null;
    if (!source) {
      const url = URL.createObjectURL(file);
      revokeUrl = url;
      const image = new Image();
      image.decoding = 'async';
      image.src = url;
      if (typeof image.decode === 'function') await image.decode();
      else await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('No se pudo abrir la imagen.'));
      });
      source = image;
    }

    try {
      const srcWidth = source.width || source.naturalWidth;
      const srcHeight = source.height || source.naturalHeight;
      const longEdge = Math.max(srcWidth, srcHeight);
      const scale = longEdge > targetLongEdge ? targetLongEdge / longEdge : 1;
      const width = Math.max(1, Math.round(srcWidth * scale));
      const height = Math.max(1, Math.round(srcHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('El navegador no permitió preparar la fotografía.');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(source, 0, 0, width, height);
      return canvas;
    } finally {
      if (bitmap?.close) bitmap.close();
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    }
  }

  function pointsFromPoly(poly) {
    if (!Array.isArray(poly)) return [];
    if (poly.length && Array.isArray(poly[0])) {
      return poly
        .map(p => ({ x: Number(p?.[0]), y: Number(p?.[1]) }))
        .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
    }
    const flat = poly.map(Number).filter(Number.isFinite);
    const points = [];
    for (let i = 0; i + 1 < flat.length; i += 2) points.push({ x: flat[i], y: flat[i + 1] });
    return points;
  }

  function bboxFromPoints(points) {
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    return {
      left, right, top, bottom,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
      cx: (left + right) / 2,
      cy: (top + bottom) / 2,
    };
  }

  function lineAngle(points) {
    if (points.length < 2) return 0;
    // En los polígonos Paddle los primeros dos puntos suelen recorrer el borde superior.
    const a = points[0];
    const b = points[1];
    let angle = Math.atan2(b.y - a.y, b.x - a.x);
    while (angle > Math.PI / 2) angle -= Math.PI;
    while (angle < -Math.PI / 2) angle += Math.PI;
    return angle;
  }

  function normalizeItems(result) {
    const source = Array.isArray(result?.items) ? result.items : [];
    const items = [];
    for (let index = 0; index < source.length; index++) {
      const raw = source[index];
      const text = normalizeText(raw?.text);
      const score = Number(raw?.score);
      const points = pointsFromPoly(raw?.poly);
      if (!text || points.length < 4) continue;
      const box = bboxFromPoints(points);
      if (box.width < 2 || box.height < 2) continue;
      items.push({
        index,
        text,
        score: Number.isFinite(score) ? score : 0,
        points,
        angle: lineAngle(points),
        ...box,
      });
    }
    return items;
  }

  function estimateDeskew(items) {
    const candidates = items
      .filter(item => item.width >= item.height * 2.0 && Math.abs(item.angle) <= Math.PI / 12)
      .map(item => item.angle);
    return median(candidates);
  }

  function rotatePoint(x, y, theta) {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    return { x: x * c - y * s, y: x * s + y * c };
  }

  function deskewItems(items, angle) {
    const theta = -angle;
    return items.map(item => {
      const rotated = item.points.map(p => rotatePoint(p.x, p.y, theta));
      const box = bboxFromPoints(rotated);
      return { ...item, rpoints: rotated, rleft: box.left, rright: box.right, rtop: box.top, rbottom: box.bottom, rwidth: box.width, rheight: box.height, rcx: box.cx, rcy: box.cy };
    });
  }

  function verticalOverlap(a, b) {
    const aHeight = Number.isFinite(a.rheight) ? a.rheight : Math.max(1, a.rbottom - a.rtop);
    const bHeight = Number.isFinite(b.rheight) ? b.rheight : (Number.isFinite(b.height) ? b.height : Math.max(1, b.rbottom - b.rtop));
    const overlap = Math.max(0, Math.min(a.rbottom, b.rbottom) - Math.max(a.rtop, b.rtop));
    return overlap / Math.max(1, Math.min(aHeight, bHeight));
  }

  function groupRows(items) {
    if (!items.length) return [];
    const sorted = [...items].sort((a, b) => a.rcy - b.rcy || a.rleft - b.rleft);
    const typicalHeight = Math.max(8, median(sorted.map(i => i.rheight).filter(h => h > 2)));
    const rows = [];

    for (const item of sorted) {
      let best = null;
      let bestScore = -Infinity;
      for (let i = rows.length - 1; i >= 0 && i >= rows.length - 10; i--) {
        const row = rows[i];
        const centerDistance = Math.abs(item.rcy - row.rcy);
        if (centerDistance > Math.max(typicalHeight * 1.05, item.rheight * 1.1, row.height * 1.1)) continue;
        const overlap = verticalOverlap(item, row);
        const score = overlap * 3 - centerDistance / typicalHeight;
        if (overlap >= 0.18 || centerDistance <= typicalHeight * 0.58) {
          if (score > bestScore) {
            best = row;
            bestScore = score;
          }
        }
      }

      if (!best) {
        best = {
          items: [],
          rtop: item.rtop,
          rbottom: item.rbottom,
          rleft: item.rleft,
          rright: item.rright,
          rcy: item.rcy,
          height: item.rheight,
        };
        rows.push(best);
      }
      best.items.push(item);
      best.rtop = Math.min(best.rtop, item.rtop);
      best.rbottom = Math.max(best.rbottom, item.rbottom);
      best.rleft = Math.min(best.rleft, item.rleft);
      best.rright = Math.max(best.rright, item.rright);
      best.height = best.rbottom - best.rtop;
      best.rcy = best.items.reduce((sum, x) => sum + x.rcy, 0) / best.items.length;
    }

    rows.sort((a, b) => a.rcy - b.rcy);
    return rows.map((row, index) => {
      row.items.sort((a, b) => a.rleft - b.rleft);
      const text = row.items.map(x => x.text).join(' ').replace(/\s+/g, ' ').trim();
      const score = row.items.reduce((sum, x) => sum + x.score * Math.max(1, x.text.length), 0) /
        row.items.reduce((sum, x) => sum + Math.max(1, x.text.length), 0);
      return { ...row, index, text, score };
    }).filter(row => row.text);
  }

  function findItem(row, predicate) {
    return row.items.find(item => predicate(normalizeToken(item.text), item));
  }

  function isHeaderRow(row) {
    const token = normalizeToken(row.text);
    return token.includes('RESULTADO') && (token.includes('ESTUDIO') || token.includes('REFERENCIA') || token.includes('VALOR'));
  }

  function columnSpecFromHeader(row, pageWidth) {
    const result = findItem(row, token => token.includes('RESULTADO'));
    const study = findItem(row, token => token.includes('ESTUDIO'));
    const referenceItems = row.items.filter(item => {
      const t = normalizeToken(item.text);
      return t.includes('REFERENCIA') || t === 'VALOR' || t.startsWith('VALORDE');
    });
    const reference = referenceItems.sort((a, b) => a.rleft - b.rleft)[0];

    if (!result) {
      return { leftBoundary: pageWidth * 0.41, rightBoundary: pageWidth * 0.68, resultCenter: pageWidth * 0.545, headerY: row.rbottom, source: 'ratio' };
    }

    let leftBoundary = study
      ? (study.rright + result.rleft) / 2
      : result.rcx - pageWidth * 0.12;
    let rightBoundary = reference
      ? (result.rright + reference.rleft) / 2
      : result.rcx + pageWidth * 0.13;

    leftBoundary = clamp(leftBoundary, pageWidth * 0.32, pageWidth * 0.52);
    rightBoundary = clamp(rightBoundary, pageWidth * 0.57, pageWidth * 0.79);
    if (rightBoundary - leftBoundary < pageWidth * 0.12) {
      leftBoundary = result.rcx - pageWidth * 0.10;
      rightBoundary = result.rcx + pageWidth * 0.12;
    }
    return { leftBoundary, rightBoundary, resultCenter: result.rcx, headerY: row.rbottom, source: 'header' };
  }

  function getHeaderContexts(rows, pageWidth) {
    const headers = rows.filter(isHeaderRow);
    if (!headers.length) {
      return [{ startY: -Infinity, spec: { leftBoundary: pageWidth * 0.41, rightBoundary: pageWidth * 0.68, resultCenter: pageWidth * 0.545, headerY: 0, source: 'ratio' } }];
    }
    return headers.map(row => ({ startY: row.rbottom, spec: columnSpecFromHeader(row, pageWidth), rowIndex: row.index }));
  }

  function contextForRow(row, contexts) {
    let chosen = contexts[0];
    for (const context of contexts) {
      if (row.rcy >= context.startY) chosen = context;
      else break;
    }
    return chosen;
  }

  function joinItems(items) {
    return items
      .sort((a, b) => a.rleft - b.rleft)
      .map(item => item.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function weightedScore(items) {
    if (!items.length) return 0;
    const denom = items.reduce((sum, item) => sum + Math.max(1, item.text.length), 0);
    return items.reduce((sum, item) => sum + item.score * Math.max(1, item.text.length), 0) / Math.max(1, denom);
  }

  function rowToParserLine(row, context, pageWidth) {
    if (isHeaderRow(row)) return row.text;
    const spec = context.spec;
    const label = [];
    const result = [];
    const reference = [];
    const crossing = [];

    for (const item of row.items) {
      const spansLeft = item.rleft < spec.leftBoundary && item.rright > spec.leftBoundary;
      const spansRight = item.rleft < spec.rightBoundary && item.rright > spec.rightBoundary;
      // Solo tratamos como fila fusionada una caja que realmente atraviesa las
      // dos fronteras de columna. Los nombres largos de analitos pueden invadir
      // visualmente el inicio de RESULTADO, pero su centro sigue estando en ESTUDIO.
      if (spansLeft && spansRight && item.rwidth > pageWidth * 0.45) {
        crossing.push(item);
        continue;
      }
      if (item.rcx < spec.leftBoundary) label.push(item);
      else if (item.rcx < spec.rightBoundary) result.push(item);
      else reference.push(item);
    }

    // Si Paddle detectó una fila completa como una sola línea, el parser heredado
    // sigue siendo un buen fallback porque conserva el orden visual de esa línea.
    if (crossing.length && !label.length && !result.length) return joinItems(crossing);

    const labelText = joinItems(label);
    const resultText = joinItems(result);
    const resultScore = weightedScore(result);

    if (labelText && resultText) {
      // Los resultados con confianza extremadamente baja se omiten: es preferible
      // perder un campo que fabricar un número clínico incorrecto.
      if (resultScore > 0 && resultScore < 0.38) return labelText;
      return `${labelText}   ${RESULT_MARKER} ${resultText}`;
    }

    if (labelText) return labelText;
    if (crossing.length) return joinItems(crossing);

    // Encabezados/leyendas centradas suelen caer geométricamente en la columna media.
    // Solo las conservamos si no parecen un valor aislado.
    const rowText = row.text;
    if (resultText && /[A-ZÁÉÍÓÚÑ]{4,}/i.test(resultText) && !/^[-+<>]?\s*[\d.,]+/.test(resultText)) {
      return resultText;
    }
    return '';
  }

  function buildParserText(ocrResult) {
    const pageWidth = Number(ocrResult?.image?.width) || 1;
    const items = normalizeItems(ocrResult);
    if (!items.length) return { text: '', rows: [], items: [], angle: 0, metrics: ocrResult?.metrics || null };
    const angle = estimateDeskew(items);
    const deskewed = deskewItems(items, angle);
    const rows = groupRows(deskewed);
    const contexts = getHeaderContexts(rows, pageWidth);
    const lines = [];

    for (const row of rows) {
      const context = contextForRow(row, contexts);
      const line = rowToParserLine(row, context, pageWidth);
      if (line) lines.push(line);
    }

    return {
      text: lines.join('\n'),
      rows,
      items: deskewed,
      angle,
      metrics: ocrResult?.metrics || null,
    };
  }

  async function recognizeFile(file, options = {}) {
    const ocr = await initialize(options.onStage);
    options.onStage?.('Preparando imagen');
    const canvas = await fileToCanvas(file, options.targetLongEdge || 2600);
    try {
      options.onStage?.('Imagen preparada');
      options.onStage?.('Extrayendo texto');
      const results = await ocr.predict(canvas, {
        textDetLimitSideLen: 2200,
        textDetLimitType: 'max',
        textDetMaxSideLimit: 2800,
        textRecScoreThresh: 0.30,
      });
      const result = results?.[0];
      if (!result) throw new Error('PaddleOCR no devolvió resultados para la imagen.');
      options.onStage?.('Texto extraído');
      options.onStage?.('Reconstruyendo tabla');
      const built = buildParserText(result);
      options.onStage?.('Tabla reconstruida');
      return built;
    } finally {
      canvas.width = 1;
      canvas.height = 1;
    }
  }

  async function dispose() {
    try {
      await ocrInstance?.dispose?.();
    } catch (_) {}
    ocrInstance = null;
    ocrPromise = null;
  }

  return {
    initialize,
    recognizeFile,
    buildParserText,
    normalizeItems,
    estimateDeskew,
    deskewItems,
    groupRows,
    getHeaderContexts,
    rowToParserLine,
    dispose,
    constants: { RESULT_MARKER, PADDLE_CDN, ORT_WASM_PATH },
  };
});
