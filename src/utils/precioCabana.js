// src/utils/precioCabana.js - VERSIÓN PARA ARGENTINA (UTC-3)

const feriadosArgentina2024 = [
  "2024-01-01", // Año Nuevo
  "2024-02-12", // Carnaval
  "2024-02-13", // Carnaval
  "2024-03-24", // Día Nacional de la Memoria
  "2024-03-29", // Viernes Santo
  "2024-04-02", // Día del Veterano y de los Caídos
  "2024-05-01", // Día del Trabajador
  "2024-05-25", // Día de la Revolución de Mayo
  "2024-06-17", // Paso a la Inmortalidad del Gral. Martín Miguel de Güemes
  "2024-06-20", // Día de la Bandera
  "2024-07-09", // Día de la Independencia
  "2024-08-17", // Paso a la Inmortalidad del Gral. José de San Martín
  "2024-10-12", // Día del Respeto a la Diversidad Cultural
  "2024-11-18", // Día de la Soberanía Nacional
  "2024-12-08", // Inmaculada Concepción de María
  "2024-12-25", // Navidad
];

// Función específica para Argentina (UTC-3 siempre)
function crearFechaArgentina(fechaString) {
  if (fechaString instanceof Date) {
    return fechaString;
  }
  
  // SOLUCIÓN SIMPLE Y EFECTIVA PARA ARGENTINA:
  // Agregar "T03:00:00" para que sea 3 AM en Argentina (medianoche UTC+3)
  // Esto asegura que la fecha sea correcta en zona horaria argentina
  if (typeof fechaString === 'string') {
    if (!fechaString.includes('T')) {
      // Si viene como "YYYY-MM-DD", agregar hora argentina
      return new Date(fechaString + 'T03:00:00-03:00');
    }
  }
  
  return new Date(fechaString);
}

function esFeriado(fecha) {
  const fechaArg = crearFechaArgentina(fecha);
  const fechaString = fechaArg.toISOString().split('T')[0];
  return feriadosArgentina2024.includes(fechaString);
}

function calcularPrecioPorDia(fecha) {
  const fechaArg = crearFechaArgentina(fecha);
  
  if (esFeriado(fechaArg)) {
    return 200000; // Feriados
  }
  
  const diaSemana = fechaArg.getDay(); // 0=domingo, 6=sábado
  
  if (diaSemana === 0 || diaSemana === 6) {
    return 180000; // Fin de semana
  }
  
  return 150000; // Lunes a viernes
}

function calcularPrecioTotal(fechaInicio, fechaFin) {
  let precioTotal = 0;
  const fechaActual = crearFechaArgentina(fechaInicio);
  const fechaFinObj = crearFechaArgentina(fechaFin);
  
  // Crear copia para iterar
  const fechaIteracion = new Date(fechaActual);
  
  while (fechaIteracion <= fechaFinObj) {
    precioTotal += calcularPrecioPorDia(fechaIteracion);
    fechaIteracion.setDate(fechaIteracion.getDate() + 1);
  }
  
  return precioTotal;
}

function obtenerDesglosePrecios(fechaInicio, fechaFin) {
  const desglose = [];
  let precioTotal = 0;
  
  const fechaActual = crearFechaArgentina(fechaInicio);
  const fechaFinObj = crearFechaArgentina(fechaFin);
  
  const fechaIteracion = new Date(fechaActual);
  const nombresDias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  
  while (fechaIteracion <= fechaFinObj) {
    const precioDia = calcularPrecioPorDia(fechaIteracion);
    precioTotal += precioDia;
    
    const diaSemana = fechaIteracion.getDay();
    
    desglose.push({
      fecha: fechaIteracion.toISOString().split('T')[0],
      diaSemana: diaSemana,
      diaNombre: nombresDias[diaSemana],
      precio: precioDia,
      tipo: esFeriado(fechaIteracion) ? 'feriado' : 
            (diaSemana === 0 || diaSemana === 6) ? 'fin de semana' : 'semana'
    });
    
    fechaIteracion.setDate(fechaIteracion.getDate() + 1);
  }
  
  return { desglose, precioTotal };
}

// También actualizar el controlador para mostrar precios en pesos argentinos
export {
  calcularPrecioPorDia,
  calcularPrecioTotal,
  obtenerDesglosePrecios,
  esFeriado,
  crearFechaArgentina
};