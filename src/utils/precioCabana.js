// src/utils/precioCabana.js - VERSIÓN ACTUALIZADA

const feriadosArgentina2025 = [
  "2026-01-01", // Año Nuevo
  "2026-02-16", // Carnaval
  "2026-02-17", // Carnaval
  "2026-03-24", // Día Nacional de la Memoria por la Verdad y la Justicia
  "2026-04-02", // Día del Veterano y de los Caídos en la Guerra de Malvinas
  "2026-04-03", // Viernes Santo
  "2026-05-01", // Día del Trabajador
  "2026-05-25", // Día de la Revolución de Mayo
  "2026-06-17", // Paso a la Inmortalidad del Gral. Martín Miguel de Güemes
  "2026-06-20", // Día de la Bandera
  "2026-07-09", // Día de la Independencia
  "2026-08-17", // Paso a la Inmortalidad del Gral. José de San Martín
  "2026-10-12", // Día del Respeto a la Diversidad Cultural
  "2026-11-16", // Día de la Soberanía Nacional (trasladable)
  "2026-12-08", // Inmaculada Concepción de María
  "2026-12-25", // Navidad
];

// Función específica para Argentina (UTC-3 siempre)
function crearFechaArgentina(fechaString) {
  if (fechaString instanceof Date) {
    return fechaString;
  }
  
  if (typeof fechaString === 'string') {
    if (!fechaString.includes('T')) {
      return new Date(fechaString + 'T03:00:00-03:00');
    }
  }
  
  return new Date(fechaString);
}

function esFeriado(fecha) {
  const fechaArg = crearFechaArgentina(fecha);
  const fechaString = fechaArg.toISOString().split('T')[0];
  return feriadosArgentina2025.includes(fechaString);
}

// Obtener tipo de día (para la noche de ese día)
function obtenerTipoDia(fecha) {
  const fechaArg = crearFechaArgentina(fecha);
  
  if (esFeriado(fechaArg)) {
    return 'feriado';
  }
  
  const diaSemana = fechaArg.getDay(); // 0=domingo, 1=lunes, ..., 6=sábado
  
  // Solo Sábado y Domingo son fin de semana
  if (diaSemana === 0 || diaSemana === 6) { // 0=Domingo, 6=Sábado
    return 'fin de semana';
  }
  
  return 'semana'; // Lunes a Viernes = día de semana
}

// Calcular precio por NOCHE (no por día) - ACTUALIZADO
function calcularPrecioPorNoche(fecha) {
  const tipo = obtenerTipoDia(fecha);
  const fechaArg = crearFechaArgentina(fecha);
  const diaSemana = fechaArg.getDay(); // 0=domingo, 1=lunes, ..., 6=sábado
  
  // Si es feriado, precio especial
  if (tipo === 'feriado') {
    return 250000; // Feriados: $250.000
  }
  
  // Evaluar por día de la semana específico
  if (diaSemana === 5) { // 5 = Viernes
    return 200000; // Viernes: $200.000
  }
  
  if (diaSemana === 6) { // 6 = Sábado
    return 220000; // Sábados: $220.000
  }
  
  if (diaSemana === 0) { // 0 = Domingo
    return 200000; // Domingo: $200.000
  }
  
  // Lunes (1), Martes (2), Miércoles (3), Jueves (4)
  return 180000; // Lunes a Jueves: $180.000
}

// Calcular precio total por NOCHEs (corregido)
function calcularPrecioTotal(fechaInicio, fechaFin) {
  const inicio = crearFechaArgentina(fechaInicio);
  const fin = crearFechaArgentina(fechaFin);
  
  // Validar que la fecha fin sea posterior a la fecha inicio
  if (inicio >= fin) {
    return 0;
  }
  
  // Calcular número de NOCHEs (no días)
  const diffTiempo = fin - inicio;
  const noches = Math.floor(diffTiempo / (1000 * 60 * 60 * 24));
  
  if (noches <= 0) return 0;
  
  let precioTotal = 0;
  const fechaActual = new Date(inicio);
  
  // Iterar por cada NOCHE (no por cada día)
  for (let i = 0; i < noches; i++) {
    precioTotal += calcularPrecioPorNoche(fechaActual);
    fechaActual.setDate(fechaActual.getDate() + 1);
  }
  
  return precioTotal;
}

// Obtener desglose de precios por NOCHEs (corregido)
function obtenerDesglosePrecios(fechaInicio, fechaFin) {
  const inicio = crearFechaArgentina(fechaInicio);
  const fin = crearFechaArgentina(fechaFin);
  
  if (inicio >= fin) {
    return { desglose: [], precioTotal: 0, totalNoches: 0 };
  }
  
  // Calcular número de NOCHEs
  const diffTiempo = fin - inicio;
  const totalNoches = Math.floor(diffTiempo / (1000 * 60 * 60 * 24));
  
  const desglose = [];
  let precioTotal = 0;
  const fechaActual = new Date(inicio);
  const nombresDias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  
  // Iterar por cada NOCHE
  for (let i = 0; i < totalNoches; i++) {
    const precioNoche = calcularPrecioPorNoche(fechaActual);
    precioTotal += precioNoche;
    
    const diaSemana = fechaActual.getDay();
    const tipo = obtenerTipoDia(fechaActual);
    
    // Determinar categoría específica para mostrar
    let categoria = tipo;
    if (tipo !== 'feriado') {
      if (diaSemana >= 1 && diaSemana <= 4) { // Lunes a Jueves
        categoria = 'Lunes a Jueves';
      } else if (diaSemana === 5) { // Viernes
        categoria = 'Viernes';
      } else if (diaSemana === 6) { // Sábado
        categoria = 'Sábado';
      } else if (diaSemana === 0) { // Domingo
        categoria = 'Domingo';
      }
    }
    
    desglose.push({
      fecha: fechaActual.toISOString().split('T')[0],
      diaSemana: diaSemana,
      diaNombre: nombresDias[diaSemana],
      precio: precioNoche,
      tipo: tipo,
      categoria: categoria,
      nocheNumero: i + 1
    });
    
    fechaActual.setDate(fechaActual.getDate() + 1);
  }
  
  return { 
    desglose, 
    precioTotal, 
    totalNoches,
    checkIn: inicio.toISOString().split('T')[0],
    checkOut: fin.toISOString().split('T')[0]
  };
}

// Función auxiliar para contar tipos de noches - ACTUALIZADA
function contarNochesPorTipo(desglose) {
  const conteo = {
    'Lunes a Jueves': 0,
    'Viernes': 0,
    'Sábado': 0,
    'Domingo': 0,
    'Feriado': 0
  };
  
  desglose.forEach(item => {
    if (item.tipo === 'feriado') {
      conteo['Feriado']++;
    } else {
      switch (item.diaSemana) {
        case 1: case 2: case 3: case 4: // Lunes a Jueves
          conteo['Lunes a Jueves']++;
          break;
        case 5: // Viernes
          conteo['Viernes']++;
          break;
        case 6: // Sábado
          conteo['Sábado']++;
          break;
        case 0: // Domingo
          conteo['Domingo']++;
          break;
      }
    }
  });
  
  return conteo;
}

// Función para generar resumen (opcional) - ACTUALIZADA
function generarResumenPrecio(fechaInicio, fechaFin) {
  const { desglose, precioTotal, totalNoches, checkIn, checkOut } = obtenerDesglosePrecios(fechaInicio, fechaFin);
  const conteo = contarNochesPorTipo(desglose);
  
  const formatoArgentino = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  
  return {
    totalNoches,
    precioTotal: precioTotal,
    precioTotalFormateado: formatoArgentino.format(precioTotal),
    desglosePorTipo: conteo,
    desgloseCompleto: desglose,
    checkIn: checkIn,
    checkOut: checkOut,
    tarifas: {
      'Lunes a Jueves': 180000,
      'Viernes': 200000,
      'Sábado': 220000,
      'Domingo': 200000,
      'Feriado': 250000
    }
  };
}

// Exportaciones
export {
  calcularPrecioPorNoche,
  calcularPrecioTotal,
  obtenerDesglosePrecios,
  esFeriado,
  crearFechaArgentina,
  obtenerTipoDia,
  contarNochesPorTipo,
  generarResumenPrecio
};