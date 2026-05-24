import WebSocket from 'ws';

/**
 * Send a JSON message to a WebSocket if it's open.
 */
export function wsSend(ws, msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}
