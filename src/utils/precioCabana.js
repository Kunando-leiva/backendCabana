// src/utils/precioCabana.js - VERSIÓN COMPLETA

const feriadosArgentina2025 = [
  "2025-01-01", // Año Nuevo
  "2025-02-12", // Carnaval
  "2025-02-13", // Carnaval
  "2025-03-24", // Día Nacional de la Memoria
  "2025-03-29", // Viernes Santo
  "2025-04-02", // Día del Veterano y de los Caídos
  "2025-05-01", // Día del Trabajador
  "2025-05-25", // Día de la Revolución de Mayo
  "2025-06-17", // Paso a la Inmortalidad del Gral. Martín Miguel de Güemes
  "2025-06-20", // Día de la Bandera
  "2025-07-09", // Día de la Independencia
  "2025-08-17", // Paso a la Inmortalidad del Gral. José de San Martín
  "2025-10-12", // Día del Respeto a la Diversidad Cultural
  "2025-11-18", // Día de la Soberanía Nacional
  "2025-12-08", // Inmaculada Concepción de María
  "2025-12-25", // Navidad
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

// Calcular precio por NOCHE (no por día)
function calcularPrecioPorNoche(fecha) {
  const tipo = obtenerTipoDia(fecha);
  
  switch (tipo) {
    case 'feriado':
      return 200000; // Feriados
    case 'fin de semana':
      return 180000; // Sábado y Domingo
    case 'semana':
      return 150000; // Lunes a Viernes
    default:
      return 150000;
  }
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
    
    desglose.push({
      fecha: fechaActual.toISOString().split('T')[0],
      diaSemana: diaSemana,
      diaNombre: nombresDias[diaSemana],
      precio: precioNoche,
      tipo: tipo,
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

// Función auxiliar para contar tipos de noches
function contarNochesPorTipo(desglose) {
  return {
    semana: desglose.filter(d => d.tipo === 'semana').length,
    finDeSemana: desglose.filter(d => d.tipo === 'fin de semana').length,
    feriado: desglose.filter(d => d.tipo === 'feriado').length
  };
}

// Función para generar resumen (opcional)
function generarResumenPrecio(fechaInicio, fechaFin) {
  const { desglose, precioTotal, totalNoches } = obtenerDesglosePrecios(fechaInicio, fechaFin);
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
    checkIn: fechaInicio.toISOString().split('T')[0],
    checkOut: fechaFin.toISOString().split('T')[0]
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