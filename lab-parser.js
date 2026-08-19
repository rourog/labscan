/*
 * LabScan parser
 * Adaptado de "Copiar Labs 3.0 (Triage Visual + Cálculos Corregidos)".
 * Se conserva la lógica de secciones, abreviaturas y orden de salida.
 * La captura de valores se endurece para tolerar texto OCR.
 */

(() => {
  'use strict';

  const sectionsOrder = [
    'Biometría Hemática',
    'Química Sanguínea',
    'Pruebas de Función Hepática',
    'Electrolitos Sericos',
    'Enzimas Cardiacas',
    'Perfil Tiroideo',
    'Perfil de Lipidos',
    'Tiempos de Coagulacion',
    'Examen General de Orina',
    'Otros',
  ];

  const labDefinitions = {
    'GRUPO Y RH': { short: 'Grupo/RH', units: '' },
    'PRUEBA DE EMBARAZO': { short: 'BHCG', units: '' },
    'DIMERO D': { short: 'Dímero D', units: 'ng/mL' },
    'LEUCOCITOS': { short: 'Leu', units: '10^3/µL' },
    'NEUTROFILOS': { short: 'Neu', units: '10^3/µL' },
    'LINFOCITOS': { short: 'Lin', units: '10^3/µL' },
    'MONOCITOS': { short: 'Mon', units: '10^3/µL' },
    'EOSINOFILOS': { short: 'Eos', units: '10^3/µL' },
    'BASOFILOS': { short: 'Bas', units: '10^6/µL' },
    'ERITROCITOS': { short: 'Eri', units: 'x10^6/µL' },
    'HEMOGLOBINA': { short: 'Hb', units: 'g/dL' },
    'HEMATOCRITO': { short: 'Hto', units: '%' },
    'VOLUMEN CORPUSCULAR MEDIO': { short: 'VCM', units: 'fL' },
    'HEMOGLOBINA CORPUSCULAR MEDIA': { short: 'HCM', units: 'pg' },
    'PLAQUETAS': { short: 'Pla', units: 'x10^3/µL' },
    'VOLUMEN PLAQUETAR MEDIO': { short: 'VPM', units: 'fL' },
    'GLUCOSA': { short: 'Glucosa', units: 'mg/dL' },
    'UREA': { short: 'Urea', units: 'mg/dL' },
    'CREATININA': { short: 'Creatinina', units: 'mg/dL' },
    'ACIDO URICO': { short: 'Ac. Urico', units: 'mg/dL' },
    'BILIRRUBINA TOTAL': { short: 'BT', units: 'mg/dL' },
    'BILIRRUBINA DIRECTA': { short: 'BD', units: 'mg/dL' },
    'BILIRRUBINA INDIRECTA': { short: 'BI', units: 'mg/dL' },
    'OXALACETICA': { short: 'TGO', units: 'U/L' },
    'PIRUVICA': { short: 'TGP', units: 'U/L' },
    'FOSFATASA ALCALINA': { short: 'FA', units: 'U/L' },
    'GAMAGLUTAMIL TRANSFERASA': { short: 'GGT', units: 'U/L' },
    'LACTICA': { short: 'DHL', units: 'U/L' },
    'ALBUMINA': { short: 'Albumina', units: 'g/dL' },
    'PROTEINAS TOTALES': { short: 'PT', units: 'g/dL' },
    'AMILASA': { short: 'Amilasa', units: 'U/L' },
    'LIPASA': { short: 'Lipasa', units: 'U/L' },
    'SODIO': { short: 'Na', units: 'mEq/L' },
    'POTASIO': { short: 'K', units: 'mEq/L' },
    'CLORO': { short: 'Cl', units: 'mEq/L' },
    'CALCIO': { short: 'Ca', units: 'mg/dL' },
    'FOSFORO': { short: 'P', units: 'mg/dL' },
    'MAGNESIO': { short: 'Mg', units: 'mg/dL' },
    'CREATINFOSFOQUINASA': { short: 'CPK', units: 'U/L' },
    'CK-MB': { short: 'CK-MB', units: 'U/L' },
    'TROPONINA': { short: 'Troponina', units: 'ng/mL' },
    'MIOGLOBINA': { short: 'Mioglobina', units: 'ng/mL' },
    'T3 TOTAL': { short: 'T3T', units: 'ng/dL' },
    'T3 LIBRE': { short: 'T3L', units: 'pg/mL' },
    'T4 TOTAL': { short: 'T4T', units: 'µg/dL' },
    'T4 LIBRE': { short: 'T4L', units: 'ng/dL' },
    'TSH': { short: 'TSH', units: 'µIU/mL' },
    'COLESTEROL': { short: 'CT', units: 'mg/dL' },
    'HDL COLESTEROL': { short: 'HDL', units: 'mg/dL' },
    'LDL COLESTEROL': { short: 'LDL', units: 'mg/dL' },
    'VLDL COLESTEROL': { short: 'VLDL', units: 'mg/dL' },
    'TRIGLICERIDOS': { short: 'Triglicéridos', units: 'mg/dL' },
    'TIEMPO DE PROTOMBINA': { short: 'TP', units: 'seg' },
    'TIEMPO DE TROMBOPLASTINA PARCIAL': { short: 'TTP', units: 'seg' },
    'INR': { short: 'INR', units: '' },
    'ASPECTO_ORINA': { short: 'Aspecto', units: '' },
    'COLOR_ORINA': { short: 'Color', units: '' },
    'GLUCOSA_ORINA': { short: 'Glucosa', units: '' },
    'DENSIDAD_ORINA': { short: 'Densidad', units: '' },
    'PH_ORINA': { short: 'pH', units: '' },
    'NITRITOS_ORINA': { short: 'Nitritos', units: '' },
    'BACTERIAS_ORINA': { short: 'Bacterias', units: '' },
    'HB_ORINA': { short: 'Hb', units: '' },
    'LEUCOCITOS_ORINA': { short: 'Leu', units: '' },
    'ERITROCITOS_ORINA': { short: 'Eri', units: '' },
    'CELULAS_ORINA': { short: 'Células', units: '' },
    'CRISTALES_ORINA': { short: 'Cristales', units: '' },
    'CILINDROS_ORINA': { short: 'Cilindros', units: '' },
    'MOCO_ORINA': { short: 'Moco', units: '' },
    'LEVADURAS_ORINA': { short: 'Levaduras', units: '' },
    'PARASITOS_ORINA': { short: 'Parásitos', units: '' },
    '%HBA1C': { short: 'HbA1c', units: '%' },
    'MICRO ALBUMINA': { short: 'Microalbumina', units: 'mg/dL' },
    'PROCALCITONINA': { short: 'Procalcitonina', units: 'ng/mL' },
    'PROTEINA C REACTIVA': { short: 'PCR', units: 'mg/L' },
    'NT-PROBNP': { short: 'NT-proBNP', units: 'pg/mL' },
    'VDRL': { short: 'VDRL', units: '' },
    'HIV': { short: 'HIV', units: '' },
    'VIRUS HEPATITIS A': { short: 'Hep A', units: '' },
    'VIRUS HEPATITIS B': { short: 'Hep B', units: '' },
    'VIRUS HEPATITIS C': { short: 'Hep C', units: '' },
  };

  const aliases = {
    'NEUTROFILOS': ['NEUTROFILOS', 'NEUTROFILOS ABS', 'NEUTROFILOS ABSOLUTOS'],
    'LINFOCITOS': ['LINFOCITOS', 'LINFOCITOS ABS', 'LINFOCITOS ABSOLUTOS'],
    'HEMOGLOBINA': ['HEMOGLOBINA', 'HB'],
    'HEMATOCRITO': ['HEMATOCRITO', 'HTO'],
    'CREATININA': ['CREATININA', 'CREATINlNA', 'CREATIN1NA'],
    'POTASIO': ['POTASIO', 'POTASlO', 'P0TASIO'],
    'SODIO': ['SODIO', 'S0DIO'],
    'PLAQUETAS': ['PLAQUETAS', 'PLAQUETA'],
    'TIEMPO DE PROTOMBINA': ['TIEMPO DE PROTOMBINA', 'TIEMPO PROTOMBINA', 'TP'],
    'TIEMPO DE TROMBOPLASTINA PARCIAL': ['TIEMPO DE TROMBOPLASTINA PARCIAL', 'TROMBOPLASTINA PARCIAL', 'TTP', 'TPT'],
    'PROTEINA C REACTIVA': ['PROTEINA C REACTIVA', 'PCR'],
    'PROCALCITONINA': ['PROCALCITONINA', 'PCT'],
    'CK-MB': ['CK-MB', 'CK MB', 'CKMB'],
    'TROPONINA': ['TROPONINA', 'TROPONINA I', 'TROPONINA T'],
  };

  const sectionPatterns = [
    ['Biometría Hemática', /(?:HEMATOLOGIA|BIOMETRIA\s+HEMATICA)/i],
    ['Química Sanguínea', /(?:QUIMICA(?:\s+SANGUINEA)?)/i],
    ['Pruebas de Función Hepática', /PRUEBAS?\s+DE\s+FUNCION(?:AMIENTO)?\s+HEPATIC[AO]|FUNCION\s+HEPATICA/i],
    ['Tiempos de Coagulacion', /COAGULACION|TIEMPOS?\s+DE\s+COAGULACION/i],
    ['Electrolitos Sericos', /ELECTROLITOS(?:\s+SERICOS)?|FUNCION\s+RENAL/i],
    ['Perfil de Lipidos', /PERFIL\s+DE\s+LIPIDOS|LIPIDOS/i],
    ['Perfil Tiroideo', /PERFIL\s+TIROIDEO|TIROIDES/i],
    ['Enzimas Cardiacas', /ENZIMAS\s+CARDIACAS/i],
    ['Examen General de Orina', /ORINAS?|EXAMEN\s+GENERAL\s+DE\s+ORINA|EGO/i],
    ['Otros', /INMUNOLOGIA|VIROLOGIA|MARCADORES\s+TUMORALES|OTROS/i],
  ];

  const sectionWanted = {
    'Biometría Hemática': ['LEUCOCITOS','NEUTROFILOS','LINFOCITOS','MONOCITOS','EOSINOFILOS','BASOFILOS','ERITROCITOS','HEMOGLOBINA','HEMATOCRITO','VOLUMEN CORPUSCULAR MEDIO','HEMOGLOBINA CORPUSCULAR MEDIA','PLAQUETAS','VOLUMEN PLAQUETAR MEDIO'],
    'Química Sanguínea': ['GLUCOSA','UREA','CREATININA','ACIDO URICO'],
    'Pruebas de Función Hepática': ['BILIRRUBINA TOTAL','BILIRRUBINA DIRECTA','BILIRRUBINA INDIRECTA','OXALACETICA','PIRUVICA','FOSFATASA ALCALINA','GAMAGLUTAMIL TRANSFERASA','LACTICA','ALBUMINA','PROTEINAS TOTALES','AMILASA','LIPASA'],
    'Electrolitos Sericos': ['SODIO','POTASIO','CLORO','CALCIO','FOSFORO','MAGNESIO'],
    'Tiempos de Coagulacion': ['TIEMPO DE PROTOMBINA','TIEMPO DE TROMBOPLASTINA PARCIAL','INR'],
    'Perfil de Lipidos': ['COLESTEROL','HDL COLESTEROL','LDL COLESTEROL','VLDL COLESTEROL','TRIGLICERIDOS'],
    'Perfil Tiroideo': ['T3 TOTAL','T3 LIBRE','T4 TOTAL','T4 LIBRE','TSH'],
    'Enzimas Cardiacas': ['CREATINFOSFOQUINASA','CK-MB','TROPONINA','MIOGLOBINA'],
    'Otros': ['%HBA1C','MICRO ALBUMINA','PROCALCITONINA','PROTEINA C REACTIVA','NT-PROBNP','VDRL','HIV','VIRUS HEPATITIS A','VIRUS HEPATITIS B','VIRUS HEPATITIS C','GRUPO Y RH','PRUEBA DE EMBARAZO','DIMERO D'],
  };

  const urineWanted = [
    ['COLOR','COLOR_ORINA'], ['ASPECTO','ASPECTO_ORINA'], ['GLUCOSA','GLUCOSA_ORINA'],
    ['DENSIDAD','DENSIDAD_ORINA'], ['HB','HB_ORINA'], ['PH','PH_ORINA'],
    ['NITRITOS','NITRITOS_ORINA'], ['LEUCOCITOS','LEUCOCITOS_ORINA'], ['ERITROCITOS','ERITROCITOS_ORINA'],
    ['CELULAS','CELULAS_ORINA'], ['CRISTALES','CRISTALES_ORINA'], ['CILINDROS','CILINDROS_ORINA'],
    ['BACTERIAS','BACTERIAS_ORINA'], ['MOCO','MOCO_ORINA'], ['LEVADURAS','LEVADURAS_ORINA'], ['PARASITOS','PARASITOS_ORINA'],
  ];

  function stripAccents(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function normalizeOCR(raw) {
    return stripAccents(raw)
      .replace(/\r/g, '\n')
      .replace(/[‐‑–—]/g, '-')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\t/g, ' ')
      .replace(/[ ]{2,}/g, ' ')
      .replace(/\n[ ]+/g, '\n')
      .replace(/[ ]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function normalizedForMatch(raw) {
    return normalizeOCR(raw).toUpperCase();
  }

  function segmentTextBlocks(raw) {
    const text = normalizedForMatch(raw);
    const hits = [];
    for (const [name, rx] of sectionPatterns) {
      const flags = rx.flags.includes('g') ? rx.flags : rx.flags + 'g';
      const globalRx = new RegExp(rx.source, flags);
      for (const match of text.matchAll(globalRx)) hits.push({ name, index: match.index, len: match[0].length });
    }
    hits.sort((a, b) => a.index - b.index);

    if (!hits.length) return { Global: text };

    const blocks = {};
    hits.forEach((hit, i) => {
      const end = i < hits.length - 1 ? hits[i + 1].index : text.length;
      blocks[hit.name] = (blocks[hit.name] || '') + '\n' + text.slice(hit.index, end);
    });
    return blocks;
  }

  function escapeRx(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function cleanNumericCandidate(value) {
    let v = String(value || '').trim();
    v = v.replace(/^[=:;,.\-\s]+/, '').trim();
    // OCR: coma decimal => punto. Mantiene signos y comparadores.
    v = v.replace(/(\d),(\d)/g, '$1.$2');
    // Si el token es predominantemente numérico, corrige errores OCR comunes.
    if (/^[<>]?\s*[0-9OolI.,]+/.test(v)) {
      v = v.replace(/(?<=\d)[Oo](?=\d)/g, '0')
           .replace(/(?<=\d)[Il](?=\d)/g, '1');
    }
    return v;
  }

  function extractValueFromLine(line, labels) {
    for (const label of labels) {
      const rx = new RegExp(`(?:^|\\b)${escapeRx(label)}\\b\\s*[:=\-]?\\s*(.*)$`, 'i');
      const m = line.match(rx);
      if (!m) continue;
      let tail = cleanNumericCandidate(m[1]);
      if (!tail) continue;

      // Prioriza el primer resultado clínico razonable; conserva textos cualitativos para EGO/serologías.
      const qualitative = tail.match(/^(POSITIVO|NEGATIVO|REACTIVO|NO REACTIVO|NO SE OBSERVAN|ESCAS[OA]S?|MODERAD[OA]S?|ABUNDANTES?|INCONTABLES?|NORMAL|TRANSPARENTE|TURBIO|AMARILLO|AMBAR|ROJO|CAFE|CLARO|OPALESCENTE)(?:\b.*)?$/i);
      if (qualitative) return qualitative[0].trim();

      const numeric = tail.match(/^[<>]?\s*-?\d+(?:\.\d+)?(?:\s*(?:x|X|×)\s*10\^?\d+)?/);
      if (numeric) return numeric[0].replace(/\s+/g, ' ').trim();

      const compact = tail.split(/\s{2,}|\t/)[0].trim();
      if (compact && compact.length <= 36) return compact;
    }
    return null;
  }

  function findValue(blockText, key) {
    const labels = aliases[key] || [key];
    const lines = normalizedForMatch(blockText).split('\n').map(x => x.trim()).filter(Boolean);

    // 1) Resultado en la misma línea.
    for (const line of lines) {
      const value = extractValueFromLine(line, labels);
      if (value !== null) return value;
    }

    // 2) OCR puede separar etiqueta y valor en dos líneas.
    for (let i = 0; i < lines.length - 1; i++) {
      if (labels.some(label => new RegExp(`^${escapeRx(label)}\\b`, 'i').test(lines[i]))) {
        const next = cleanNumericCandidate(lines[i + 1]);
        const numeric = next.match(/^[<>]?\s*-?\d+(?:\.\d+)?/);
        if (numeric) return numeric[0].trim();
      }
    }
    return null;
  }

  function buildItems(blockText, keys) {
    return keys.map(key => {
      const value = findValue(blockText, key);
      if (value === null) return null;
      const def = labDefinitions[key] || { short: key, units: '' };
      return { key, short: def.short, units: def.units, value };
    }).filter(Boolean);
  }

  function parseUrine(blockText) {
    const out = [];
    for (const [label, uniqueKey] of urineWanted) {
      const value = findValue(blockText, label);
      if (value === null) continue;
      const def = labDefinitions[uniqueKey];
      out.push({ key: uniqueKey, short: def.short, units: def.units, value });
    }
    return out;
  }

  function parseLabResults(raw) {
    const blocks = segmentTextBlocks(raw);
    const data = {};

    for (const [section, keys] of Object.entries(sectionWanted)) {
      const source = blocks[section] || (blocks.Global ? blocks.Global : '');
      if (!source) continue;
      const items = buildItems(source, keys);
      if (items.length) data[section] = items;
    }

    const urineSource = blocks['Examen General de Orina'];
    if (urineSource) {
      const items = parseUrine(urineSource);
      if (items.length) data['Examen General de Orina'] = items;
    }

    // Igual que el extractor original: algunos estudios se buscan globalmente porque pueden venir fuera de su sección.
    const global = normalizedForMatch(raw);
    const extras = ['GRUPO Y RH','PRUEBA DE EMBARAZO','DIMERO D','LIPASA','PROCALCITONINA','PROTEINA C REACTIVA'];
    const extraItems = buildItems(global, extras);
    if (extraItems.length) {
      const seen = new Set((data.Otros || []).map(x => `${x.key}:${x.value}`));
      data.Otros = (data.Otros || []).concat(extraItems.filter(x => !seen.has(`${x.key}:${x.value}`)));
    }

    return data;
  }

  function formatForClipboard(parsed) {
    const lines = [];
    for (const sec of sectionsOrder) {
      const arr = parsed[sec];
      if (!arr || !arr.length) continue;
      const items = arr.map(it => `${it.short} ${it.value}`).join(', ');
      lines.push(`${sec}: ${items}`);
    }
    return lines.join('\n').trim();
  }

  function countResults(parsed) {
    return Object.values(parsed).reduce((sum, arr) => sum + (arr?.length || 0), 0);
  }

  window.LabParser = {
    parseLabResults,
    formatForClipboard,
    countResults,
    normalizeOCR,
    sectionsOrder,
  };
})();
