(() => {
  'use strict';

  const cameraButton = document.getElementById('cameraButton');
  const uploadButton = document.getElementById('uploadButton');
  const analyzeButton = document.getElementById('analyzeButton');
  const analyzeButtonLabel = document.getElementById('analyzeButtonLabel');
  const cameraInput = document.getElementById('cameraInput');
  const uploadInput = document.getElementById('uploadInput');
  const output = document.getElementById('output');

  const processingPanel = document.getElementById('processingPanel');
  const progressStage = document.getElementById('progressStage');
  const progressPercent = document.getElementById('progressPercent');
  const progressTrack = document.getElementById('progressTrack');
  const progressFill = document.getElementById('progressFill');
  const progressDetail = document.getElementById('progressDetail');
  const progressElapsed = document.getElementById('progressElapsed');
  const progressSteps = document.getElementById('progressSteps');

  let files = [];
  let preloadStarted = false;
  let engineReady = false;
  let isProcessing = false;

  const STEP_TARGETS = {
    files: 5,
    library: 10,
    model: 25,
    image: 35,
    ocr: 72,
    geometry: 82,
    parse: 90,
    format: 96,
    sync: 100,
  };

  const STEP_LABELS = {
    files: 'Archivos recibidos',
    library: 'Cargando biblioteca OCR',
    model: 'Inicializando PP-OCRv6',
    image: 'Preparando imagen',
    ocr: 'Extrayendo texto',
    geometry: 'Reconstruyendo tabla',
    parse: 'Interpretando laboratorios',
    format: 'Dando formato',
    sync: 'Enviando al PC',
  };

  class ProgressController {
    constructor() {
      this.percent = 0;
      this.activeStep = null;
      this.startedAt = 0;
      this.timer = null;
    }

    getStepElement(step) {
      return progressSteps?.querySelector(`[data-progress-step="${step}"]`) || null;
    }

    show() {
      if (processingPanel) processingPanel.hidden = false;
    }

    startClock() {
      if (this.startedAt) return;
      this.startedAt = performance.now();
      this.updateElapsed();
      this.timer = window.setInterval(() => this.updateElapsed(), 1000);
    }

    stopClock() {
      if (this.timer) window.clearInterval(this.timer);
      this.timer = null;
      this.updateElapsed();
    }

    updateElapsed() {
      if (!progressElapsed || !this.startedAt) return;
      const seconds = Math.max(0, Math.round((performance.now() - this.startedAt) / 1000));
      progressElapsed.textContent = `${seconds} s`;
    }

    reset() {
      this.stopClock();
      this.percent = 0;
      this.activeStep = null;
      this.startedAt = 0;
      if (progressSteps) {
        for (const el of progressSteps.querySelectorAll('[data-progress-step]')) {
          el.classList.remove('is-active', 'is-done', 'is-error');
        }
      }
      this.setPercent(0);
      if (progressStage) progressStage.textContent = 'Preparando análisis';
      if (progressDetail) progressDetail.textContent = 'Selecciona una imagen para comenzar.';
      if (progressElapsed) progressElapsed.textContent = '0 s';
      processingPanel?.classList.remove('is-error', 'is-complete');
      progressTrack?.classList.remove('is-busy');
    }

    setPercent(value) {
      const next = Math.max(this.percent, Math.min(100, Math.round(Number(value) || 0)));
      this.percent = next;
      if (progressPercent) progressPercent.textContent = `${next}%`;
      if (progressFill) progressFill.style.width = `${next}%`;
      if (progressTrack) progressTrack.setAttribute('aria-valuenow', String(next));
    }

    setDetail(text) {
      if (progressDetail && text) progressDetail.textContent = text;
    }

    activate(step, detail, options = {}) {
      this.show();
      this.startClock();
      processingPanel?.classList.remove('is-error', 'is-complete');
      if (this.activeStep && this.activeStep !== step) {
        this.getStepElement(this.activeStep)?.classList.remove('is-active');
      }
      this.activeStep = step;
      const el = this.getStepElement(step);
      el?.classList.remove('is-error');
      el?.classList.add('is-active');
      if (progressStage) progressStage.textContent = options.title || STEP_LABELS[step] || 'Procesando';
      if (detail) this.setDetail(detail);
      progressTrack?.classList.toggle('is-busy', options.busy !== false);
    }

    complete(step, detail) {
      this.show();
      const el = this.getStepElement(step);
      el?.classList.remove('is-active', 'is-error');
      el?.classList.add('is-done');
      if (this.activeStep === step) this.activeStep = null;
      this.setPercent(STEP_TARGETS[step] || this.percent);
      if (detail) this.setDetail(detail);
      progressTrack?.classList.remove('is-busy');
    }

    fail(step, message) {
      this.show();
      this.stopClock();
      processingPanel?.classList.add('is-error');
      progressTrack?.classList.remove('is-busy');
      const target = step || this.activeStep;
      if (target) {
        const el = this.getStepElement(target);
        el?.classList.remove('is-active');
        el?.classList.add('is-error');
      }
      if (progressStage) progressStage.textContent = 'No se pudo completar';
      if (message) this.setDetail(message);
    }

    finish(detail = 'Datos procesados y enviados correctamente.') {
      this.complete('sync', detail);
      this.setPercent(100);
      this.stopClock();
      processingPanel?.classList.add('is-complete');
      if (progressStage) progressStage.textContent = 'Completado';
      progressTrack?.classList.remove('is-busy');
    }
  }

  const progress = new ProgressController();
  progress.reset();

  function setAnalyzeLabel(text) {
    if (analyzeButtonLabel) analyzeButtonLabel.textContent = text;
    else if (analyzeButton) analyzeButton.textContent = text;
  }

  function setAnalyzeState() {
    analyzeButton.disabled = isProcessing || files.length === 0;
    if (isProcessing) setAnalyzeLabel('Procesando…');
    else setAnalyzeLabel(files.length > 1 ? `Analizar datos · ${files.length}` : 'Analizar datos');
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
    if (/Cargando biblioteca/i.test(text)) {
      progress.activate('library', 'Cargando el motor JavaScript de reconocimiento.', { busy: true });
      return;
    }
    if (/Biblioteca OCR lista/i.test(text)) {
      progress.complete('library', 'Biblioteca OCR cargada.');
      return;
    }
    if (/Descargando modelo|modelo OCR/i.test(text)) {
      progress.complete('library');
      progress.activate('model', 'PP-OCRv6 tiny · primera carga ~6 MB. Esta etapa puede tardar más la primera vez.', { busy: true });
      return;
    }
    if (/Motor OCR listo/i.test(text)) {
      engineReady = true;
      progress.complete('library');
      progress.complete('model', 'Motor OCR listo para analizar.');
    }
  }

  function warmUpOCR() {
    if (preloadStarted || !window.LabPaddleOCR) return;
    preloadStarted = true;
    LabPaddleOCR.initialize(handleEngineStage).then(() => {
      engineReady = true;
      progress.complete('library');
      progress.complete('model', 'Motor OCR listo para analizar.');
      if (!isProcessing) setAnalyzeState();
    }).catch(error => {
      preloadStarted = false;
      engineReady = false;
      console.warn('[LabScan] Precarga OCR falló:', error);
      progress.fail('model', error?.message || 'No se pudo cargar el motor OCR.');
      if (!isProcessing) setAnalyzeState();
    });
  }

  function addFiles(fileList) {
    const selected = Array.from(fileList || []).filter(file => file.type.startsWith('image/'));
    if (!selected.length) return;
    files.push(...selected);
    output.value = '';

    progress.reset();
    progress.show();
    progress.startClock();
    progress.complete('files', `${files.length} ${files.length === 1 ? 'imagen seleccionada' : 'imágenes seleccionadas'}.`);
    if (engineReady) {
      progress.complete('library');
      progress.complete('model', 'Motor OCR ya estaba cargado.');
    }

    setAnalyzeState();
    warmUpOCR();
    cameraInput.value = '';
    uploadInput.value = '';
  }

  function parseAndFormat(rawText) {
    if (!window.LabParser) throw new Error('No se cargó el intérprete de laboratorios.');

    progress.activate('parse', 'Normalizando texto y buscando analitos conocidos.', { busy: true });
    const normalized = LabParser.normalizeOCR(rawText);
    const parsed = LabParser.parseLabResults(normalized);
    progress.complete('parse', 'Datos de laboratorio interpretados.');

    progress.activate('format', 'Construyendo la salida con valores y unidades.', { busy: true });
    const formatted = LabParser.formatForClipboard(parsed);
    progress.complete('format', 'Formato listo para copiar.');

    return { parsed, formatted, normalized };
  }

  function ocrPercentForCompletedPages(completed, total) {
    return 35 + (72 - 35) * (completed / Math.max(1, total));
  }

  function handleRecognitionStage(stage, index, total) {
    const text = String(stage || '');
    const pageLabel = `hoja ${index + 1} de ${total}`;

    if (/Preparando imagen/i.test(text)) {
      if (index === 0) progress.activate('image', `Decodificando y ajustando resolución · ${pageLabel}.`, { busy: true });
      else progress.activate('ocr', `Preparando ${pageLabel} antes del OCR.`, { busy: true });
      return;
    }
    if (/Imagen preparada/i.test(text)) {
      if (index === 0) progress.complete('image', `Imagen preparada para reconocimiento.`);
      return;
    }
    if (/Reconociendo documento|Extrayendo texto/i.test(text)) {
      progress.activate('ocr', `PP-OCRv6 está leyendo ${pageLabel}. El tiempo depende de la resolución y del teléfono.`, { busy: true });
      return;
    }
    if (/Texto extraído/i.test(text)) {
      progress.setPercent(ocrPercentForCompletedPages(index + 1, total));
      progress.setDetail(`Texto extraído de ${index + 1}/${total} ${total === 1 ? 'hoja' : 'hojas'}.`);
      return;
    }
    if (/Reconstruyendo tabla/i.test(text)) {
      // La reconstrucción se realiza por hoja dentro del adaptador. La etapa global
      // se consolida después de terminar todas las inferencias.
      progress.setDetail(`Ordenando filas y columnas de ${pageLabel}.`);
    }
  }

  cameraButton?.addEventListener('click', () => openFilePicker(cameraInput));
  uploadButton?.addEventListener('click', () => openFilePicker(uploadInput));
  cameraInput?.addEventListener('change', event => addFiles(event.target.files));
  uploadInput?.addEventListener('change', event => addFiles(event.target.files));

  window.addEventListener('labscan:sync-state', event => {
    const state = event.detail?.state;
    if (state === 'sending') {
      progress.activate('sync', 'Transmitiendo únicamente los datos procesados a la sesión vinculada.', { busy: true });
    } else if (state === 'sent') {
      progress.finish('Datos procesados y enviados al PC.');
    } else if (state === 'error') {
      progress.fail('sync', event.detail?.message || 'Los datos se procesaron, pero no se pudieron enviar al PC.');
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
    cameraButton.disabled = true;
    uploadButton.disabled = true;
    setAnalyzeState();
    output.value = '';

    progress.show();
    progress.startClock();
    progress.complete('files', `${total} ${total === 1 ? 'imagen lista' : 'imágenes listas'} para analizar.`);

    try {
      if (!engineReady) {
        await LabPaddleOCR.initialize(handleEngineStage);
        engineReady = true;
      }
      progress.complete('library');
      progress.complete('model', 'PP-OCRv6 listo.');

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

      progress.complete('ocr', `OCR completado en ${total} ${total === 1 ? 'hoja' : 'hojas'}.`);
      progress.activate('geometry', 'Consolidando filas, columnas y resultados detectados.', { busy: true });
      const rawText = pages.filter(Boolean).join('\n\n');
      // La geometría por hoja ya se calculó en PaddleOCR; aquí consolidamos las páginas.
      await Promise.resolve();
      progress.complete('geometry', 'Estructura documental reconstruida.');

      const result = parseAndFormat(rawText);
      output.value = result.formatted || 'No se reconocieron datos de laboratorio con el formato conocido.';

      console.info('[LabScan OCR v12.2]', debug);

      if (result.formatted) {
        progress.activate('sync', 'Esperando confirmación de Firebase…', { busy: true });
        window.dispatchEvent(new CustomEvent('labscan:result', {
          detail: { text: result.formatted, parsed: result.parsed }
        }));
      } else {
        progress.setPercent(96);
        progress.stopClock();
        if (progressStage) progressStage.textContent = 'Análisis terminado';
        progress.setDetail('No se encontraron resultados reconocibles para enviar.');
      }

      files = [];
    } catch (error) {
      console.error(error);
      const detail = error?.message || String(error);
      output.value = `Error: ${detail}`;
      if (/PaddleOCR|modelo|WASM|ONNX|fetch|network/i.test(detail)) {
        output.value += '\n\nLa primera ejecución descarga el motor y los modelos OCR. Verifica la conexión y vuelve a intentarlo.';
      }
      progress.fail(null, detail);
    } finally {
      isProcessing = false;
      cameraButton.disabled = false;
      uploadButton.disabled = false;
      setAnalyzeState();
    }
  });

  window.addEventListener('pagehide', () => {
    progress.stopClock();
    window.LabPaddleOCR?.dispose?.();
  });

  setAnalyzeState();
})();
