(() => {
  'use strict';

  const cameraButton = document.getElementById('cameraButton');
  const uploadButton = document.getElementById('uploadButton');
  const analyzeButton = document.getElementById('analyzeButton');
  const analyzeButtonLabel = document.getElementById('analyzeButtonLabel');
  const cameraInput = document.getElementById('cameraInput');
  const uploadInput = document.getElementById('uploadInput');
  const output = document.getElementById('output');

  let files = [];

  function setAnalyzeLabel(text) {
    if (analyzeButtonLabel) analyzeButtonLabel.textContent = text;
    else if (analyzeButton) analyzeButton.textContent = text;
  }

  function setAnalyzeState() {
    analyzeButton.disabled = files.length === 0;
    setAnalyzeLabel(files.length > 1 ? `Analizar datos · ${files.length}` : 'Analizar datos');
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

  function formatOCR(rawText) {
    if (!window.LabParser) throw new Error('No se cargó el intérprete de laboratorios.');
    const normalized = LabParser.normalizeOCR(rawText);
    const parsed = LabParser.parseLabResults(normalized);
    const formatted = LabParser.formatForClipboard(parsed);
    return { parsed, formatted, normalized };
  }

  function progressForPage(index, total) {
    const start = 15;
    const end = 90;
    return Math.round(start + (end - start) * (index / Math.max(1, total)));
  }

  cameraButton?.addEventListener('click', () => openFilePicker(cameraInput));
  uploadButton?.addEventListener('click', () => openFilePicker(uploadInput));
  cameraInput?.addEventListener('change', event => addFiles(event.target.files));
  uploadInput?.addEventListener('change', event => addFiles(event.target.files));

  analyzeButton?.addEventListener('click', async () => {
    if (!files.length) return;
    if (!window.LabPaddleOCR) {
      output.value = 'Error: no se cargó el adaptador PaddleOCR.';
      return;
    }

    const batch = [...files];
    const total = batch.length;
    cameraButton.disabled = true;
    uploadButton.disabled = true;
    analyzeButton.disabled = true;
    output.value = '';

    try {
      setAnalyzeLabel('Preparando OCR · 0%');
      await LabPaddleOCR.initialize((stage, percent) => {
        setAnalyzeLabel(`${stage} · ${percent}%`);
      });

      const pages = [];
      const debug = [];
      for (let index = 0; index < total; index++) {
        const base = progressForPage(index, total);
        setAnalyzeLabel(`Analizando ${index + 1}/${total} · ${base}%`);
        const page = await LabPaddleOCR.recognizeFile(batch[index], {
          progressBase: base,
          onStage: stage => setAnalyzeLabel(`${stage} ${index + 1}/${total} · ${base}%`),
        });
        pages.push(page.text);
        debug.push({ metrics: page.metrics, angle: page.angle, rows: page.rows.length });
        setAnalyzeLabel(`Analizando ${index + 1}/${total} · ${progressForPage(index + 1, total)}%`);
      }

      setAnalyzeLabel('Interpretando datos · 95%');
      const result = formatOCR(pages.filter(Boolean).join('\n\n'));
      output.value = result.formatted || 'No se reconocieron datos de laboratorio con el formato conocido.';

      // Útil durante la migración sin exponer datos en Firebase ni en la interfaz.
      console.info('[LabScan OCR v12]', debug);

      if (result.formatted) {
        window.dispatchEvent(new CustomEvent('labscan:result', {
          detail: { text: result.formatted, parsed: result.parsed }
        }));
      }
      files = [];
      setAnalyzeLabel('Completado · 100%');
      await new Promise(resolve => setTimeout(resolve, 450));
    } catch (error) {
      console.error(error);
      const detail = error?.message || String(error);
      output.value = `Error: ${detail}`;
      if (/PaddleOCR|modelo|WASM|ONNX|fetch|network/i.test(detail)) {
        output.value += '\n\nLa primera ejecución descarga el motor y los modelos OCR. Verifica la conexión y vuelve a intentarlo.';
      }
    } finally {
      cameraButton.disabled = false;
      uploadButton.disabled = false;
      setAnalyzeState();
    }
  });

  window.addEventListener('pagehide', () => {
    window.LabPaddleOCR?.dispose?.();
  });

  setAnalyzeState();
})();
