const TOKEN_KEY = 'bf_admin_token';

const state = {
  token: localStorage.getItem(TOKEN_KEY) || null,
  usuario: null,
  contas: [],
  financeiro: null,
};

const $ = (id) => document.getElementById(id);

function fmtBRL(v) {
  return (parseFloat(v || 0) || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function fmtDataBR(d) {
  if (!d) return '-';
  const p = String(d).slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(d);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const res = await fetch(`/api${path}`, {
    ...opts,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') {
      sair();
    }
    throw new Error(data.erro || `Erro HTTP ${res.status}`);
  }
  return data;
}

function mostrarView(logado) {
  $('login-view').classList.toggle('hidden', logado);
  $('app-view').classList.toggle('hidden', !logado);
}

function sair() {
  state.token = null;
  state.usuario = null;
  localStorage.removeItem(TOKEN_KEY);
  mostrarView(false);
}

function abrirModal(id) {
  $(id).classList.remove('hidden');
}

function fecharModal(id) {
  $(id).classList.add('hidden');
}

// ── Login ─────────────────────────────────────────────────────
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const erroEl = $('login-erro');
  erroEl.classList.add('hidden');

  const usuario = $('login-usuario').value.trim();
  const senha = $('login-senha').value;

  try {
    const res = await api('/auth/login', {
      method: 'POST',
      body: { usuario, senha },
    });

    if (res.usuario?.role !== 'admin') {
      throw new Error('Esta conta não possui permissão de administrador.');
    }

    state.token = res.token;
    state.usuario = res.usuario;
    localStorage.setItem(TOKEN_KEY, res.token);
    iniciarPainel();
  } catch (err) {
    erroEl.textContent = err.message;
    erroEl.classList.remove('hidden');
  }
});

$('btn-sair').addEventListener('click', sair);

// ── Navegação por Abas ────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const alvo = btn.dataset.tab;
    $('tab-contas').classList.toggle('hidden', alvo !== 'contas');
    $('tab-financeiro').classList.toggle('hidden', alvo !== 'financeiro');
    if (alvo === 'financeiro') carregarFinanceiro();
  });
});

document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => fecharModal(btn.dataset.close));
});

// ── Contas SaaS ───────────────────────────────────────────────
async function carregarContas() {
  state.contas = await api('/auth/usuarios');
  renderContas();
}

function renderContas() {
  const termo = $('busca-contas').value.trim().toLowerCase();
  const filtradas = state.contas.filter((u) => {
    if (!termo) return true;
    return (
      u.username.toLowerCase().includes(termo) ||
      u.nome.toLowerCase().includes(termo) ||
      (u.nome_salao || '').toLowerCase().includes(termo) ||
      (u.plano || '').toLowerCase().includes(termo)
    );
  });

  const totalContas = state.contas.length;
  const ativas = state.contas.filter((u) => u.ativo).length;
  const totalClientes = state.contas.reduce((s, u) => s + (u.total_clientes || 0), 0);
  const totalAgs = state.contas.reduce((s, u) => s + (u.total_agendamentos || 0), 0);

  $('contas-kpis').innerHTML = `
    <div class="kpi-card"><div class="kpi-label">Total de Contas</div><div class="kpi-val">${totalContas}</div></div>
    <div class="kpi-card"><div class="kpi-label">Contas Ativas</div><div class="kpi-val c-green">${ativas}</div></div>
    <div class="kpi-card"><div class="kpi-label">Clientes Cadastradas (SaaS)</div><div class="kpi-val c-pink">${totalClientes}</div></div>
    <div class="kpi-card"><div class="kpi-label">Agendamentos Totais</div><div class="kpi-val">${totalAgs}</div></div>
  `;

  const tbody = $('tabela-contas');
  if (filtradas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Nenhuma conta encontrada.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtradas
    .map((u) => {
      const roleBadge = u.role === 'admin'
        ? '<span class="badge b-pink">Admin</span>'
        : '<span class="badge b-gray">Agenda</span>';
      const statusBadge = u.ativo
        ? '<span class="badge b-green">Ativa</span>'
        : '<span class="badge b-red">Desativada</span>';
      const ehPropria = u.id === state.usuario?.id;

      return `
        <tr>
          <td>
            <strong>${esc(u.nome)}</strong> ${roleBadge}<br/>
            <span class="muted">@${esc(u.username)}${u.nome_salao ? ` · ${esc(u.nome_salao)}` : ''}</span>
          </td>
          <td>
            <strong>${esc(u.plano || 'Profissional')}</strong><br/>
            <span class="muted">${fmtBRL(u.valor_mensal)}/mês · venc. dia ${u.dia_vencimento || 10}</span>
          </td>
          <td>
            <span>${u.waha_session ? `WAHA: <strong>${esc(u.waha_session)}</strong>` : '<span class="muted">Sem WAHA</span>'}</span><br/>
            <span class="muted">${esc(u.cidade_nome || 'Cidade padrão')}</span>
          </td>
          <td>
            <strong>${u.total_clientes || 0}</strong> clientes<br/>
            <span class="muted">${u.total_agendamentos || 0} atendimentos</span>
          </td>
          <td>${statusBadge}</td>
          <td class="right">
            <button class="btn btn-ghost btn-sm" onclick="editarConta(${u.id})">Editar</button>
            ${!ehPropria ? `
              <button class="btn ${u.ativo ? 'btn-danger' : 'btn-success'} btn-sm" onclick="alternarAtivo(${u.id}, ${!u.ativo})">
                ${u.ativo ? 'Bloquear' : 'Ativar'}
              </button>
              <button class="btn btn-danger btn-sm" onclick="excluirConta(${u.id}, '${esc(u.username)}')">Excluir</button>
            ` : ''}
          </td>
        </tr>
      `;
    })
    .join('');
}

$('busca-contas').addEventListener('input', renderContas);
$('btn-recarregar-contas').addEventListener('click', carregarContas);

$('btn-nova-conta').addEventListener('click', () => {
  $('modal-conta-titulo').textContent = 'Nova Conta SaaS';
  $('conta-id').value = '';
  $('conta-erro').classList.add('hidden');
  $('form-conta').reset();
  $('conta-role').value = 'user';
  $('conta-plano').value = 'Profissional';
  $('conta-vencimento').value = '10';
  $('conta-ativo').checked = true;
  $('conta-senha').required = true;
  $('conta-senha-hint').textContent = '(mín. 6 caracteres) *';
  abrirModal('modal-conta');
});

window.editarConta = (id) => {
  const u = state.contas.find((c) => c.id === id);
  if (!u) return;
  $('modal-conta-titulo').textContent = `Editar @${u.username}`;
  $('conta-id').value = u.id;
  $('conta-erro').classList.add('hidden');
  $('conta-username').value = u.username;
  $('conta-senha').value = '';
  $('conta-senha').required = false;
  $('conta-senha-hint').textContent = '(deixe vazio para manter a atual)';
  $('conta-nome').value = u.nome || '';
  $('conta-salao').value = u.nome_salao || '';
  $('conta-email').value = u.email || '';
  $('conta-role').value = u.role || 'user';
  $('conta-plano').value = u.plano || 'Profissional';
  $('conta-valor').value = u.valor_mensal ?? 0;
  $('conta-vencimento').value = u.dia_vencimento || 10;
  $('conta-waha').value = u.waha_session || '';
  $('conta-cidade').value = u.cidade_nome || '';
  $('conta-lat').value = u.cidade_lat || '';
  $('conta-lon').value = u.cidade_lon || '';
  $('conta-obs').value = u.observacao_admin || '';
  $('conta-ativo').checked = Boolean(u.ativo);
  abrirModal('modal-conta');
};

window.alternarAtivo = async (id, novoAtivo) => {
  try {
    await api(`/auth/usuarios/${id}`, {
      method: 'PATCH',
      body: { ativo: novoAtivo },
    });
    await carregarContas();
  } catch (err) {
    alert(err.message);
  }
};

window.excluirConta = async (id, username) => {
  if (!confirm(`Tem certeza que deseja excluir a conta @${username}? Todos os dados vinculados a ela serão apagados.`)) {
    return;
  }
  try {
    await api(`/auth/usuarios/${id}`, { method: 'DELETE' });
    await carregarContas();
  } catch (err) {
    alert(err.message);
  }
};

$('form-conta').addEventListener('submit', async (e) => {
  e.preventDefault();
  const erroEl = $('conta-erro');
  erroEl.classList.add('hidden');

  const id = $('conta-id').value;
  const payload = {
    username: $('conta-username').value.trim(),
    nome: $('conta-nome').value.trim(),
    nome_salao: $('conta-salao').value.trim() || null,
    email: $('conta-email').value.trim() || null,
    role: $('conta-role').value,
    plano: $('conta-plano').value.trim() || 'Profissional',
    valor_mensal: parseFloat($('conta-valor').value || 0) || 0,
    dia_vencimento: parseInt($('conta-vencimento').value || 10, 10),
    waha_session: $('conta-waha').value.trim() || null,
    cidade_nome: $('conta-cidade').value.trim() || null,
    cidade_lat: $('conta-lat').value.trim() || null,
    cidade_lon: $('conta-lon').value.trim() || null,
    observacao_admin: $('conta-obs').value.trim() || null,
    ativo: $('conta-ativo').checked,
  };
  const senha = $('conta-senha').value;
  if (senha) payload.senha = senha;

  try {
    if (id) {
      await api(`/auth/usuarios/${id}`, { method: 'PATCH', body: payload });
    } else {
      await api('/auth/usuarios', { method: 'POST', body: payload });
    }
    fecharModal('modal-conta');
    await carregarContas();
  } catch (err) {
    erroEl.textContent = err.message;
    erroEl.classList.remove('hidden');
  }
});

// ── Financeiro SaaS ───────────────────────────────────────────
function competenciaAtual() {
  const dt = new Date();
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

$('fin-competencia').value = competenciaAtual();
$('fin-competencia').addEventListener('change', carregarFinanceiro);

async function carregarFinanceiro() {
  const comp = $('fin-competencia').value || competenciaAtual();
  state.financeiro = await api(`/admin/financeiro?competencia=${encodeURIComponent(comp)}`);
  renderFinanceiro();
}

function renderFinanceiro() {
  const f = state.financeiro;
  if (!f) return;
  const { kpis, mensalidades, despesas, historico } = f;

  $('fin-kpis').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">MRR Previsto</div>
      <div class="kpi-val c-pink">${fmtBRL(kpis.mrrPrevisto)}</div>
      <div class="kpi-sub">Mensalidades ativas</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Recebido no Mês</div>
      <div class="kpi-val c-green">${fmtBRL(kpis.recebidoMes)}</div>
      <div class="kpi-sub">${kpis.contasPagas} conta(s) paga(s)</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">A Receber</div>
      <div class="kpi-val c-amber">${fmtBRL(kpis.aReceberMes)}</div>
      <div class="kpi-sub">${kpis.contasPendentes} pendente(s)</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Despesas SaaS</div>
      <div class="kpi-val c-red">${fmtBRL(kpis.despesasMes)}</div>
      <div class="kpi-sub">${despesas.length} lançamento(s)</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Lucro Líquido SaaS</div>
      <div class="kpi-val ${kpis.lucroLiquido >= 0 ? 'c-green' : 'c-red'}">${fmtBRL(kpis.lucroLiquido)}</div>
      <div class="kpi-sub">Recebido - Despesas</div>
    </div>
  `;

  // Gráfico 6 meses
  const maxVal = Math.max(
    1,
    ...historico.map((h) => Math.max(h.recebido, h.despesas))
  );
  $('fin-grafico').innerHTML = historico
    .map((h) => {
      const altIn = Math.max(4, Math.round((h.recebido / maxVal) * 96));
      const altOut = Math.max(4, Math.round((h.despesas / maxVal) * 96));
      const [a, m] = h.competencia.split('-');
      return `
        <div class="bar-col">
          <div class="bar-val">${fmtBRL(h.recebido)}</div>
          <div class="bar-pair">
            <div class="bar bar-in" style="height:${altIn}px" title="Recebido: ${fmtBRL(h.recebido)}"></div>
            <div class="bar bar-out" style="height:${altOut}px" title="Despesas: ${fmtBRL(h.despesas)}"></div>
          </div>
          <div class="bar-label">${m}/${a.slice(2)}</div>
        </div>
      `;
    })
    .join('');

  // Tabela mensalidades
  $('tabela-mensalidades').innerHTML = mensalidades
    .map((m) => {
      let badge = '<span class="badge b-gray">Isento</span>';
      if (m.status === 'pago') badge = '<span class="badge b-green">Pago</span>';
      else if (m.status === 'pendente') badge = '<span class="badge b-amber">Pendente</span>';

      return `
        <tr>
          <td>
            <strong>${esc(m.nome)}</strong><br/>
            <span class="muted">@${esc(m.username)} · ${esc(m.plano)}</span>
          </td>
          <td>
            <strong>${fmtBRL(m.valor)}</strong><br/>
            <span class="muted">Dia ${m.dia_vencimento}${m.data_pagamento ? ` · pago ${fmtDataBR(m.data_pagamento)}` : ''}</span>
          </td>
          <td>
            ${badge}
            ${m.forma_pagamento && m.status === 'pago' ? `<div class="muted">${esc(m.forma_pagamento)}</div>` : ''}
          </td>
          <td class="right">
            <button class="btn btn-primary btn-sm" onclick="abrirModalPagamento(${m.usuario_id})">
              ${m.status === 'pago' ? 'Editar' : 'Dar Baixa'}
            </button>
          </td>
        </tr>
      `;
    })
    .join('');

  // Tabela despesas
  if (despesas.length === 0) {
    $('tabela-despesas').innerHTML = `<tr><td colspan="4" class="muted">Nenhuma despesa registrada neste mês.</td></tr>`;
  } else {
    $('tabela-despesas').innerHTML = despesas
      .map(
        (d) => `
        <tr>
          <td>
            <strong>${esc(d.descricao)}</strong><br/>
            <span class="muted">${esc(d.categoria || 'Outros')}${d.observacao ? ` · ${esc(d.observacao)}` : ''}</span>
          </td>
          <td>${fmtDataBR(d.data)}</td>
          <td class="c-red"><strong>${fmtBRL(d.valor)}</strong></td>
          <td class="right">
            <button class="btn btn-danger btn-sm" onclick="excluirDespesa(${d.id})">Excluir</button>
          </td>
        </tr>
      `
      )
      .join('');
  }
}

window.abrirModalPagamento = (usuarioId) => {
  const m = state.financeiro?.mensalidades?.find((x) => x.usuario_id === usuarioId);
  if (!m) return;
  $('pag-usuario-id').value = m.usuario_id;
  $('pag-conta-info').textContent = `${m.nome} (@${m.username}) — Competência ${state.financeiro.competencia}`;
  $('pag-valor').value = m.valor || m.valor_mensal || 0;
  $('pag-status').value = m.status === 'isento' && m.valor_mensal > 0 ? 'pago' : (m.status === 'pendente' ? 'pago' : m.status);
  $('pag-data').value = m.data_pagamento ? String(m.data_pagamento).slice(0, 10) : new Date().toISOString().slice(0, 10);
  $('pag-forma').value = m.forma_pagamento || 'Pix';
  $('pag-obs').value = m.observacao || '';
  abrirModal('modal-pagamento');
};

$('form-pagamento').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/admin/financeiro/pagamentos', {
      method: 'POST',
      body: {
        usuario_id: parseInt($('pag-usuario-id').value, 10),
        competencia: $('fin-competencia').value || competenciaAtual(),
        valor: parseFloat($('pag-valor').value || 0),
        status: $('pag-status').value,
        data_pagamento: $('pag-data').value || null,
        forma_pagamento: $('pag-forma').value,
        observacao: $('pag-obs').value.trim() || null,
      },
    });
    fecharModal('modal-pagamento');
    await carregarFinanceiro();
  } catch (err) {
    alert(err.message);
  }
});

$('btn-nova-despesa').addEventListener('click', () => {
  $('form-despesa').reset();
  $('desp-data').value = new Date().toISOString().slice(0, 10);
  abrirModal('modal-despesa');
});

$('form-despesa').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/admin/financeiro/despesas', {
      method: 'POST',
      body: {
        descricao: $('desp-desc').value.trim(),
        categoria: $('desp-cat').value,
        valor: parseFloat($('desp-valor').value || 0),
        data: $('desp-data').value,
        observacao: $('desp-obs').value.trim() || null,
      },
    });
    fecharModal('modal-despesa');
    await carregarFinanceiro();
  } catch (err) {
    alert(err.message);
  }
});

window.excluirDespesa = async (id) => {
  if (!confirm('Remover esta despesa?')) return;
  try {
    await api(`/admin/financeiro/despesas/${id}`, { method: 'DELETE' });
    await carregarFinanceiro();
  } catch (err) {
    alert(err.message);
  }
};

// ── Inicialização ─────────────────────────────────────────────
async function iniciarPainel() {
  $('admin-nome').textContent = `@${state.usuario.username}`;
  mostrarView(true);
  await carregarContas();
}

(async function boot() {
  if (!state.token) {
    mostrarView(false);
    return;
  }
  try {
    const res = await api('/auth/me');
    if (res.usuario?.role !== 'admin') {
      sair();
      return;
    }
    state.usuario = res.usuario;
    await iniciarPainel();
  } catch {
    sair();
  }
})();
