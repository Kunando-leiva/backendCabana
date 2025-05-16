// websocket.js
import { WebSocketServer } from 'ws';

// Crear instancia de WebSocketServer
const wss = new WebSocketServer({ noServer: true });

// Configurar manejo de conexiones
const connections = new Set();

wss.on('connection', (ws) => {
  connections.add(ws);
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Mensaje recibido:', data);
      
      // Ejemplo: Retransmitir mensaje a todos los clientes
      connections.forEach(client => {
        if (client !== ws && client.readyState === 1) { // 1 = OPEN
          client.send(JSON.stringify(data));
        }
      });
    } catch (error) {
      console.error('Error procesando mensaje:', error);
    }
  });

  ws.on('close', () => {
    connections.delete(ws);
    console.log('Cliente desconectado. Conexiones activas:', connections.size);
  });
});

// Exportar el servidor WebSocket
export const webSocketServer = wss;