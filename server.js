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
    const parsed = JSON.parse(data);
    if (parsed.medicines.length === 0 && parsed.schedules.length === 0) {
      throw new Error("Empty database");
    }
    return parsed;
  } catch (err) {
    console.log('[Server] db.json não existe ou está vazio. Inicializando com dados originais da Dona Fátima...');
    const defaultData = {
      medicines: [
        { id: 1, nome: "Selozok", dosagem: "25mg", funcao: "Controle dos batimentos cardíacos", cor: "#E74C3C", temporario: 0, dias_restantes: 0, observacao: "" },
        { id: 2, nome: "Enalapril", dosagem: "5mg", funcao: "Controle da pressão arterial", cor: "#3498DB", temporario: 0, dias_restantes: 0, observacao: "" },
        { id: 3, nome: "Vascor MR", dosagem: "35mg", funcao: "Oxigenação do coração", cor: "#9B59B6", temporario: 0, dias_restantes: 0, observacao: "" },
        { id: 4, nome: "Slow K", dosagem: "600mg", funcao: "Reposição de potássio", cor: "#E67E22", temporario: 1, dias_restantes: 4, observacao: "Tomar com bastante água" },
        { id: 5, nome: "Escitalopram", dosagem: "10mg", funcao: "Controle da ansiedade e crises de pânico", cor: "#2ECC71", temporario: 0, dias_restantes: 0, observacao: "Tomar separado dos outros medicamentos" },
        { id: 6, nome: "AAS", dosagem: "100mg", funcao: "Evitar coagulação, proteger artérias", cor: "#F1C40F", temporario: 0, dias_restantes: 0, observacao: "Nunca tomar de estômago vazio" },
        { id: 7, nome: "Clopidogrel", dosagem: "75mg", funcao: "Proteger artérias", cor: "#F1C40F", temporario: 0, dias_restantes: 0, observacao: "Nunca tomar de estômago vazio" },
        { id: 8, nome: "Atorvastatina", dosagem: "40mg", funcao: "Controle de gordura e proteção vascular", cor: "#3498DB", temporario: 0, dias_restantes: 0, observacao: "Tomar antes de dormir" }
      ],
      schedules: [
        { id: 1, hora: "08:00", titulo: "Manhã", mensagem_voz: "Dona Fátima, está na hora dos remédios da manhã.", emoji: "🌅" },
        { id: 2, hora: "10:00", titulo: "Meio da Manhã", mensagem_voz: "Dona Fátima, está na hora do remédio da ansiedade.", emoji: "☀️" },
        { id: 3, hora: "13:00", titulo: "Almoço", mensagem_voz: "Dona Fátima, está na hora dos remédios do almoço.", emoji: "🍽️" },
        { id: 4, hora: "20:00", titulo: "Noite", mensagem_voz: "Dona Fátima, está na hora dos remédios da janta.", emoji: "🌙" },
        { id: 5, hora: "22:00", titulo: "Ao Deitar", mensagem_voz: "Dona Fátima, está na hora do remédio do colesterol.", emoji: "😴" }
      ],
      schedule_medicines: [
        { schedule_id: 1, medicine_id: 1 }, { schedule_id: 1, medicine_id: 2 }, { schedule_id: 1, medicine_id: 3 }, { schedule_id: 1, medicine_id: 4 },
        { schedule_id: 2, medicine_id: 5 },
        { schedule_id: 3, medicine_id: 6 }, { schedule_id: 3, medicine_id: 7 },
        { schedule_id: 4, medicine_id: 2 }, { schedule_id: 4, medicine_id: 3 }, { schedule_id: 4, medicine_id: 4 },
        { schedule_id: 5, medicine_id: 8 }
      ],
      confirmations: []
    };
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(defaultData, null, 2), 'utf8');
    } catch (e) {
      console.error('[Server] Falha ao escrever db.json inicial:', e);
    }
    return defaultData;
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
