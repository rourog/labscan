/*
 * LabScan parser v12
 * Parser universal orientado a OCR.
 *
 * Cambios principales:
 * - Los encabezados ya NO son requisito para encontrar analitos.
 * - Alias por laboratorio (incluye RASOMA) y nomenclatura clínica habitual.
 * - Contexto de sección usado solo para resolver ambigüedades, especialmente sangre vs EGO.
 * - Diferencia recuentos absolutos (#) de porcentajes (%) en la biometría.
 * - Conserva valor + unidad.
 * - Selecciona preferentemente el número asociado a la unidad esperada, evitando rangos de referencia.
 * - Compatible con filas estructuradas mediante geometría OCR y marcador de resultado.
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

  const sectionDisplayNames = {
    'Biometría Hemática': 'Biometría Hemática',
    'Química Sanguínea': 'Química Sanguínea',
    'Pruebas de Función Hepática': 'Pruebas de Función Hepática',
    'Electrolitos Sericos': 'Electrolitos Séricos',
    'Enzimas Cardiacas': 'Enzimas Cardíacas',
    'Perfil Tiroideo': 'Perfil Tiroideo',
    'Perfil de Lipidos': 'Perfil de Lípidos',
    'Tiempos de Coagulacion': 'Tiempos de Coagulación',
    'Examen General de Orina': 'Examen General de Orina',
    'Otros': 'Otros',
  };

  const sectionShortNames = {
    'Biometría Hemática': 'BH',
    'Química Sanguínea': 'QS',
    'Pruebas de Función Hepática': 'PFH',
    'Electrolitos Sericos': 'ES',
    'Enzimas Cardiacas': 'EC',
    'Perfil Tiroideo': 'Tiroides',
    'Perfil de Lipidos': 'Lípidos',
    'Tiempos de Coagulacion': 'Coagulación',
    'Examen General de Orina': 'EGO',
    'Otros': 'Otros',
  };

  const displayNames = {
    'GRUPO Y RH': 'Grupo sanguíneo y factor Rh',
    'LEUCOCITOS': 'Leucocitos',
    'NEUTROFILOS': 'Neutrófilos',
    'LINFOCITOS': 'Linfocitos',
    'MONOCITOS': 'Monocitos',
    'EOSINOFILOS': 'Eosinófilos',
    'BASOFILOS': 'Basófilos',
    'ERITROCITOS': 'Eritrocitos',
    'HEMOGLOBINA': 'Hemoglobina',
    'HEMATOCRITO': 'Hematocrito',
    'VOLUMEN CORPUSCULAR MEDIO': 'Volumen corpuscular medio',
    'HEMOGLOBINA CORPUSCULAR MEDIA': 'Hemoglobina corpuscular media',
    'PLAQUETAS': 'Plaquetas',
    'VOLUMEN PLAQUETAR MEDIO': 'Volumen plaquetar medio',
    'GLUCOSA': 'Glucosa',
    'UREA': 'Urea',
    'CREATININA': 'Creatinina',
    'ACIDO URICO': 'Ácido úrico',
    'BILIRRUBINA TOTAL': 'Bilirrubina total',
    'BILIRRUBINA DIRECTA': 'Bilirrubina directa',
    'BILIRRUBINA INDIRECTA': 'Bilirrubina indirecta',
    'OXALACETICA': 'Aspartato aminotransferasa (TGO/AST)',
    'PIRUVICA': 'Alanina aminotransferasa (TGP/ALT)',
    'FOSFATASA ALCALINA': 'Fosfatasa alcalina',
    'GAMAGLUTAMIL TRANSFERASA': 'Gamaglutamil transferasa',
    'LACTICA': 'Deshidrogenasa láctica',
    'ALBUMINA': 'Albúmina',
    'PROTEINAS TOTALES': 'Proteínas totales',
    'AMILASA': 'Amilasa',
    'LIPASA': 'Lipasa',
    'SODIO': 'Sodio',
    'POTASIO': 'Potasio',
    'CLORO': 'Cloro',
    'CALCIO': 'Calcio',
    'FOSFORO': 'Fósforo',
    'MAGNESIO': 'Magnesio',
    'CREATINFOSFOQUINASA': 'Creatinfosfoquinasa',
    'CK-MB': 'CK-MB',
    'TROPONINA': 'Troponina',
    'MIOGLOBINA': 'Mioglobina',
    'T3 TOTAL': 'T3 total',
    'T3 LIBRE': 'T3 libre',
    'T4 TOTAL': 'T4 total',
    'T4 LIBRE': 'T4 libre',
    'TSH': 'TSH',
    'COLESTEROL': 'Colesterol total',
    'HDL COLESTEROL': 'Colesterol HDL',
    'LDL COLESTEROL': 'Colesterol LDL',
    'VLDL COLESTEROL': 'Colesterol VLDL',
    'TRIGLICERIDOS': 'Triglicéridos',
    'TIEMPO DE PROTOMBINA': 'Tiempo de protrombina',
    'TIEMPO DE TROMBOPLASTINA PARCIAL': 'Tiempo de tromboplastina parcial',
    'INR': 'INR',
    '%HBA1C': 'Hemoglobina glucosilada',
    'MICRO ALBUMINA': 'Microalbúmina',
    'PROCALCITONINA': 'Procalcitonina',
    'PROTEINA C REACTIVA': 'Proteína C reactiva',
    'NT-PROBNP': 'NT-proBNP',
    'VDRL': 'VDRL',
    'HIV': 'VIH',
    'VIRUS HEPATITIS A': 'Hepatitis A',
    'VIRUS HEPATITIS B': 'Hepatitis B',
    'VIRUS HEPATITIS C': 'Hepatitis C',
    'PRUEBA DE EMBARAZO': 'Prueba de embarazo',
    'DIMERO D': 'Dímero D',
    'COLOR_ORINA': 'Color',
    'ASPECTO_ORINA': 'Aspecto',
    'DENSIDAD_ORINA': 'Densidad',
    'PH_ORINA': 'pH',
    'NITRITOS_ORINA': 'Nitritos',
    'GLUCOSA_ORINA': 'Glucosa',
    'HB_ORINA': 'Hemoglobina',
    'LEUCOCITOS_ORINA': 'Leucocitos',
    'ERITROCITOS_ORINA': 'Eritrocitos',
    'CELULAS_ORINA': 'Células epiteliales',
    'BACTERIAS_ORINA': 'Bacterias',
    'CRISTALES_ORINA': 'Cristales',
    'CILINDROS_ORINA': 'Cilindros',
    'MOCO_ORINA': 'Moco',
    'LEVADURAS_ORINA': 'Levaduras',
    'PARASITOS_ORINA': 'Parásitos',
  };

  const canonicalUnits = {
    'LEUCOCITOS': 'x10³/µL',
    'NEUTROFILOS': 'x10³/µL',
    'LINFOCITOS': 'x10³/µL',
    'MONOCITOS': 'x10³/µL',
    'EOSINOFILOS': 'x10³/µL',
    'BASOFILOS': 'x10³/µL',
    'ERITROCITOS': 'x10⁶/µL',
    'HEMOGLOBINA': 'g/dL',
    'HEMATOCRITO': '%',
    'VOLUMEN CORPUSCULAR MEDIO': 'fL',
    'HEMOGLOBINA CORPUSCULAR MEDIA': 'pg',
    'PLAQUETAS': 'x10³/µL',
    'VOLUMEN PLAQUETAR MEDIO': 'fL',
    'GLUCOSA': 'mg/dL',
    'UREA': 'mg/dL',
    'CREATININA': 'mg/dL',
    'ACIDO URICO': 'mg/dL',
    'BILIRRUBINA TOTAL': 'mg/dL',
    'BILIRRUBINA DIRECTA': 'mg/dL',
    'BILIRRUBINA INDIRECTA': 'mg/dL',
    'OXALACETICA': 'U/L',
    'PIRUVICA': 'U/L',
    'FOSFATASA ALCALINA': 'U/L',
    'GAMAGLUTAMIL TRANSFERASA': 'U/L',
    'LACTICA': 'U/L',
    'ALBUMINA': 'g/dL',
    'PROTEINAS TOTALES': 'g/dL',
    'AMILASA': 'U/L',
    'LIPASA': 'U/L',
    'SODIO': 'mmol/L',
    'POTASIO': 'mmol/L',
    'CLORO': 'mmol/L',
    'CALCIO': 'mg/dL',
    'FOSFORO': 'mg/dL',
    'MAGNESIO': 'mg/dL',
    'CREATINFOSFOQUINASA': 'U/L',
    'CK-MB': 'U/L',
    'TROPONINA': 'ng/mL',
    'MIOGLOBINA': 'ng/mL',
    'T3 TOTAL': 'ng/dL',
    'T3 LIBRE': 'pg/mL',
    'T4 TOTAL': 'µg/dL',
    'T4 LIBRE': 'ng/dL',
    'TSH': 'µIU/mL',
    'COLESTEROL': 'mg/dL',
    'HDL COLESTEROL': 'mg/dL',
    'LDL COLESTEROL': 'mg/dL',
    'VLDL COLESTEROL': 'mg/dL',
    'TRIGLICERIDOS': 'mg/dL',
    'TIEMPO DE PROTOMBINA': 'seg',
    'TIEMPO DE TROMBOPLASTINA PARCIAL': 'seg',
    '%HBA1C': '%',
    'MICRO ALBUMINA': 'mg/dL',
    'PROCALCITONINA': 'ng/mL',
    'PROTEINA C REACTIVA': 'mg/L',
    'NT-PROBNP': 'pg/mL',
    'DIMERO D': 'ng/mL',
    'LEUCOCITOS_ORINA': '/CAMPO',
    'ERITROCITOS_ORINA': '/CAMPO',
  };

  const unitFamilies = {
    count3: /(?:X\s*10(?:\^|E)?\s*3|10E3|10\^3|MIL)\s*\/?\s*(?:UL|ΜL|ULITRO|MICROLITRO)/i,
    count6: /(?:X\s*10(?:\^|E)?\s*6|10E6|10\^6|MILL(?:ONES?)?)\s*\/?\s*(?:UL|ΜL|ULITRO|MICROLITRO)/i,
    gdl: /G\s*\/?\s*DL/i,
    mgdl: /MG\s*\/?\s*DL/i,
    ngml: /NG\s*\/?\s*ML/i,
    pgml: /PG\s*\/?\s*ML/i,
    ugl: /(?:UG|ΜG|µG)\s*\/?\s*DL/i,
    mmol: /MMOL\s*\/?\s*L/i,
    meq: /MEQ\s*\/?\s*L/i,
    ul: /(?:U\s*\/?\s*L|UIL|U1L)/i,
    fl: /\bFL\b/i,
    pg: /\bPG\b/i,
    percent: /%/,
    sec: /(?:SEG(?:UNDOS?)?|SEC(?:ONDS?)?)/i,
    field: /\/\s*CAMPO/i,
  };

  function hintsForKey(key) {
    if (['LEUCOCITOS','NEUTROFILOS','LINFOCITOS','MONOCITOS','EOSINOFILOS','BASOFILOS','PLAQUETAS'].includes(key)) return [unitFamilies.count3];
    if (key === 'ERITROCITOS') return [unitFamilies.count6];
    if (key === 'HEMOGLOBINA' || key === 'ALBUMINA' || key === 'PROTEINAS TOTALES') return [unitFamilies.gdl];
    if (key === 'HEMATOCRITO' || key === '%HBA1C') return [unitFamilies.percent];
    if (['VOLUMEN CORPUSCULAR MEDIO','VOLUMEN PLAQUETAR MEDIO'].includes(key)) return [unitFamilies.fl];
    if (key === 'HEMOGLOBINA CORPUSCULAR MEDIA') return [unitFamilies.pg];
    if (['GLUCOSA','UREA','CREATININA','ACIDO URICO','BILIRRUBINA TOTAL','BILIRRUBINA DIRECTA','BILIRRUBINA INDIRECTA','CALCIO','FOSFORO','MAGNESIO','COLESTEROL','HDL COLESTEROL','LDL COLESTEROL','VLDL COLESTEROL','TRIGLICERIDOS','MICRO ALBUMINA'].includes(key)) return [unitFamilies.mgdl];
    if (['OXALACETICA','PIRUVICA','FOSFATASA ALCALINA','GAMAGLUTAMIL TRANSFERASA','LACTICA','AMILASA','LIPASA','CREATINFOSFOQUINASA','CK-MB'].includes(key)) return [unitFamilies.ul];
    if (['SODIO','POTASIO','CLORO'].includes(key)) return [unitFamilies.mmol, unitFamilies.meq];
    if (['TIEMPO DE PROTOMBINA','TIEMPO DE TROMBOPLASTINA PARCIAL'].includes(key)) return [unitFamilies.sec];
    if (['LEUCOCITOS_ORINA','ERITROCITOS_ORINA'].includes(key)) return [unitFamilies.field];
    if (['TROPONINA','MIOGLOBINA','PROCALCITONINA','DIMERO D'].includes(key)) return [unitFamilies.ngml];
    if (['T3 LIBRE','NT-PROBNP'].includes(key)) return [unitFamilies.pgml];
    if (key === 'T4 TOTAL') return [unitFamilies.ugl];
    return [];
  }

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
    lab('Biometría Hemática', 'PLAQUETAS', 'Pla', [/\bPLAQUETAS?\b/, /\bPLT\b/]),
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
    return {
      section, key, short, aliases,
      unit: canonicalUnits[key] || '',
      unitHints: hintsForKey(key),
      ...options,
    };
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
      .replace(/^[\s:;=,._-]+/, '')
      .replace(/(\d),(\d)/g, '$1.$2')
      .trim();
  }

  function cleanOCRNumber(token) {
    let value = String(token || '').trim().replace(/,/g, '.');
    if (/^[<>]?\s*-?[0-9OIL.]+$/i.test(value)) {
      value = value.replace(/O/gi, '0').replace(/[IL]/gi, '1');
    }
    // Evita perder el punto decimal. Solo colapsa espacios internos.
    return value.replace(/\s+/g, '');
  }

  function normalizeUnit(raw) {
    const unit = String(raw || '')
      .replace(/\s+/g, '')
      .replace(/μ/g, 'µ')
      .replace(/UL$/i, 'µL')
      .replace(/\^3/g, '³')
      .replace(/\^6/g, '⁶');

    if (/^(?:X?10(?:E|³)?3|MIL)\/?(?:U?L|µL)$/i.test(unit)) return 'x10³/µL';
    if (/^(?:X?10(?:E|⁶)?6|MILL(?:ONES?)?)\/?(?:U?L|µL)$/i.test(unit)) return 'x10⁶/µL';
    if (/^G\/?DL$/i.test(unit)) return 'g/dL';
    if (/^MG\/?DL$/i.test(unit)) return 'mg/dL';
    if (/^NG\/?ML$/i.test(unit)) return 'ng/mL';
    if (/^PG\/?ML$/i.test(unit)) return 'pg/mL';
    if (/^(?:UG|µG)\/?DL$/i.test(unit)) return 'µg/dL';
    if (/^MMOL\/?L$/i.test(unit)) return 'mmol/L';
    if (/^MEQ\/?L$/i.test(unit)) return 'mEq/L';
    if (/^(?:U\/?L|UIL|U1L)$/i.test(unit)) return 'U/L';
    if (/^FL$/i.test(unit)) return 'fL';
    if (/^PG$/i.test(unit)) return 'pg';
    if (/^%$/.test(unit)) return '%';
    if (/^(?:SEG(?:UNDOS?)?|SEC(?:ONDS?)?)$/i.test(unit)) return 'seg';
    if (/^\/?CAMPO$/i.test(unit)) return '/CAMPO';
    return raw ? String(raw).replace(/\s+/g, ' ').trim() : '';
  }

  function extractQualitative(tail) {
    // Tolera artefactos de una sola letra antes del valor (p.ej. "A CLARO").
    const cleaned = String(tail || '').replace(/^[A-Z]\s+(?=(?:POSITIVO|NEGATIVO|REACTIVO|NO\s+REACTIVO|NO\s+SE\s+OBSERVAN|ESCAS|MODERAD|ABUND|INCONTABLE|NORMAL|AMARILLO|AMBAR|ROJO|CAFE|CLARO|TURBIO|TRANSPARENTE|OPALESCENTE))/i, '');
    const q = cleaned.match(/^(?:"?([ABO]{1,2})"?\s+)?(POSITIVO|NEGATIVO|REACTIVO|NO\s+REACTIVO|NO\s+SE\s+OBSERVAN|ESCAS[OA]S?|MODERAD[OA]S?|ABUNDANTES?|INCONTABLES?|NORMAL|AMARILLO|AMBAR|ROJO|CAFE|CLARO|TURBIO|TRANSPARENTE|OPALESCENTE)(?:\s+(SUPERFICIAL(?:ES)?))?/i);
    if (!q) return null;
    return q[0].replace(/"/g, '').replace(/\s+/g, ' ').trim();
  }

  function extractMeasurements(tail) {
    const text = String(tail || '');
    const numberRx = /[<>]?\s*-?(?=[0-9OIL]*\d)[0-9OIL]+(?:[.,][0-9OIL]+)?/gi;
    const candidates = [];
    let m;

    while ((m = numberRx.exec(text))) {
      const numberRaw = m[0];
      const value = cleanOCRNumber(numberRaw);
      const after = text.slice(m.index + numberRaw.length, m.index + numberRaw.length + 34);

      // Unidad inmediatamente después del resultado. El rango de referencia de
      // RASOMA normalmente no repite unidad, así que esto permite distinguirlo.
      const unitMatch = after.match(/^\s*((?:X\s*10(?:\^|E)?\s*[36]|10E[36]|10\^[36]|MIL|MILL(?:ONES?)?)\s*\/?\s*(?:UL|ΜL|µL)|G\s*\/?\s*DL|MG\s*\/?\s*DL|NG\s*\/?\s*ML|PG\s*\/?\s*ML|(?:UG|ΜG|µG)\s*\/?\s*DL|MMOL\s*\/?\s*L|MEQ\s*\/?\s*L|U\s*\/?\s*L|UIL|U1L|FL\b|PG\b|%|SEG(?:UNDOS?)?\b|SEC(?:ONDS?)?\b|\/\s*CAMPO)/i);
      const rawUnit = unitMatch ? unitMatch[1] : '';
      candidates.push({
        value,
        unit: normalizeUnit(rawUnit),
        rawUnit,
        index: m.index,
      });
    }
    return candidates;
  }

  function unitMatches(candidate, def) {
    if (!candidate.rawUnit || !def.unitHints?.length) return false;
    return def.unitHints.some(hint => {
      const flags = hint.flags.replace('g', '');
      return new RegExp(hint.source, flags).test(candidate.rawUnit);
    });
  }

  // Rangos deliberadamente amplios: no interpretan normalidad clínica.
  // Solo bloquean lecturas OCR físicamente inverosímiles (p.ej. Hb 200000000009,
  // VCM 921, K 136.6). Si una lectura refinada falla aquí, el parser intenta
  // rescatar la misma fila del OCR estructural antes de aceptar otro dato.
  const plausibilityRanges = {
    'LEUCOCITOS': [0, 500],
    'NEUTROFILOS': [0, 500],
    'LINFOCITOS': [0, 500],
    'MONOCITOS': [0, 500],
    'EOSINOFILOS': [0, 500],
    'BASOFILOS': [0, 500],
    'ERITROCITOS': [0.1, 20],
    'HEMOGLOBINA': [1, 30],
    'HEMATOCRITO': [3, 80],
    'VOLUMEN CORPUSCULAR MEDIO': [30, 160],
    'HEMOGLOBINA CORPUSCULAR MEDIA': [10, 60],
    'PLAQUETAS': [0, 3000],
    'VOLUMEN PLAQUETAR MEDIO': [2, 30],
    'GLUCOSA': [5, 3000],
    'UREA': [1, 1000],
    'CREATININA': [0.05, 50],
    'ACIDO URICO': [0.1, 50],
    'BILIRRUBINA TOTAL': [0, 100],
    'BILIRRUBINA DIRECTA': [0, 100],
    'BILIRRUBINA INDIRECTA': [0, 100],
    'OXALACETICA': [0, 100000],
    'PIRUVICA': [0, 100000],
    'FOSFATASA ALCALINA': [0, 100000],
    'GAMAGLUTAMIL TRANSFERASA': [0, 100000],
    'LACTICA': [0, 100000],
    'AMILASA': [0, 100000],
    'LIPASA': [0, 100000],
    'SODIO': [80, 200],
    'POTASIO': [1, 10],
    'CLORO': [50, 180],
    'CALCIO': [1, 25],
    'FOSFORO': [0.1, 30],
    'MAGNESIO': [0.1, 20],
    'TIEMPO DE PROTOMBINA': [1, 1000],
    'TIEMPO DE TROMBOPLASTINA PARCIAL': [1, 1000],
    'INR': [0.1, 30],
    'DENSIDAD_ORINA': [1.0, 1.2],
    'PH_ORINA': [2, 12],
    'LEUCOCITOS_ORINA': [0, 100000],
    'ERITROCITOS_ORINA': [0, 100000],
  };

  function numericValue(value) {
    const cleaned = String(value ?? '').replace(/[<>]/g, '').replace(',', '.').trim();
    if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  function isPlausibleMeasurement(def, measurement) {
    if (!measurement || measurement.value == null) return false;
    const range = plausibilityRanges[def.key];
    if (!range) return true;
    const n = numericValue(measurement.value);
    if (n === null) return false;
    return n >= range[0] && n <= range[1];
  }

  function extractMeasurement(tail, def) {
    if (def.qualitative || def.urineOnly) {
      const qualitative = extractQualitative(tail);
      if (qualitative) return { value: qualitative, unit: '', quality: 5 };
    }

    const candidates = extractMeasurements(tail);
    if (candidates.length) {
      // Primero resultados con unidad compatible. Un rango de referencia suele
      // carecer de unidad, por lo que no debe desplazar al resultado real.
      const ordered = [...candidates].sort((a, b) => {
        const au = unitMatches(a, def) ? 2 : (a.rawUnit ? 1 : 0);
        const bu = unitMatches(b, def) ? 2 : (b.rawUnit ? 1 : 0);
        return bu - au || a.index - b.index;
      });

      for (const chosen of ordered) {
        const matchedUnit = unitMatches(chosen, def);
        // Para analitos conocidos mostramos siempre la unidad canónica. Esto
        // evita que OCR "U/L" como "UL" termine convertido en microlitros.
        const measurement = {
          value: chosen.value,
          unit: def.unit || chosen.unit || '',
          quality: matchedUnit ? 5 : (chosen.rawUnit ? 4 : 2),
        };
        if (isPlausibleMeasurement(def, measurement)) return measurement;

        // Si la lectura que llevaba la unidad esperada es absurda, no tomamos
        // silenciosamente el siguiente número de la fila (podría ser referencia).
        if (matchedUnit) return null;
      }
    }

    const qualitative = extractQualitative(tail);
    if (qualitative) return { value: qualitative, unit: '', quality: 4 };
    return null;
  }

  function decimalRestorationPreferred(structural, refined) {
    const a = numericValue(structural?.value);
    const b = numericValue(refined?.value);
    if (a === null || b === null || a === b) return false;
    const aText = String(structural.value);
    const bText = String(refined.value);
    if (aText.includes('.') && !bText.includes('.')) return false;
    if (!bText.includes('.')) return false;

    // Caso típico OCR: 0.9→09/9, 0.03→003/3. Comparamos potencias de diez.
    const large = Math.max(Math.abs(a), Math.abs(b));
    const small = Math.max(Number.EPSILON, Math.min(Math.abs(a), Math.abs(b)));
    const ratio = large / small;
    const powers = [10, 100, 1000, 10000];
    return powers.some(power => Math.abs(ratio - power) / power < 0.03);
  }

  function extractValueFromRow(row, def) {
    for (const alias of def.aliases) {
      const match = aliasMatch(row.text, alias);
      if (!match) continue;

      if (def.rejectPercentLine && /%/.test(row.text.slice(match.index, match.index + match[0].length + 8))) continue;

      const tail = cleanTail(row.text.slice(match.index + match[0].length));
      if (!tail) return { matched: true, measurement: null };

      const refinedIndex = tail.indexOf('§RESULT§');
      const structuralTail = refinedIndex >= 0
        ? cleanTail(tail.slice(0, refinedIndex))
        : tail;
      const structural = extractMeasurement(structuralTail, def);

      let refined = null;
      if (refinedIndex >= 0) {
        const refinedTail = cleanTail(tail.slice(refinedIndex + '§RESULT§'.length));
        refined = extractMeasurement(refinedTail, def);
      }

      if (structural && refined) {
        // Si la segunda lectura restaura explícitamente un punto decimal perdido
        // (09→0.9, 003→0.03), la preferimos. No se inventa el decimal: debe estar
        // presente en el OCR de la celda aislada y conservar plausibilidad.
        if (decimalRestorationPreferred(structural, refined)) {
          refined.quality = Math.max(10, (refined.quality || 1) + 5);
          return { matched: true, measurement: refined };
        }

        // Una medición estructural con la unidad esperada sigue siendo muy fuerte.
        // Esto protege contra un eventual OCR de celda desplazado o contaminado.
        if ((structural.quality || 0) >= 5) {
          structural.quality = Math.max(8, structural.quality + 3);
          return { matched: true, measurement: structural };
        }

        refined.quality = Math.max(9, (refined.quality || 1) + 4);
        return { matched: true, measurement: refined };
      }

      if (refined) {
        refined.quality = Math.max(9, (refined.quality || 1) + 4);
        return { matched: true, measurement: refined };
      }
      return { matched: true, measurement: structural };
    }
    return { matched: false, measurement: null };
  }

  function nextLineValue(rows, index, def) {
    const next = rows[index + 1];
    if (!next || next.context !== rows[index].context) return null;
    const tail = cleanTail(next.text);
    if (!tail) return null;

    // Rescate solo si la siguiente línea ES el valor. No buscamos números dentro
    // de frases como "Resultados validados... 19-08-2026", porque acabaríamos
    // convirtiendo fechas o rangos en resultados de laboratorio.
    const startsNumeric = /^[<>]?\s*-?\d/.test(tail);
    const startsQualitative = /^(?:"?[ABO]{1,2}"?\s+)?(?:POSITIVO|NEGATIVO|REACTIVO|NO\s+REACTIVO|NO\s+SE\s+OBSERVAN|ESCAS|MODERAD|ABUND|INCONTABLE|NORMAL|AMARILLO|AMBAR|ROJO|CAFE|CLARO|TURBIO|TRANSPARENTE|OPALESCENTE)/i.test(tail);
    if (!startsNumeric && !startsQualitative) return null;

    return extractMeasurement(tail, def);
  }

  function rowsForDefinition(rows, def) {
    if (def.urineOnly) return rows.filter(row => row.context === 'Examen General de Orina');
    // Los analitos sanguíneos nunca deben tomar resultados del bloque de orina.
    return rows.filter(row => row.context !== 'Examen General de Orina');
  }

  function findDefinitionValue(rows, def) {
    const candidates = rowsForDefinition(rows, def);
    let best = null;

    for (const row of candidates) {
      const result = extractValueFromRow(row, def);
      if (!result.matched) continue;

      if (result.measurement !== null) {
        let score = result.measurement.quality || 1;
        if (row.context === def.section) score += 2;
        // Resultado en la misma fila que el analito: mucho más fiable que
        // rescatar el número de la línea siguiente.
        score += 2;
        if (!best || score > best.score) {
          best = { measurement: result.measurement, score };
        }
      }

      if (result.measurement === null) {
        const originalIndex = rows.findIndex(r => r.index === row.index && r.text === row.text);
        if (originalIndex >= 0) {
          const rescued = nextLineValue(rows, originalIndex, def);
          if (rescued !== null) {
            let score = Math.max(1, (rescued.quality || 1) - 2);
            if (row.context === def.section) score += 1;
            if (!best || score > best.score) {
              best = { measurement: rescued, score };
            }
          }
        }
      }
    }

    if (!best) return null;
    const { quality, ...measurement } = best.measurement;
    return measurement;
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
      const measurement = findDefinitionValue(rows, def);
      if (measurement === null) continue;
      if (!data[def.section]) data[def.section] = [];
      data[def.section].push({ key: def.key, short: def.short, ...measurement });
    }

    for (const def of urineDefinitions) {
      const measurement = findDefinitionValue(rows, def);
      if (measurement === null) continue;
      if (!data[def.section]) data[def.section] = [];
      data[def.section].push({ key: def.key, short: def.short, ...measurement });
    }

    const groupRh = findGroupAndRh(rows);
    if (groupRh) {
      if (!data.Otros) data.Otros = [];
      data.Otros.unshift({ key: 'GRUPO Y RH', short: 'Grupo/RH', value: groupRh, unit: '' });
    }

    return data;
  }

  function formatLabResults(parsed, options = {}) {
    const layout = options.layout === 'expanded' ? 'expanded' : 'compact';
    const abbreviations = options.abbreviations !== false;
    const uppercase = options.uppercase === true;
    const shortSections = options.shortSections === true;
    const lines = [];

    const itemText = item => {
      const label = abbreviations
        ? item.short
        : (displayNames[item.key] || item.short || item.key);
      return `${label} ${item.value}${item.unit ? ' ' + item.unit : ''}`;
    };

    for (const section of sectionsOrder) {
      const items = parsed?.[section];
      if (!items?.length) continue;
      const sectionLabel = shortSections
        ? (sectionShortNames[section] || section)
        : (sectionDisplayNames[section] || section);

      if (layout === 'expanded') {
        if (lines.length) lines.push('');
        lines.push(`${sectionLabel}:`);
        for (const item of items) lines.push(itemText(item));
      } else {
        lines.push(`${sectionLabel}: ${items.map(itemText).join(', ')}`);
      }
    }

    const text = lines.join('\n').trim();
    return uppercase ? text.toLocaleUpperCase('es-MX') : text;
  }

  function formatForClipboard(parsed) {
    return formatLabResults(parsed, {
      layout: 'compact',
      abbreviations: true,
      uppercase: false,
      shortSections: false,
    });
  }

  function countResults(parsed) {
    return Object.values(parsed).reduce((sum, items) => sum + (items?.length || 0), 0);
  }

  window.LabParser = {
    parseLabResults,
    formatForClipboard,
    formatLabResults,
    countResults,
    normalizeOCR,
    sectionsOrder,
    sectionShortNames,
    sectionDisplayNames,
    displayNames,
  };
})();
