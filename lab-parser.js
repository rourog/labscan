/*
 * LabScan parser v4
 * Parser universal orientado a OCR.
 *
 * Cambios principales:
 * - Los encabezados ya NO son requisito para encontrar analitos.
 * - Alias por laboratorio (incluye RASOMA) y nomenclatura clínica habitual.
 * - Contexto de sección usado solo para resolver ambigüedades, especialmente sangre vs EGO.
 * - Diferencia recuentos absolutos (#) de porcentajes (%) en la biometría.
 * - Toma el primer resultado después del analito y evita, en lo posible, el rango de referencia.
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

  const definitions = [
    // BIOMETRÍA HEMÁTICA ---------------------------------------------------
    lab('Biometría Hemática', 'LEUCOCITOS', 'Leu', [
      /LEUCOCITOS(?!\s*%)/,
      /WBC/,
    ]),
    differential('NEUTROFILOS', 'Neu', [/NEUTROFILOS?/, /NEUTROPHILS?/]),
    differential('LINFOCITOS', 'Lin', [/LINFOCITOS?/, /LYMPHOCYTES?/]),
    differential('MONOCITOS', 'Mon', [/MONOCITOS?/, /MONOCYTES?/]),
    differential('EOSINOFILOS', 'Eos', [/EOSINOFILOS?/, /EOSINOPHILS?/]),
    differential('BASOFILOS', 'Bas', [/BASOFILOS?/, /BASOPHILS?/]),
    lab('Biometría Hemática', 'ERITROCITOS', 'Eri', [
      /ERITROCITOS(?!\s+(?:NORMORFICOS|DISMORFICOS))/,
      /GLOBULOS\s+ROJOS/,
      /RBC/,
    ]),
    lab('Biometría Hemática', 'HEMOGLOBINA', 'Hb', [/HEMOGLOBINA/, /\bHB\b/]),
    lab('Biometría Hemática', 'HEMATOCRITO', 'Hto', [/HEMATOCRITO/, /\bHTO\b/, /\bHCT\b/]),
    lab('Biometría Hemática', 'VOLUMEN CORPUSCULAR MEDIO', 'VCM', [
      /VOLUMEN\s+CORPUSCULAR\s+MEDIO(?:\s*\(VCM\))?/,
      /\bVCM\b/,
      /\bMCV\b/,
    ]),
    lab('Biometría Hemática', 'HEMOGLOBINA CORPUSCULAR MEDIA', 'HCM', [
      /HEMOGLOBINA\s+CORPUSCULAR\s+MEDIA(?:\s*\(HCM\))?/,
      /HB\s+CORPUSCULAR\s+MEDIA(?:\s*\(HCM\))?/,
      /\bHCM\b/,
      /\bMCH\b/,
    ]),
    lab('Biometría Hemática', 'PLAQUETAS', 'Pla', [/PLAQUETAS?/, /\bPLT\b/]),
    lab('Biometría Hemática', 'VOLUMEN PLAQUETAR MEDIO', 'VPM', [
      /VOLUMEN\s+PLAQUETAR(?:IO)?\s+MEDIO/,
      /\bVPM\b/,
      /\bMPV\b/,
    ]),

    // QUÍMICA --------------------------------------------------------------
    lab('Química Sanguínea', 'GLUCOSA', 'Glucosa', [/GLUCOSA/, /GLUCOSE/]),
    lab('Química Sanguínea', 'UREA', 'Urea', [/\bUREA\b/]),
    lab('Química Sanguínea', 'CREATININA', 'Creatinina', [
      /CREATININA/,
      /CREATINlNA/,
      /CREATIN1NA/,
      /CREATININO/,
      /\bCREAT\b/,
    ]),
    lab('Química Sanguínea', 'ACIDO URICO', 'Ac. Urico', [/ACIDO\s+URICO/, /URIC\s+ACID/]),

    // FUNCIÓN HEPÁTICA / PANCREÁTICA -------------------------------------
    lab('Pruebas de Función Hepática', 'BILIRRUBINA TOTAL', 'BT', [/BILIRRUBINA\s+TOTAL/, /\bBT\b/]),
    lab('Pruebas de Función Hepática', 'BILIRRUBINA DIRECTA', 'BD', [/BILIRRUBINA\s+DIRECTA/, /\bBD\b/]),
    lab('Pruebas de Función Hepática', 'BILIRRUBINA INDIRECTA', 'BI', [/BILIRRUBINA\s+INDIRECTA/, /\bBI\b/]),
    lab('Pruebas de Función Hepática', 'OXALACETICA', 'TGO', [
      /ASPARTATO\s+AMINOTRANSFERASA(?:\s*TGO)?/,
      /TRANSAMINASA\s+OXALACETICA/,
      /OXALACETICA/,
      /\bTGO\b/,
      /\bAST\b/,
    ]),
    lab('Pruebas de Función Hepática', 'PIRUVICA', 'TGP', [
      /ALANINA\s+AMINOTRANSFERASA(?:\s*TGP)?/,
      /TRANSAMINASA\s+PIRUVICA/,
      /PIRUVICA/,
      /\bTGP\b/,
      /\bALT\b/,
    ]),
    lab('Pruebas de Función Hepática', 'FOSFATASA ALCALINA', 'FA', [/FOSFATASA\s+ALCALINA/, /\bFA\b/]),
    lab('Pruebas de Función Hepática', 'GAMAGLUTAMIL TRANSFERASA', 'GGT', [
      /GAMA\s*GLUTAMIL\s+TRANSFERASA/,
      /GAMAGLUTAMIL\s+TRANSFERASA/,
      /\bGGT\b/,
    ]),
    lab('Pruebas de Función Hepática', 'LACTICA', 'DHL', [
      /DESHIDROGENASA\s+LACTICA/,
      /LACTICA/,
      /\bDHL\b/,
      /\bLDH\b/,
    ]),
    lab('Pruebas de Función Hepática', 'ALBUMINA', 'Albumina', [/ALBUMINA/]),
    lab('Pruebas de Función Hepática', 'PROTEINAS TOTALES', 'PT', [/PROTEINAS\s+TOTALES/]),
    lab('Pruebas de Función Hepática', 'AMILASA', 'Amilasa', [/AMILASA/]),
    lab('Pruebas de Función Hepática', 'LIPASA', 'Lipasa', [/LIPASA/]),

    // ELECTROLITOS ---------------------------------------------------------
    lab('Electrolitos Sericos', 'SODIO', 'Na', [/SODIO/, /^NA\b/]),
    lab('Electrolitos Sericos', 'POTASIO', 'K', [/POTASIO/, /^K\b/]),
    lab('Electrolitos Sericos', 'CLORO', 'Cl', [/CLORURO/, /CLORO/, /^CL\b/]),
    lab('Electrolitos Sericos', 'CALCIO', 'Ca', [/CALCIO/, /^CA\b/]),
    lab('Electrolitos Sericos', 'FOSFORO', 'P', [/FOSFORO/]),
    lab('Electrolitos Sericos', 'MAGNESIO', 'Mg', [/MAGNESIO/, /^MG\b/]),

    // CARDIACAS ------------------------------------------------------------
    lab('Enzimas Cardiacas', 'CREATINFOSFOQUINASA', 'CPK', [/CREATINFOSFOQUINASA/, /\bCPK\b/, /\bCK\b/]),
    lab('Enzimas Cardiacas', 'CK-MB', 'CK-MB', [/CK[-\s]?MB/]),
    lab('Enzimas Cardiacas', 'TROPONINA', 'Troponina', [/TROPONINA(?:\s+[IT])?/]),
    lab('Enzimas Cardiacas', 'MIOGLOBINA', 'Mioglobina', [/MIOGLOBINA/]),

    // TIROIDES -------------------------------------------------------------
    lab('Perfil Tiroideo', 'T3 TOTAL', 'T3T', [/T3\s+TOTAL/]),
    lab('Perfil Tiroideo', 'T3 LIBRE', 'T3L', [/T3\s+LIBRE/]),
    lab('Perfil Tiroideo', 'T4 TOTAL', 'T4T', [/T4\s+TOTAL/]),
    lab('Perfil Tiroideo', 'T4 LIBRE', 'T4L', [/T4\s+LIBRE/]),
    lab('Perfil Tiroideo', 'TSH', 'TSH', [/\bTSH\b/]),

    // LÍPIDOS --------------------------------------------------------------
    lab('Perfil de Lipidos', 'COLESTEROL', 'CT', [/COLESTEROL(?:\s+TOTAL)?/]),
    lab('Perfil de Lipidos', 'HDL COLESTEROL', 'HDL', [/HDL(?:\s+COLESTEROL)?/]),
    lab('Perfil de Lipidos', 'LDL COLESTEROL', 'LDL', [/LDL(?:\s+COLESTEROL)?/]),
    lab('Perfil de Lipidos', 'VLDL COLESTEROL', 'VLDL', [/VLDL(?:\s+COLESTEROL)?/]),
    lab('Perfil de Lipidos', 'TRIGLICERIDOS', 'Triglicéridos', [/TRIGLICERIDOS/]),

    // COAGULACIÓN ----------------------------------------------------------
    lab('Tiempos de Coagulacion', 'TIEMPO DE PROTOMBINA', 'TP', [
      /TIEMPO\s+DE\s+PROT(?:R)?OMBINA/,
      /TIEMPO\s+PROT(?:R)?OMBINA/,
      /^TP\b/,
    ]),
    lab('Tiempos de Coagulacion', 'TIEMPO DE TROMBOPLASTINA PARCIAL', 'TTP', [
      /TIEMPO\s+DE\s+TROMBOPLASTINA\s+PARCIAL/,
      /TROMBOPLASTINA\s+PARCIAL/,
      /^TTPA?\b/,
      /^TPT\b/,
    ]),
    lab('Tiempos de Coagulacion', 'INR', 'INR', [/\bINR\b/]),

    // OTROS ----------------------------------------------------------------
    lab('Otros', '%HBA1C', 'HbA1c', [/%?HBA1C/, /HEMOGLOBINA\s+GLICOSILADA/]),
    lab('Otros', 'MICRO ALBUMINA', 'Microalbumina', [/MICRO\s*ALBUMINA/]),
    lab('Otros', 'PROCALCITONINA', 'Procalcitonina', [/PROCALCITONINA/, /\bPCT\b/]),
    lab('Otros', 'PROTEINA C REACTIVA', 'PCR', [/PROTEINA\s+C\s+REACTIVA/, /\bPCR\b/]),
    lab('Otros', 'NT-PROBNP', 'NT-proBNP', [/NT[-\s]?PROBNP/]),
    lab('Otros', 'VDRL', 'VDRL', [/\bVDRL\b/], { qualitative: true }),
    lab('Otros', 'HIV', 'HIV', [/\bHIV\b/, /\bVIH\b/], { qualitative: true }),
    lab('Otros', 'VIRUS HEPATITIS A', 'Hep A', [/HEPATITIS\s+A/], { qualitative: true }),
    lab('Otros', 'VIRUS HEPATITIS B', 'Hep B', [/HEPATITIS\s+B/], { qualitative: true }),
    lab('Otros', 'VIRUS HEPATITIS C', 'Hep C', [/HEPATITIS\s+C/], { qualitative: true }),
    lab('Otros', 'PRUEBA DE EMBARAZO', 'BHCG', [/PRUEBA\s+DE\s+EMBARAZO/, /BETA[-\s]?HCG/, /BHCG/], { qualitative: true }),
    lab('Otros', 'DIMERO D', 'Dímero D', [/DIMERO\s+D/]),
  ];

  const urineDefinitions = [
    urine('COLOR_ORINA', 'Color', [/^COLOR\b/], { qualitative: true }),
    urine('ASPECTO_ORINA', 'Aspecto', [/^ASPECTO\b/], { qualitative: true }),
    urine('DENSIDAD_ORINA', 'Densidad', [/^DENSIDAD\b/]),
    urine('PH_ORINA', 'pH', [/^PH\b/]),
    urine('NITRITOS_ORINA', 'Nitritos', [/^NITRITOS?\b/], { qualitative: true }),
    urine('GLUCOSA_ORINA', 'Glucosa', [/^GLUCOSA\b/], { qualitative: true }),
    urine('HB_ORINA', 'Hb', [/^HEMOGLOBINA\b/, /^HB\b/], { qualitative: true }),
    urine('LEUCOCITOS_ORINA', 'Leu', [/^LEUCOCITOS\b/]),
    urine('ERITROCITOS_ORINA', 'Eri', [/^ERITROCITOS(?:\s+NORMORFICOS)?\b/]),
    urine('CELULAS_ORINA', 'Células', [
      /^CELULAS\s+EPITELIO\s+URETRAL\b/,
      /^CELULAS\s+EPITELIALES?\b/,
      /^CELULAS\b/,
    ], { qualitative: true }),
    urine('BACTERIAS_ORINA', 'Bacterias', [/^BACTERIAS\b/], { qualitative: true }),
    urine('CRISTALES_ORINA', 'Cristales', [/^CRISTALES\b/], { qualitative: true }),
    urine('CILINDROS_ORINA', 'Cilindros', [/^CILINDROS\b/], { qualitative: true }),
    urine('MOCO_ORINA', 'Moco', [/^MOCO\b/], { qualitative: true }),
    urine('LEVADURAS_ORINA', 'Levaduras', [/^LEVADURAS\b/], { qualitative: true }),
    urine('PARASITOS_ORINA', 'Parásitos', [/^PARASITOS\b/], { qualitative: true }),
  ];

  const sectionMarkers = [
    ['Examen General de Orina', /(?:UROANALISIS|EXAMEN\s+GENERAL\s+DE\s+ORINA|\bEGO\b)/],
    ['Biometría Hemática', /(?:HEMATOLOGIA(?:\s+Y\s+HEMOSTASIA)?|CITOMETRIA\s+HEMATICA(?:\s+COMPLETA)?|BIOMETRIA\s+HEMATICA)/],
    ['Tiempos de Coagulacion', /(?:TIEMPO\s+DE\s+PROT(?:R)?OMBINA|TIEMPO\s+DE\s+TROMBOPLASTINA\s+PARCIAL|TIEMPOS?\s+DE\s+COAGULACION|COAGULACION)/],
    ['Pruebas de Función Hepática', /(?:PERFIL\s+HEPATICO|PRUEBAS?\s+DE\s+FUNCION(?:AMIENTO)?\s+HEPATICA|FUNCION\s+HEPATICA)/],
    ['Electrolitos Sericos', /(?:ELECTROLITOS(?:\s+SERICOS)?|K\s*\/\s*NA\s*\/\s*CL)/],
    ['Química Sanguínea', /(?:BIOQUIMICA\s+CLINICA|QUIMICA\s+SANGUINEA|QUIMICA)/],
    ['Perfil de Lipidos', /(?:PERFIL\s+DE\s+LIPIDOS|PERFIL\s+LIPIDICO)/],
    ['Perfil Tiroideo', /PERFIL\s+TIROIDEO/],
    ['Enzimas Cardiacas', /ENZIMAS\s+CARDIACAS/],
  ];

  function lab(section, key, short, aliases, options = {}) {
    return { section, key, short, aliases, ...options };
  }

  function differential(key, short, bases) {
    const aliases = [];
    // Primero formatos absolutos explícitos (# / ABS). Luego nombre simple,
    // pero nunca una línea porcentual.
    for (const base of bases) {
      aliases.push(new RegExp(`${base.source}\\s*(?:#|ABS(?:OLUTOS?)?)(?=\\s|$)`, 'i'));
    }
    for (const base of bases) {
      aliases.push(new RegExp(`${base.source}(?!\\s*%)\\b`, 'i'));
    }
    return lab('Biometría Hemática', key, short, aliases, { rejectPercentLine: true });
  }

  function urine(key, short, aliases, options = {}) {
    return { section: 'Examen General de Orina', key, short, aliases, urineOnly: true, ...options };
  }

  function stripAccents(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function normalizeOCR(raw) {
    return stripAccents(raw)
      .replace(/\r\n?/g, '\n')
      .replace(/[‐‑–—]/g, '-')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\t/g, ' ')
      .replace(/[\u00a0]/g, ' ')
      .replace(/[ ]+\n/g, '\n')
      .replace(/\n[ ]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function normalizeLine(line) {
    return stripAccents(line)
      .toUpperCase()
      .replace(/[‐‑–—]/g, '-')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\t/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function detectSection(line) {
    for (const [section, pattern] of sectionMarkers) {
      if (pattern.test(line)) return section;
    }
    return null;
  }

  function buildLines(raw) {
    const normalized = normalizeOCR(raw);
    const rawLines = normalized.split('\n');
    const rows = [];
    let context = 'Global';

    for (let index = 0; index < rawLines.length; index++) {
      const text = normalizeLine(rawLines[index]);
      if (!text) continue;
      const section = detectSection(text);
      if (section) context = section;
      rows.push({ index, text, context });
    }

    // Rescate si OCR perdió "UROANÁLISIS": COLOR + ASPECTO + DENSIDAD suele
    // identificar el inicio del EGO con bastante especificidad.
    if (!rows.some(row => row.context === 'Examen General de Orina')) {
      let urineStart = -1;
      for (let i = 0; i < rows.length; i++) {
        if (!/^COLOR\b/.test(rows[i].text)) continue;
        const nearby = rows.slice(i, i + 14).map(r => r.text).join('\n');
        const score = [
          /^ASPECTO\b/m,
          /^DENSIDAD\b/m,
          /^NITRITOS?\b/m,
          /^BACTERIAS\b/m,
          /^LEUCOCITOS\b/m,
        ].filter(rx => rx.test(nearby)).length;
        if (score >= 3) {
          urineStart = i;
          break;
        }
      }
      if (urineStart >= 0) {
        for (let i = urineStart; i < rows.length; i++) rows[i].context = 'Examen General de Orina';
      }
    }

    return rows;
  }

  function aliasMatch(line, alias) {
    const flags = alias.flags.replace('g', '');
    const rx = new RegExp(alias.source, flags);
    return line.match(rx);
  }

  function cleanTail(tail) {
    return String(tail || '')
      .replace(/^[\s:;=,.-]+/, '')
      .replace(/(\d),(\d)/g, '$1.$2')
      .trim();
  }

  function cleanOCRNumber(token) {
    let value = String(token || '').trim().replace(/,/g, '.');
    // Correcciones conservadoras solo dentro de un token con aspecto numérico.
    if (/^[<>]?\s*[0-9OIL.]+$/i.test(value)) {
      value = value
        .replace(/O/gi, '0')
        .replace(/[IL]/gi, '1');
    }
    return value;
  }

  function extractQualitative(tail) {
    const q = tail.match(/^(?:"?([ABO]{1,2})"?\s+)?(POSITIVO|NEGATIVO|REACTIVO|NO\s+REACTIVO|NO\s+SE\s+OBSERVAN|ESCAS[OA]S?|MODERAD[OA]S?|ABUNDANTES?|INCONTABLES?|NORMAL|AMARILLO|AMBAR|ROJO|CAFE|CLARO|TURBIO|TRANSPARENTE|OPALESCENTE)(?:\s+(SUPERFICIAL(?:ES)?))?/i);
    if (!q) return null;
    return q[0].replace(/"/g, '').replace(/\s+/g, ' ').trim();
  }

  function extractNumeric(tail) {
    // Resultado habitual, con posibilidad de /CAMPO o unidades de conteo.
    const match = tail.match(/^[<>]?\s*-?[0-9OIL]+(?:[.,][0-9OIL]+)?(?:\s*(?:\/\s*CAMPO|X\s*10(?:\^|E)?-?\d+(?:\s*\/\s*[A-ZµU]+)?))?/i);
    if (!match) return null;

    let value = match[0].replace(/\s+/g, ' ').trim();
    const field = value.match(/^(.*?)(\s*\/\s*CAMPO)$/i);
    if (field) return `${cleanOCRNumber(field[1])} /CAMPO`;

    // Para la salida clínica no necesitamos repetir unidades; conserva solo el
    // valor, pero sí el comparador si existe.
    const first = value.match(/^[<>]?\s*-?[0-9OIL]+(?:[.,][0-9OIL]+)?/i);
    return first ? cleanOCRNumber(first[0]).replace(/\s+/g, '') : null;
  }

  function extractValueFromRow(row, def) {
    for (const alias of def.aliases) {
      const match = aliasMatch(row.text, alias);
      if (!match) continue;

      if (def.rejectPercentLine && /%/.test(row.text.slice(match.index))) continue;

      const tail = cleanTail(row.text.slice(match.index + match[0].length));
      if (!tail) return { matched: true, value: null };

      if (def.qualitative || def.urineOnly) {
        const qualitative = extractQualitative(tail);
        if (qualitative) return { matched: true, value: qualitative };
      }

      const numeric = extractNumeric(tail);
      if (numeric !== null) return { matched: true, value: numeric };

      const qualitative = extractQualitative(tail);
      if (qualitative) return { matched: true, value: qualitative };

      return { matched: true, value: null };
    }
    return { matched: false, value: null };
  }

  function nextLineValue(rows, index, def) {
    // Solo rescate inmediato. Evita saltar varias líneas y terminar tomando el
    // rango de referencia de otra prueba.
    const next = rows[index + 1];
    if (!next || next.context !== rows[index].context) return null;
    const tail = cleanTail(next.text);
    if (!tail) return null;

    if (def.qualitative || def.urineOnly) {
      const qualitative = extractQualitative(tail);
      if (qualitative) return qualitative;
    }
    return extractNumeric(tail) || extractQualitative(tail);
  }

  function rowsForDefinition(rows, def) {
    if (def.urineOnly) return rows.filter(row => row.context === 'Examen General de Orina');
    // Los analitos sanguíneos nunca deben tomar resultados del bloque de orina.
    return rows.filter(row => row.context !== 'Examen General de Orina');
  }

  function findDefinitionValue(rows, def) {
    const candidates = rowsForDefinition(rows, def);

    // Preferencia 1: contexto de la sección esperada.
    const ordered = [
      ...candidates.filter(row => row.context === def.section),
      ...candidates.filter(row => row.context !== def.section),
    ];

    const visited = new Set();
    for (const row of ordered) {
      const id = `${row.index}:${row.text}`;
      if (visited.has(id)) continue;
      visited.add(id);

      const result = extractValueFromRow(row, def);
      if (!result.matched) continue;
      if (result.value !== null) return result.value;

      const originalIndex = rows.findIndex(r => r.index === row.index && r.text === row.text);
      if (originalIndex >= 0) {
        const rescued = nextLineValue(rows, originalIndex, def);
        if (rescued !== null) return rescued;
      }
    }
    return null;
  }

  function findGroupAndRh(rows) {
    const nonUrine = rows.filter(row => row.context !== 'Examen General de Orina');
    for (let i = 0; i < nonUrine.length; i++) {
      const line = nonUrine[i].text;
      const marker = line.match(/GRUPO\s+(?:SANGUINEO\s+Y\s+FACTOR\s+RH(?:D)?|Y\s+RH)/);
      if (!marker) continue;

      const tail = cleanTail(line.slice(marker.index + marker[0].length));
      const same = tail.match(/"?\b(AB|A|B|O)\b"?\s*(POSITIVO|NEGATIVO)/i);
      if (same) return `${same[1].toUpperCase()} ${same[2].toUpperCase()}`;

      const next = nonUrine[i + 1]?.text || '';
      const nextMatch = next.match(/"?\b(AB|A|B|O)\b"?\s*(POSITIVO|NEGATIVO)/i);
      if (nextMatch) return `${nextMatch[1].toUpperCase()} ${nextMatch[2].toUpperCase()}`;
    }
    return null;
  }

  function parseLabResults(raw) {
    const rows = buildLines(raw);
    const data = {};

    for (const def of definitions) {
      const value = findDefinitionValue(rows, def);
      if (value === null) continue;
      if (!data[def.section]) data[def.section] = [];
      data[def.section].push({ key: def.key, short: def.short, value });
    }

    for (const def of urineDefinitions) {
      const value = findDefinitionValue(rows, def);
      if (value === null) continue;
      if (!data[def.section]) data[def.section] = [];
      data[def.section].push({ key: def.key, short: def.short, value });
    }

    const groupRh = findGroupAndRh(rows);
    if (groupRh) {
      if (!data.Otros) data.Otros = [];
      data.Otros.unshift({ key: 'GRUPO Y RH', short: 'Grupo/RH', value: groupRh });
    }

    return data;
  }

  function formatForClipboard(parsed) {
    const lines = [];
    for (const section of sectionsOrder) {
      const items = parsed[section];
      if (!items?.length) continue;
      lines.push(`${section}: ${items.map(item => `${item.short} ${item.value}`).join(', ')}`);
    }
    return lines.join('\n').trim();
  }

  function countResults(parsed) {
    return Object.values(parsed).reduce((sum, items) => sum + (items?.length || 0), 0);
  }

  window.LabParser = {
    parseLabResults,
    formatForClipboard,
    countResults,
    normalizeOCR,
    sectionsOrder,
  };
})();
