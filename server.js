const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, '.data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const DB_PATH = path.join(DATA_DIR, 'db.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Helpers do Banco de Dados JSON ──────────────────────────────────────────

function readDb() {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('[Server] Erro ao ler db.json, usando padrão vazio:', err);
    return { medicines: [], schedules: [], schedule_medicines: [], confirmations: [] };
  }
}

function writeDb(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[Server] Erro ao salvar db.json:', err);
  }
}

// ─── Controle das Conexões WebSocket ──────────────────────────────────────────

let phoneSocket = null;
const webSockets = new Set();

function broadcastToWeb(messageObj) {
  const payload = JSON.stringify(messageObj);
  for (const ws of webSockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

wss.on('connection', (ws) => {
  console.log('[WebSocket] Novo cliente conectado');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'register') {
        if (data.client === 'phone') {
          phoneSocket = ws;
          console.log('[WebSocket] Telefone registrado 🟢');
          broadcastToWeb({ type: 'phone-status', connected: true });
        } else if (data.client === 'web') {
          webSockets.add(ws);
          console.log('[WebSocket] Painel Web registrado');
          // Envia o status atual do telefone para a nova aba aberta
          ws.send(JSON.stringify({ 
            type: 'phone-status', 
            connected: !!(phoneSocket && phoneSocket.readyState === WebSocket.OPEN) 
          }));
        }
      }
    } catch (err) {
      console.error('[WebSocket] Erro ao processar mensagem:', err);
    }
  });

  ws.on('close', () => {
    if (ws === phoneSocket) {
      console.log('[WebSocket] Telefone desconectado 🔴');
      phoneSocket = null;
      broadcastToWeb({ type: 'phone-status', connected: false });
    } else {
      webSockets.delete(ws);
      console.log('[WebSocket] Painel Web desconectado');
    }
  });
});

// ─── Endpoints REST da API ───────────────────────────────────────────────────

// Status do telefone
app.get('/api/phone-status', (req, res) => {
  const connected = !!(phoneSocket && phoneSocket.readyState === WebSocket.OPEN);
  res.json({ connected });
});

// Sincronização de Dados com o Celular
app.get('/api/sync', (req, res) => {
  const db = readDb();
  res.json({
    medicines: db.medicines,
    schedules: db.schedules,
    schedule_medicines: db.schedule_medicines,
  });
});

// Atualiza remédios/horários a partir do painel web
app.post('/api/sync', (req, res) => {
  const { medicines, schedules, schedule_medicines } = req.body;
  if (!medicines || !schedules || !schedule_medicines) {
    return res.status(400).json({ error: 'Payload incompleto para sincronização.' });
  }

  const db = readDb();
  db.medicines = medicines;
  db.schedules = schedules;
  db.schedule_medicines = schedule_medicines;
  writeDb(db);

  console.log('[API] Banco atualizado via painel web');
  
  // Avisa o app conectado via websocket que os dados mudaram, para ele dar sync
  if (phoneSocket && phoneSocket.readyState === WebSocket.OPEN) {
    phoneSocket.send(JSON.stringify({ type: 'data-changed' }));
  }

  res.json({ success: true });
});

// Confirmações
app.get('/api/confirmations', (req, res) => {
  const db = readDb();
  // Ordena por confirmação decrescente (mais recentes primeiro)
  const sorted = [...db.confirmations].sort((a, b) => 
    new Date(b.confirmed_at).getTime() - new Date(a.confirmed_at).getTime()
  );
  res.json(sorted);
});

app.post('/api/confirmations', (req, res) => {
  const confirmation = req.body; // { medication_id, schedule_id, status, confirmed_at, date }
  if (!confirmation.medication_id || !confirmation.schedule_id || !confirmation.status) {
    return res.status(400).json({ error: 'Confirmação inválida.' });
  }

  const db = readDb();
  
  // Evitar duplicatas idênticas de confirmação no mesmo dia
  const existe = db.confirmations.some(c => 
    c.schedule_id === confirmation.schedule_id && 
    c.medication_id === confirmation.medication_id && 
    c.date === confirmation.date
  );

  if (!existe) {
    const nextId = db.confirmations.reduce((max, c) => Math.max(max, c.id), 0) + 1;
    const nova = { id: nextId, ...confirmation };
    db.confirmations.push(nova);
    writeDb(db);
    
    console.log(`[API] Nova confirmação adicionada: med ${confirmation.medication_id} no schedule ${confirmation.schedule_id}`);
    
    // Broadcast para todos os painéis web conectados atualizarem a tela de histórico
    broadcastToWeb({ type: 'new-confirmation', confirmation: nova });
  }

  res.json({ success: true });
});

// Disparo de teste de alarme (chamado pelo Painel Web)
app.post('/api/test-alarm/:id', (req, res) => {
  const scheduleId = parseInt(req.params.id, 10);
  
  if (phoneSocket && phoneSocket.readyState === WebSocket.OPEN) {
    phoneSocket.send(JSON.stringify({ type: 'trigger-alarm', scheduleId }));
    console.log(`[WebSocket] Comando de teste enviado para o celular: Alarme ${scheduleId}`);
    return res.json({ success: true, message: 'Alarme disparado no telefone com sucesso.' });
  } else {
    console.warn(`[WebSocket] Falha no disparo: celular não conectado.`);
    return res.status(404).json({ success: false, error: 'O telefone da Dona Fátima não está conectado ao servidor.' });
  }
});

// ─── Inicialização do Servidor ───────────────────────────────────────────────

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`   🚀 Servidor do Painel Web iniciado com sucesso!`);
  console.log(`   💻 Painel de Controle: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
