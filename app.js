(() => {
  'use strict';

  const cameraButton = document.getElementById('cameraButton');
  const uploadButton = document.getElementById('uploadButton');
  const analyzeButton = document.getElementById('analyzeButton');
  const analyzeButtonLabel = document.getElementById('analyzeButtonLabel');
  const analyzeButtonPercent = document.getElementById('analyzeButtonPercent');
  const cameraInput = document.getElementById('cameraInput');
  const uploadInput = document.getElementById('uploadInput');
  const output = document.getElementById('output');

  let files = [];
  let preloadStarted = false;
  let engineReady = false;
  let engineStage = 'idle';
  let isProcessing = false;
  let awaitingSync = false;
  let completionTimer = null;

  const STEP_TARGETS = {
    files: 4,
    library: 9,
    model: 24,
    image: 34,
    ocr: 72,
    geometry: 82,
    parse: 90,
    format: 96,
    sync: 99,
  };

  const STEP_STARTS = {
    files: 1,
    library: 5,
    model: 10,
    image: 25,
    ocr: 35,
    geometry: 73,
    parse: 83,
    format: 91,
    sync: 97,
  };

  const STEP_LABELS = {
    files: 'Preparando archivos',
    library: 'Cargando biblioteca',
    model: 'Cargando modelo',
    image: 'Cargando imagen',
    ocr: 'Extrayendo texto',
    geometry: 'Ordenando resultados',
    parse: 'Interpretando datos',
    format: 'Dando formato',
    sync: 'Enviando al PC',
  };

  class ButtonProgress {
    constructor() {
      this.percent = 0;
      this.active = false;
      this.error = false;
    }

    setPercent(value) {
      const next = Math.max(this.percent, Math.min(100, Math.round(Number(value) || 0)));
      this.percent = next;
      if (analyzeButtonPercent) {
        analyzeButtonPercent.textContent = `${next}%`;
        analyzeButtonPercent.hidden = !this.active;
      }
      analyzeButton?.style.setProperty('--analyze-progress', `${next}%`);
    }

    setLabel(text) {
      if (analyzeButtonLabel) analyzeButtonLabel.textContent = text;
    }

    begin() {
      this.active = true;
      this.error = false;
      this.percent = 0;
      analyzeButton?.classList.add('is-processing');
      analyzeButton?.classList.remove('is-complete', 'is-error');
      if (analyzeButtonPercent) analyzeButtonPercent.hidden = false;
      this.setPercent(1);
    }

    activate(step, detail) {
      if (!this.active) this.begin();
      this.setPercent(STEP_STARTS[step] ?? this.percent);
      let label = STEP_LABELS[step] || 'Procesando';
      if (detail && /hoja\s+\d+/i.test(detail)) {
        const m = detail.match(/hoja\s+\d+(?:\s+de\s+\d+)?/i);
        if (m) label += ` · ${m[0].replace(/^hoja/i, '').trim()}`;
      }
      this.setLabel(label);
    }

    complete(step) {
      if (!this.active) this.begin();
      this.setPercent(STEP_TARGETS[step] ?? this.percent);
    }

    setDetail(detail) {
      if (!detail || !this.active) return;
      const m = String(detail).match(/(\d+)\/(\d+)/);
      if (m && /Texto extraído/i.test(detail)) {
        this.setLabel(`Extrayendo texto · ${m[1]}/${m[2]}`);
      }
    }

    finish() {
      if (completionTimer) clearTimeout(completionTimer);
      this.active = true;
      this.setPercent(100);
      this.setLabel('Completado');
      analyzeButton?.classList.remove('is-processing', 'is-error');
      analyzeButton?.classList.add('is-complete');
      if (analyzeButtonPercent) analyzeButtonPercent.hidden = false;
      completionTimer = setTimeout(() => {
        this.reset();
        setAnalyzeState();
      }, 1600);
    }

    fail(message) {
      this.active = true;
      this.error = true;
      this.setLabel('Error al procesar');
      analyzeButton?.classList.remove('is-processing', 'is-complete');
      analyzeButton?.classList.add('is-error');
      if (analyzeButtonPercent) analyzeButtonPercent.hidden = false;
      if (message) analyzeButton.title = message;
    }

    reset() {
      this.active = false;
      this.error = false;
      this.percent = 0;
      analyzeButton?.classList.remove('is-processing', 'is-complete', 'is-error');
      analyzeButton?.style.setProperty('--analyze-progress', '0%');
      analyzeButton?.removeAttribute('title');
      if (analyzeButtonPercent) {
        analyzeButtonPercent.textContent = '0%';
        analyzeButtonPercent.hidden = true;
      }
    }
  }

  const progress = new ButtonProgress();

  function setAnalyzeLabel(text) {
    if (analyzeButtonLabel) analyzeButtonLabel.textContent = text;
  }

  function setAnalyzeState() {
    if (!analyzeButton) return;
    analyzeButton.disabled = isProcessing || files.length === 0;
    if (isProcessing || progress.active) return;
    setAnalyzeLabel(files.length > 1 ? `Analizar datos · ${files.length}` : 'Analizar datos');
  }

  function releaseControls() {
    isProcessing = false;
    awaitingSync = false;
    if (cameraButton) cameraButton.disabled = false;
    if (uploadButton) uploadButton.disabled = false;
    setAnalyzeState();
  }

  function openFilePicker(input) {
    try {
      if (typeof input.showPicker === 'function') input.showPicker();
      else input.click();
    } catch (_) {
      input.click();
    }
  }

  function handleEngineStage(stage) {
    const text = String(stage || '');
    if (/Cargando biblioteca/i.test(text)) engineStage = 'library';
    else if (/Biblioteca OCR lista/i.test(text)) engineStage = 'model';
    else if (/Descargando modelo|modelo OCR/i.test(text)) engineStage = 'model';
    else if (/Motor OCR listo/i.test(text)) {
      engineStage = 'ready';
      engineReady = true;
    }

    if (!isProcessing) return;
    if (engineStage === 'library') progress.activate('library');
    if (engineStage === 'model') progress.activate('model');
    if (engineStage === 'ready') {
      progress.complete('library');
      progress.complete('model');
    }
  }

  async function registerOcrCacheWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      await navigator.serviceWorker.register('./sw.js?v=12.4', { scope: './' });
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise(resolve => setTimeout(resolve, 1200)),
      ]);
    } catch (error) {
      console.info('[LabScan] Cache OCR no disponible:', error?.message || error);
    }
  }

  function warmUpOCR() {
    if (preloadStarted || !window.LabPaddleOCR) return;
    preloadStarted = true;
    LabPaddleOCR.initialize(handleEngineStage).then(() => {
      engineReady = true;
      engineStage = 'ready';
      if (isProcessing) {
        progress.complete('library');
        progress.complete('model');
      }
    }).catch(error => {
      preloadStarted = false;
      engineReady = false;
      engineStage = 'error';
      console.warn('[LabScan] Precarga OCR falló:', error);
      if (isProcessing) progress.fail(error?.message || 'No se pudo cargar el motor OCR.');
    });
  }

  function startBackgroundWarmup() {
    const isMobileSession = new URLSearchParams(location.search).has('session');
    if (!isMobileSession || !window.LabPaddleOCR) return;
    const start = async () => {
      await registerOcrCacheWorker();
      warmUpOCR();
    };
    if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 900 });
    else setTimeout(start, 350);
  }

  function addFiles(fileList) {
    const selected = Array.from(fileList || []).filter(file => file.type.startsWith('image/'));
    if (!selected.length) return;
    files.push(...selected);
    output.value = '';
    progress.reset();
    setAnalyzeState();
    // Normalmente el modelo ya se está precargando desde que se abrió el QR.
    warmUpOCR();
    cameraInput.value = '';
    uploadInput.value = '';
  }

  function parseAndFormat(rawText) {
    if (!window.LabParser) throw new Error('No se cargó el intérprete de laboratorios.');

    progress.activate('parse');
    const normalized = LabParser.normalizeOCR(rawText);
    const parsed = LabParser.parseLabResults(normalized);
    progress.complete('parse');

    progress.activate('format');
    const formatted = LabParser.formatForClipboard(parsed);
    progress.complete('format');

    return { parsed, formatted, normalized };
  }

  function ocrPercentForCompletedPages(completed, total) {
    return 35 + (72 - 35) * (completed / Math.max(1, total));
  }

  function handleRecognitionStage(stage, index, total) {
    const text = String(stage || '');
    const pageLabel = `hoja ${index + 1} de ${total}`;

    if (/Preparando imagen/i.test(text)) {
      progress.activate(index === 0 ? 'image' : 'ocr', pageLabel);
      return;
    }
    if (/Imagen preparada/i.test(text)) {
      if (index === 0) progress.complete('image');
      return;
    }
    if (/Reconociendo documento|Extrayendo texto/i.test(text)) {
      progress.activate('ocr', pageLabel);
      return;
    }
    if (/Texto extraído/i.test(text)) {
      progress.setPercent(ocrPercentForCompletedPages(index + 1, total));
      progress.setDetail(`Texto extraído ${index + 1}/${total}`);
      return;
    }
    if (/Reconstruyendo tabla/i.test(text)) {
      progress.activate('geometry', pageLabel);
    }
  }

  cameraButton?.addEventListener('click', () => openFilePicker(cameraInput));
  uploadButton?.addEventListener('click', () => openFilePicker(uploadInput));
  cameraInput?.addEventListener('change', event => addFiles(event.target.files));
  uploadInput?.addEventListener('change', event => addFiles(event.target.files));

  window.addEventListener('labscan:sync-state', event => {
    const state = event.detail?.state;
    if (state === 'sending') {
      awaitingSync = true;
      progress.activate('sync');
      progress.complete('sync');
    } else if (state === 'sent') {
      awaitingSync = false;
      progress.finish();
      releaseControls();
    } else if (state === 'error') {
      awaitingSync = false;
      progress.fail(event.detail?.message || 'No se pudieron enviar los datos al PC.');
      releaseControls();
    }
  });

  analyzeButton?.addEventListener('click', async () => {
    if (!files.length) return;
    if (!window.LabPaddleOCR) {
      output.value = 'Error: no se cargó el adaptador PaddleOCR.';
      return;
    }

    const batch = [...files];
    const total = batch.length;
    isProcessing = true;
    awaitingSync = false;
    if (cameraButton) cameraButton.disabled = true;
    if (uploadButton) uploadButton.disabled = true;
    output.value = '';
    progress.reset();
    progress.begin();
    progress.activate('files');
    progress.complete('files');
    setAnalyzeState();

    try {
      if (!engineReady) {
        progress.activate(engineStage === 'model' ? 'model' : 'library');
        // Si la precarga ya estaba en curso, initialize reutiliza la misma promesa.
        await LabPaddleOCR.initialize(handleEngineStage);
        engineReady = true;
        engineStage = 'ready';
      }
      progress.complete('library');
      progress.complete('model');

      const pages = [];
      const debug = [];
      for (let index = 0; index < total; index++) {
        const page = await LabPaddleOCR.recognizeFile(batch[index], {
          onStage: stage => handleRecognitionStage(stage, index, total),
        });
        pages.push(page.text);
        debug.push({ metrics: page.metrics, angle: page.angle, rows: page.rows.length });
        progress.setPercent(ocrPercentForCompletedPages(index + 1, total));
      }

      progress.complete('ocr');
      progress.activate('geometry');
      const rawText = pages.filter(Boolean).join('\n\n');
      await Promise.resolve();
      progress.complete('geometry');

      const result = parseAndFormat(rawText);
      output.value = result.formatted || 'No se reconocieron datos de laboratorio con el formato conocido.';
      console.info('[LabScan OCR v12.4]', debug);

      files = [];

      if (result.formatted) {
        awaitingSync = true;
        progress.activate('sync');
        window.dispatchEvent(new CustomEvent('labscan:result', {
          detail: { text: result.formatted, parsed: result.parsed }
        }));
      } else {
        progress.finish();
        releaseControls();
      }
    } catch (error) {
      console.error(error);
      const detail = error?.message || String(error);
      output.value = `Error: ${detail}`;
      if (/PaddleOCR|modelo|WASM|ONNX|fetch|network/i.test(detail)) {
        output.value += '\n\nLa primera ejecución descarga el motor y los modelos OCR. Verifica la conexión y vuelve a intentarlo.';
      }
      progress.fail(detail);
      releaseControls();
    } finally {
      if (!awaitingSync && isProcessing) releaseControls();
    }
  });

  window.addEventListener('pagehide', () => {
    window.LabPaddleOCR?.dispose?.();
  });

  setAnalyzeState();
  startBackgroundWarmup();
})();
