// Estado da aplicação
let state = {
  medicines: [],
  schedules: [],
  schedule_medicines: [],
  confirmations: [],
  phoneConnected: false
};

const COLOR_PRESETS = [
  { name: 'Azul', value: '#3498DB' },
  { name: 'Vermelho', value: '#E74C3C' },
  { name: 'Verde', value: '#2ECC71' },
  { name: 'Amarelo', value: '#F1C40F' },
  { name: 'Laranja', value: '#E67E22' },
  { name: 'Roxo', value: '#9B59B6' },
  { name: 'Rosa', value: '#E91E63' },
  { name: 'Cinza', value: '#7F8C8D' }
];

// URLs base
const API_BASE = window.location.origin;
const WS_BASE = `ws://${window.location.host}`;

// DOM Elements
const elements = {
  statusLed: document.getElementById('status-led'),
  statusText: document.getElementById('status-text'),
  
  // Tabs
  navBtns: document.querySelectorAll('.nav-btn'),
  tabPanels: document.querySelectorAll('.tab-panel'),
  
  // Dashboard Metrics
  metricTotalMeds: document.getElementById('metric-total-meds'),
  metricTakenToday: document.getElementById('metric-taken-today'),
  metricTempTreatments: document.getElementById('metric-temp-treatments'),
  
  // Containers
  historyContainer: document.getElementById('history-container'),
  nextAlarmTime: document.getElementById('next-alarm-time'),
  nextAlarmTitle: document.getElementById('next-alarm-title'),
  nextAlarmMeds: document.getElementById('next-alarm-meds'),
  testGrid: document.getElementById('test-schedules-grid'),
  schedulesEditList: document.getElementById('schedules-edit-list'),
  medicinesListGrid: document.getElementById('medicines-list-grid'),
  
  // Modal
  medModal: document.getElementById('medicine-modal'),
  modalTitle: document.getElementById('modal-title'),
  btnCloseModal: document.getElementById('btn-close-modal'),
  medForm: document.getElementById('medicine-form'),
  formMedId: document.getElementById('form-med-id'),
  formNome: document.getElementById('form-med-nome'),
  formDosagem: document.getElementById('form-med-dosagem'),
  formFuncao: document.getElementById('form-med-funcao'),
  formCor: document.getElementById('form-med-cor'),
  formTemporario: document.getElementById('form-med-temporario'),
  tempDaysContainer: document.getElementById('temp-days-container'),
  formDias: document.getElementById('form-med-dias'),
  formObservacao: document.getElementById('form-med-observacao'),
  colorPresetsContainer: document.getElementById('color-presets-container'),
  schedulesChecklistContainer: document.getElementById('schedules-checklist-container'),
  btnDeleteMed: document.getElementById('btn-delete-med'),
  
  // Toast
  toast: document.getElementById('toast')
};

// ─── Inicialização ───────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupModal();
  setupFormColorPresets();
  loadData();
  setupWebSocket();
});

// ─── Navegação de Abas ───────────────────────────────────────────────────────

function setupTabs() {
  elements.navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      
      elements.navBtns.forEach(b => b.classList.remove('active'));
      elements.tabPanels.forEach(p => p.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(`panel-${tab}`).classList.add('active');
    });
  });
}

// ─── Feedback Visual (Toast) ─────────────────────────────────────────────────

function showToast(message, isError = false) {
  elements.toast.textContent = message;
  elements.toast.className = 'toast';
  if (isError) elements.toast.classList.add('error');
  elements.toast.classList.add('active');
  
  setTimeout(() => {
    elements.toast.classList.remove('active');
  }, 4000);
}

// ─── Conexão WebSocket ───────────────────────────────────────────────────────

function setupWebSocket() {
  let ws = new WebSocket(WS_BASE);

  ws.onopen = () => {
    console.log('[WebSocket] Conectado ao servidor');
    ws.send(JSON.stringify({ type: 'register', client: 'web' }));
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      if (data.type === 'phone-status') {
        updatePhoneStatus(data.connected);
      } else if (data.type === 'new-confirmation') {
        showToast(`Dona Fátima confirmou um remédio! ✓`);
        // Recarrega confirmações e atualiza a tela
        fetchConfirmations();
      }
    } catch (err) {
      console.error('[WebSocket] Erro na mensagem:', err);
    }
  };

  ws.onclose = () => {
    console.log('[WebSocket] Conexão fechada. Tentando reconectar em 5s...');
    setTimeout(setupWebSocket, 5000);
  };
}

function updatePhoneStatus(connected) {
  state.phoneConnected = connected;
  if (connected) {
    elements.statusLed.className = 'status-led led-green';
    elements.statusText.textContent = 'Dona Fátima: Conectada 🟢';
  } else {
    elements.statusLed.className = 'status-led led-red';
    elements.statusText.textContent = 'Dona Fátima: Desconectada 🔴';
  }
}

// ─── Carregamento e Envio de Dados (HTTP APIs) ───────────────────────────────

async function loadData() {
  try {
    const [syncRes, confirmationsRes] = await Promise.all([
      fetch(`${API_BASE}/api/sync`),
      fetch(`${API_BASE}/api/confirmations`)
    ]);

    const syncData = await syncRes.json();
    state.medicines = syncData.medicines || [];
    state.schedules = syncData.schedules || [];
    state.schedule_medicines = syncData.schedule_medicines || [];
    state.confirmations = await confirmationsRes.json();

    renderAll();
  } catch (err) {
    console.error('[API] Erro ao carregar dados:', err);
    showToast('Erro ao carregar dados do servidor.', true);
  }
}

async function fetchConfirmations() {
  try {
    const res = await fetch(`${API_BASE}/api/confirmations`);
    state.confirmations = await res.json();
    renderDashboard();
  } catch (err) {
    console.error('[API] Erro ao carregar confirmações:', err);
  }
}

async function saveSyncState() {
  try {
    const res = await fetch(`${API_BASE}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        medicines: state.medicines,
        schedules: state.schedules,
        schedule_medicines: state.schedule_medicines
      })
    });
    
    if (!res.ok) throw new Error('Falha HTTP');
    showToast('Alterações salvas e sincronizadas com o celular!');
    loadData(); // Recarrega
  } catch (err) {
    console.error('[API] Erro ao sincronizar dados:', err);
    showToast('Erro ao salvar alterações no servidor.', true);
  }
}

// Dispara um sinal de teste
async function triggerTestAlarm(scheduleId) {
  if (!state.phoneConnected) {
    showToast('Aviso: O celular da Dona Fátima não está conectado no momento.', true);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/test-alarm/${scheduleId}`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      showToast('Sinal enviado! O celular está tocando o alarme agora.');
    } else {
      showToast(data.error || 'Erro ao disparar teste.', true);
    }
  } catch (err) {
    showToast('Falha na requisição de teste.', true);
  }
}

// ─── Renderização da Interface ───────────────────────────────────────────────

function renderAll() {
  renderDashboard();
  renderTestTab();
  renderSchedulesTab();
  renderMedicinesTab();
}

// Tab 1: Dashboard
function renderDashboard() {
  // 1. Métricas superiores
  elements.metricTotalMeds.textContent = state.medicines.length;
  
  const hoje = new Date().toISOString().split('T')[0];
  const confirmadosHoje = state.confirmations.filter(c => c.date === hoje && c.status === 'confirmed').length;
  elements.metricTakenToday.textContent = confirmadosHoje;

  const temporarios = state.medicines.filter(m => m.temporario === 1).length;
  elements.metricTempTreatments.textContent = temporarios;

  // 2. Histórico recente
  elements.historyContainer.innerHTML = '';
  if (state.confirmations.length === 0) {
    elements.historyContainer.innerHTML = '<div class="empty-state">Nenhuma confirmação recente.</div>';
  } else {
    // Pegar as 10 mais recentes
    state.confirmations.slice(0, 10).forEach(c => {
      const med = state.medicines.find(m => m.id === c.medication_id);
      const schedule = state.schedules.find(s => s.id === c.schedule_id);
      
      const item = document.createElement('div');
      item.className = 'history-item';
      
      const dataFormatada = new Date(c.confirmed_at).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
      });
      const diaFormatado = new Date(c.confirmed_at).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit'
      });

      item.innerHTML = `
        <span class="history-status-dot"></span>
        <div class="history-content">
          <div class="history-name">${med ? med.nome : 'Remédio'} (${med ? med.dosagem : ''})</div>
          <div class="history-time">Grupo: ${schedule ? schedule.titulo : ''} às ${schedule ? schedule.hora : ''}</div>
        </div>
        <div class="history-time-badge">${diaFormatado} ${dataFormatada}</div>
        <span class="history-badge">Tomado ✓</span>
      `;
      elements.historyContainer.appendChild(item);
    });
  }

  // 3. Próximo Alarme
  const proximo = getProximoHorario(state.schedules);
  if (proximo) {
    elements.nextAlarmTime.textContent = proximo.hora;
    elements.nextAlarmTitle.textContent = `${proximo.emoji} ${proximo.titulo}`;
    
    // Lista remédios deste próximo alarme
    const ids = state.schedule_medicines
      .filter(sm => sm.schedule_id === proximo.id)
      .map(sm => sm.medicine_id);
    const nomes = state.medicines
      .filter(m => ids.includes(m.id))
      .map(m => m.nome)
      .join(', ');
      
    elements.nextAlarmMeds.textContent = nomes ? `Remédios: ${nomes}` : 'Nenhum remédio vinculado';
  } else {
    elements.nextAlarmTime.textContent = '--:--';
    elements.nextAlarmTitle.textContent = 'Sem alarmes';
    elements.nextAlarmMeds.textContent = 'Cadastre horários e remédios.';
  }
}

// Tab 2: Testes/Simulações
function renderTestTab() {
  elements.testGrid.innerHTML = '';
  state.schedules.forEach(h => {
    const card = document.createElement('div');
    card.className = 'card-sim';

    const linkedMeds = state.schedule_medicines
      .filter(sm => sm.schedule_id === h.id)
      .map(sm => {
        const m = state.medicines.find(x => x.id === sm.medicine_id);
        return m ? `${m.nome} (${m.dosagem})` : '';
      })
      .filter(Boolean);

    card.innerHTML = `
      <div class="sim-header">
        <span class="sim-emoji">${h.emoji}</span>
        <div class="sim-info">
          <h3>${h.titulo}</h3>
          <div class="time">${h.hora}</div>
        </div>
      </div>
      <div class="sim-meds">
        <strong>Remédios:</strong> ${linkedMeds.join(', ') || 'Nenhum'}
      </div>
      <button class="btn-test-trigger" data-id="${h.id}">Tocar Alarme no Celular ⏰</button>
    `;

    // Event Listener
    card.querySelector('.btn-test-trigger').addEventListener('click', () => {
      triggerTestAlarm(h.id);
    });

    elements.testGrid.appendChild(card);
  });
}

// Tab 3: Horários
function renderSchedulesTab() {
  elements.schedulesEditList.innerHTML = '';
  state.schedules.forEach(h => {
    const row = document.createElement('div');
    row.className = 'schedule-row';

    row.innerHTML = `
      <div class="schedule-row-left">
        <span class="schedule-row-emoji">${h.emoji}</span>
        <div class="schedule-row-title">
          <h3>${h.titulo}</h3>
          <p>Fala de áudio: "${h.mensagem_voz}"</p>
        </div>
      </div>
      <div class="schedule-row-right">
        <div class="time-edit-container" id="time-container-${h.id}">
          <span class="schedule-time-text">${h.hora}</span>
          <button class="btn btn-edit-web btn-edit-time" data-id="${h.id}" data-time="${h.hora}">Ajustar Hora ✏️</button>
        </div>
      </div>
    `;

    // Edição inline de horário
    const btnEdit = row.querySelector('.btn-edit-time');
    btnEdit.addEventListener('click', () => {
      const container = document.getElementById(`time-container-${h.id}`);
      const curTime = btnEdit.dataset.time;
      
      container.innerHTML = `
        <input type="text" class="time-input-web" value="${curTime}" maxlength="5" id="input-time-${h.id}">
        <button class="btn btn-primary btn-save-time" data-id="${h.id}">Salvar</button>
        <button class="btn btn-danger btn-cancel-time" data-id="${h.id}" data-time="${curTime}">X</button>
      `;

      // Cancelar edição
      container.querySelector('.btn-cancel-time').addEventListener('click', () => {
        renderSchedulesTab();
      });

      // Salvar horário
      container.querySelector('.btn-save-time').addEventListener('click', () => {
        const inputVal = document.getElementById(`input-time-${h.id}`).value.trim();
        const timeRegex = /^[0-2][0-9]:[0-5][0-9]$/;
        
        if (!timeRegex.test(inputVal)) {
          alert('Formato inválido! Use o formato 24h HH:MM (ex: 08:30).');
          return;
        }

        // Atualiza localmente
        const idx = state.schedules.findIndex(s => s.id === h.id);
        if (idx !== -1) {
          state.schedules[idx].hora = inputVal;
          // Envia para o servidor e reagenda tudo
          saveSyncState();
        }
      });
    });

    elements.schedulesEditList.appendChild(row);
  });
}

// Tab 4: Medicamentos
function renderMedicinesTab() {
  elements.medicinesListGrid.innerHTML = '';
  state.medicines.forEach(m => {
    const card = document.createElement('div');
    card.className = 'card-med';

    const linkedSchedules = state.schedule_medicines
      .filter(sm => sm.medicine_id === m.id)
      .map(sm => {
        const s = state.schedules.find(x => x.id === sm.schedule_id);
        return s ? s.hora : '';
      })
      .filter(Boolean);

    card.innerHTML = `
      <div class="med-color-top" style="background-color: ${m.cor};"></div>
      <div class="med-title-row">
        <span class="med-nome">${m.nome}</span>
        <span class="med-dosagem">${m.dosagem}</span>
      </div>
      <div class="med-funcao">${m.funcao}</div>
      
      <div class="med-meta-row">
        <span class="med-badge" style="background-color: ${m.cor}20; color: ${m.cor};">Cor</span>
        ${m.temporario === 1 ? `<span class="med-badge badge-yellow">⌛ Temporário (${m.dias_restantes} dias)</span>` : ''}
      </div>

      <div class="med-schedules">
        <strong>Alarmes:</strong> ${linkedSchedules.join(' · ') || 'Nenhum'}
      </div>
    `;

    // Abrir edição ao clicar
    card.addEventListener('click', () => {
      abrirModalMedicamento(m);
    });

    elements.medicinesListGrid.appendChild(card);
  });
}

// Helper: Próximo horário
function getProximoHorario(schedules) {
  if (!schedules || schedules.length === 0) return null;
  const agora = new Date();
  const horaAtual = agora.getHours();
  const minutoAtual = agora.getMinutes();
  const totalMinutosAgora = horaAtual * 60 + minutoAtual;

  const sorted = [...schedules].sort((a, b) => {
    const [hA, mA] = a.hora.split(':').map(Number);
    const [hB, mB] = b.hora.split(':').map(Number);
    return (hA * 60 + mA) - (hB * 60 + mB);
  });

  for (const h of sorted) {
    const [hour, minute] = h.hora.split(':').map(Number);
    const totalMinutosHorario = hour * 60 + minute;
    if (totalMinutosHorario > totalMinutosAgora) {
      return h;
    }
  }
  return sorted[0];
}

// ─── Modal & Formulário de Medicamento ───────────────────────────────────────

function setupModal() {
  elements.btnCloseModal.addEventListener('click', () => {
    elements.medModal.classList.remove('active');
  });

  elements.formTemporario.addEventListener('change', (e) => {
    if (e.target.checked) {
      elements.tempDaysContainer.classList.remove('hidden');
    } else {
      elements.tempDaysContainer.classList.add('hidden');
    }
  });

  elements.btnDeleteMed.addEventListener('click', () => {
    const id = parseInt(elements.formMedId.value, 10);
    const nome = elements.formNome.value;
    
    if (confirm(`Tem certeza que deseja excluir permanentemente o remédio "${nome}"?`)) {
      // Exclui remédio e relações
      state.medicines = state.medicines.filter(m => m.id !== id);
      state.schedule_medicines = state.schedule_medicines.filter(sm => sm.medicine_id !== id);
      
      elements.medModal.classList.remove('active');
      saveSyncState();
    }
  });

  elements.medForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const medIdVal = elements.formMedId.value;
    const nome = elements.formNome.value.trim();
    const dosagem = elements.formDosagem.value.trim();
    const funcao = elements.formFuncao.value.trim();
    const cor = elements.formCor.value;
    const temporario = elements.formTemporario.checked ? 1 : 0;
    const dias_restantes = temporario ? parseInt(elements.formDias.value, 10) : 0;
    const observacao = elements.formObservacao.value.trim() || null;

    // Horários selecionados
    const checkedBoxes = elements.schedulesChecklistContainer.querySelectorAll('input:checked');
    const selectedSchedules = Array.from(checkedBoxes).map(cb => parseInt(cb.value, 10));

    if (medIdVal) {
      // Edição
      const id = parseInt(medIdVal, 10);
      const idx = state.medicines.findIndex(m => m.id === id);
      if (idx !== -1) {
        state.medicines[idx] = { id, nome, dosagem, funcao, cor, temporario, dias_restantes, observacao };
      }
      
      // Limpa e atualiza relações
      state.schedule_medicines = state.schedule_medicines.filter(sm => sm.medicine_id !== id);
      selectedSchedules.forEach(sId => {
        state.schedule_medicines.push({ schedule_id: sId, medicine_id: id });
      });
    } else {
      // Novo
      const nextId = state.medicines.reduce((max, m) => Math.max(max, m.id), 0) + 1;
      state.medicines.push({ id: nextId, nome, dosagem, funcao, cor, temporario, dias_restantes, observacao });
      
      selectedSchedules.forEach(sId => {
        state.schedule_medicines.push({ schedule_id: sId, medicine_id: nextId });
      });
    }

    elements.medModal.classList.remove('active');
    saveSyncState();
  });

  document.getElementById('btn-add-medicine').addEventListener('click', () => {
    abrirModalMedicamento(null);
  });
}

function setupFormColorPresets() {
  elements.colorPresetsContainer.innerHTML = '';
  COLOR_PRESETS.forEach(p => {
    const dot = document.createElement('div');
    dot.className = 'color-dot';
    dot.style.backgroundColor = p.value;
    dot.dataset.color = p.value;
    
    dot.addEventListener('click', () => {
      elements.colorPresetsContainer.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
      dot.classList.add('selected');
      elements.formCor.value = p.value;
    });

    elements.colorPresetsContainer.appendChild(dot);
  });
}

function abrirModalMedicamento(med = null) {
  // Renderiza a checklist de horários dinâmica
  elements.schedulesChecklistContainer.innerHTML = '';
  state.schedules.forEach(s => {
    const isChecked = med ? state.schedule_medicines.some(sm => sm.medicine_id === med.id && sm.schedule_id === s.id) : false;
    
    const label = document.createElement('label');
    label.className = 'chk-item';
    label.innerHTML = `
      <input type="checkbox" value="${s.id}" ${isChecked ? 'checked' : ''}>
      <span>${s.emoji} ${s.hora} — ${s.titulo}</span>
    `;
    elements.schedulesChecklistContainer.appendChild(label);
  });

  if (med) {
    // Editar
    elements.modalTitle.textContent = '✏️ Editar Medicamento';
    elements.formMedId.value = med.id;
    elements.formNome.value = med.nome;
    elements.formDosagem.value = med.dosagem;
    elements.formFuncao.value = med.funcao;
    elements.formCor.value = med.cor;
    
    elements.formTemporario.checked = med.temporario === 1;
    if (med.temporario === 1) {
      elements.tempDaysContainer.classList.remove('hidden');
      elements.formDias.value = med.dias_restantes;
    } else {
      elements.tempDaysContainer.classList.add('hidden');
      elements.formDias.value = 10;
    }
    
    elements.formObservacao.value = med.observacao || '';
    elements.btnDeleteMed.classList.remove('hidden');

    // Seleciona cor correta no preset
    elements.colorPresetsContainer.querySelectorAll('.color-dot').forEach(d => {
      if (d.dataset.color.toLowerCase() === med.cor.toLowerCase()) {
        d.classList.add('selected');
      } else {
        d.classList.remove('selected');
      }
    });
  } else {
    // Novo
    elements.modalTitle.textContent = '➕ Adicionar Novo Medicamento';
    elements.formMedId.value = '';
    elements.formNome.value = '';
    elements.formDosagem.value = '';
    elements.formFuncao.value = '';
    elements.formCor.value = '#3498DB';
    elements.formTemporario.checked = false;
    elements.tempDaysContainer.classList.add('hidden');
    elements.formDias.value = 10;
    elements.formObservacao.value = '';
    elements.btnDeleteMed.classList.add('hidden');

    // Seleciona a primeira cor (Azul) por padrão
    elements.colorPresetsContainer.querySelectorAll('.color-dot').forEach((d, idx) => {
      if (idx === 0) d.classList.add('selected');
      else d.classList.remove('selected');
    });
  }

  elements.medModal.classList.add('active');
}
