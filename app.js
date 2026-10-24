'use strict';
/* =========================================================
   Controle Financeiro — versão web ligada ao Google Planilhas
   ========================================================= */
const CLIENT_ID = '616983083876-tbpbapc0q5fkc29rghv04ugu79390kf6.apps.googleusercontent.com';
const SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive.file';
const SCOPES = SCOPE_DRIVE + ' https://www.googleapis.com/auth/userinfo.email';
const SS = 'https://sheets.googleapis.com/v4/spreadsheets';

const SHEETS = {
  Lancamentos: ['id', 'data', 'tipo', 'valor', 'categoria', 'origem', 'pagamento', 'cartao_id', 'cartao_nome', 'parcelas', 'financiamento_id', 'fixo_id', 'descricao', 'criado_em'],
  Cartoes: ['id', 'banco', 'apelido', 'limite', 'ajuste', 'dia_fechamento', 'dia_vencimento'],
  Financiamentos: ['id', 'nome', 'tipo', 'valor_total', 'parcelas', 'valor_mensal', 'pagas_antes', 'dia_vencimento'],
  Fixos: ['id', 'descricao', 'valor', 'categoria', 'pagamento', 'cartao_id', 'dia', 'ativo'],
  Metas: ['categoria', 'limite'],
  Resumos: ['mes', 'entradas', 'gastos', 'sobrou', 'categorias'],
  Config: ['chave', 'valor'],
  Arquivo: ['id', 'data', 'tipo', 'valor', 'categoria', 'origem', 'pagamento', 'cartao_id', 'cartao_nome', 'parcelas', 'financiamento_id', 'fixo_id', 'descricao', 'criado_em']
};
const LOAD_TABS = Object.keys(SHEETS).filter(t => t !== 'Arquivo');
const T = { R: 'Recebimento', G: 'Gasto', F: 'Pagamento de fatura', J: 'Juros' };
const PIX = 'Pix/Débito', CRED = 'Crédito';
const CATS = [['Alimentação', '#2a78d6'], ['Casa', '#eb6834'], ['Contas da casa', '#1baf7a'], ['Transporte', '#eda100'], ['Saúde', '#e87ba4'], ['Pet', '#008300'], ['Lazer', '#6250d6'], ['Educação', '#e34948'], ['Assinaturas', '#4f8fbf'], ['Vestuário', '#b8742f'], ['Financiamentos', '#7b8088'], ['Outros', '#a39d93'], ['Juros do cartão', '#8f2d2d']];
const CATCOL = Object.fromEntries(CATS);
const FORM_CATS = CATS.map(c => c[0]).filter(c => c !== 'Juros do cartão');
const BANKS = ['Nubank', 'Itaú', 'Bradesco', 'Santander', 'Banco do Brasil', 'Caixa', 'Mercado Pago', 'Inter', 'C6 Bank', 'PicPay', 'Neon', 'PagBank', 'XP', 'BTG Pactual', 'Sicoob', 'Sicredi', 'Will Bank', 'Porto Bank', 'Renner', 'Riachuelo', 'Carrefour', 'Outro'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/* ---------------- utilidades ---------------- */
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const ymOf = s => String(s || '').slice(0, 7);
const addM = (ym, k) => { const [y, m] = ym.split('-').map(Number); const t = y * 12 + (m - 1) + k; return Math.floor(t / 12) + '-' + pad(t % 12 + 1); };
const lastDay = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const dayIn = (ym, d) => ym + '-' + pad(Math.min(Math.max(1, d || 1), lastDay(ym)));
const mesNome = ym => { const [y, m] = ym.split('-'); return MESES[+m - 1] + ' de ' + y; };
const mesCurto = ym => { const [y, m] = ym.split('-'); return MESES[+m - 1].slice(0, 3) + '/' + y.slice(2); };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r2 = v => Math.round(v * 100) / 100;
const brl = v => (v < -0.004 ? '-' : '') + 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtIn = v => Math.abs(v) < .005 ? '' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = s => s.slice(8, 10) + '/' + s.slice(5, 7);
const soma = o => Object.values(o).reduce((a, b) => a + b, 0);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const diasAte = iso => Math.round((new Date(iso + 'T12:00:00') - new Date(today() + 'T12:00:00')) / 864e5);
function money(s) { s = String(s ?? '').trim().replace(/[R$\s]/g, ''); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); const v = parseFloat(s); return isFinite(v) ? r2(v) : NaN; }
function num(v) { if (typeof v === 'number') return isFinite(v) ? v : 0; const n = money(v); return isNaN(n) ? 0 : n; }
function int(v) { const n = parseInt(v, 10); return isFinite(n) ? n : 0; }
function toISO(v) {
  if (typeof v === 'number' && isFinite(v)) { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (m) return m[3] + '-' + pad(m[2]) + '-' + pad(m[1]);
  return '';
}
function toYM(v) { if (typeof v === 'number') return ymOf(toISO(v)); const s = String(v || '').trim(); if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7); const m = s.match(/^(\d{1,2})\/(\d{4})$/); return m ? m[2] + '-' + pad(m[1]) : ''; }

/* ---------------- estado ---------------- */
let TK = null, EMAIL = '', SSID = null;
let SID = {}, HEAD = {}, D = {};
let L = [], C = [], F = [], X = [], M = [], RZ = {}, CFG = {};
const ui = { tab: 'resumo', mes: ymOf(today()), tipo: 'G', pag: PIX, panel: null, confirm: null, editSaldo: false, busy: false };

/* ---------------- login Google ---------------- */
let tokenClient = null;
function loadTok() {
  try { const t = JSON.parse(localStorage.getItem('cf-tok') || 'null'); if (t && t.exp > Date.now()) TK = t; } catch (e) {}
  try { EMAIL = localStorage.getItem('cf-email') || ''; } catch (e) {}
}
function saveTok() { try { TK ? localStorage.setItem('cf-tok', JSON.stringify(TK)) : localStorage.removeItem('cf-tok'); } catch (e) {} }
const tokenOk = () => TK && TK.exp > Date.now();
function initGis() {
  if (tokenClient || !(window.google && google.accounts && google.accounts.oauth2)) return;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID, scope: SCOPES, callback: onToken,
    error_callback: e => showLogin(e && e.type === 'popup_closed' ? 'A janela do Google foi fechada antes de terminar. Toque em "Entrar com Google" de novo.' : 'Não deu para abrir o login do Google. Libere janelas pop-up para este site e tente de novo.')
  });
}
function login() {
  initGis();
  if (!tokenClient) { showLogin('O Google ainda está carregando. Espere um instante e toque de novo.'); return; }
  const cfg = { prompt: EMAIL ? '' : 'consent' };
  if (EMAIL) cfg.login_hint = EMAIL;
  tokenClient.requestAccessToken(cfg);
}
async function onToken(resp) {
  if (resp.error) { showLogin('O Google não liberou o acesso. Tente entrar de novo.'); return; }
  if (!google.accounts.oauth2.hasGrantedAllScopes(resp, SCOPE_DRIVE)) { showLogin('O app precisa da permissão para criar e editar a planilha dele. Entre de novo e deixe essa opção marcada.'); return; }
  TK = { token: resp.access_token, exp: Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000 };
  saveTok();
  await start();
}
function logout() {
  try { if (TK && window.google) google.accounts.oauth2.revoke(TK.token, () => {}); } catch (e) {}
  TK = null; saveTok(); EMAIL = ''; try { localStorage.removeItem('cf-email'); } catch (e) {}
  SSID = null; showLogin('');
}

/* ---------------- telas ---------------- */
function showScreen(id) { ['scrLogin', 'scrLoading', 'scrApp'].forEach(s => $(s).hidden = s !== id); $('band').hidden = id !== 'scrApp'; }
function renderBand() {
  const s = saldoConta(), abertos = C.reduce((a, c) => a + Math.max(0, usado(c)), 0);
  $('bandSaldo').textContent = brl(s);
  $('bandSaldo').style.color = s < 0 ? '#ffd4cf' : '';
  $('bandMeta').innerHTML = ui.editSaldo
    ? `<input id="saldoIni" inputmode="decimal" value="${fmtIn(num(CFG.saldo_inicial && CFG.saldo_inicial.v))}" aria-label="Saldo inicial"><button class="b sm pri" data-act="saveSaldo">Salvar</button><button class="b sm" data-act="cancelSaldo">Cancelar</button><span style="flex-basis:100%">Quanto você tinha na conta antes do primeiro lançamento.</span>`
    : `<span>Cartões em aberto: ${brl(abertos)}</span><span aria-hidden="true">·</span><button class="link" data-act="editSaldo">ajustar saldo inicial</button>`;
}
function showLogin(msg) { showScreen('scrLogin'); const m = $('loginMsg'); m.textContent = msg || ''; m.hidden = !msg; }
function showLoading(msg) { showScreen('scrLoading'); $('loadingMsg').textContent = msg; }
let toastT; function toast(t) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 4000); }
function setSaving(on) { $('saving').hidden = !on; document.querySelectorAll('.b.pri').forEach(b => b.disabled = on); }

/* ---------------- API ---------------- */
async function api(url, opt = {}) {
  if (!tokenOk()) throw { code: 'auth' };
  let r;
  try { r = await fetch(url, { ...opt, headers: { Authorization: 'Bearer ' + TK.token, 'Content-Type': 'application/json', ...(opt.headers || {}) } }); }
  catch (e) { throw { code: 'net' }; }
  if (r.status === 401) { TK = null; saveTok(); throw { code: 'auth' }; }
  if (!r.ok) { let msg = ''; try { msg = (await r.json()).error.message; } catch (e) {} throw { code: 'http', status: r.status, msg }; }
  return r.status === 204 ? null : r.json();
}
function handleErr(e) {
  console.error(e);
  if (e && e.code === 'auth') { showLogin('Sua sessão do Google expirou. Entre de novo para continuar.'); return; }
  if (e && e.code === 'net') { toast('Sem conexão com a internet. Confira e tente de novo.'); return; }
  if (e && e.code === 'gone') { toast('Esse item foi alterado em outro aparelho. A tela foi atualizada.'); reload(); return; }
  if (e && e.status === 429) { toast('Muitas alterações seguidas. Espere alguns segundos e tente de novo.'); return; }
  if (e && e.status === 404) { toast('A planilha não foi encontrada. Atualize a página para o app procurar de novo.'); try { localStorage.removeItem('cf-ss:' + EMAIL); } catch (x) {} return; }
  toast('Não deu para salvar. Confira a internet e tente de novo.');
}

/* ---------------- planilha ---------------- */
function headerRow(t) { return { values: SHEETS[t].map(h => ({ userEnteredValue: { stringValue: h }, userEnteredFormat: { textFormat: { bold: true } } })) }; }
async function createSheet() {
  const body = {
    properties: { title: 'Controle Financeiro', locale: 'pt_BR', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo' },
    sheets: Object.keys(SHEETS).map((t, i) => ({ properties: { title: t, index: i, gridProperties: { frozenRowCount: 1 } }, data: [{ startRow: 0, startColumn: 0, rowData: [headerRow(t)] }] }))
  };
  const ss = await api(SS, { method: 'POST', body: JSON.stringify(body) });
  await api('https://www.googleapis.com/drive/v3/files/' + ss.spreadsheetId, { method: 'PATCH', body: JSON.stringify({ appProperties: { controleFinanceiro: '1' }, description: 'Dados do app Controle Financeiro. Pode abrir e consultar à vontade; evite apagar abas ou mudar os títulos da primeira linha.' }) });
  return ss.spreadsheetId;
}
async function getMeta(id) {
  const m = await api(`${SS}/${id}?fields=sheets.properties(sheetId,title)`);
  SID = {}; m.sheets.forEach(s => SID[s.properties.title] = s.properties.sheetId);
}
async function ensureTabs() {
  const miss = Object.keys(SHEETS).filter(t => SID[t] == null);
  if (!miss.length) return;
  const r = await api(`${SS}/${SSID}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: miss.map(t => ({ addSheet: { properties: { title: t, gridProperties: { frozenRowCount: 1 } } } })) }) });
  r.replies.forEach((rep, i) => SID[miss[i]] = rep.addSheet.properties.sheetId);
  await api(`${SS}/${SSID}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: miss.map(t => ({ appendCells: { sheetId: SID[t], rows: [headerRow(t)], fields: 'userEnteredValue,userEnteredFormat.textFormat' } })) }) });
}
async function openSheet() {
  let id = null;
  try { id = localStorage.getItem('cf-ss:' + EMAIL); } catch (e) {}
  if (id) {
    try { const f = await api(`https://www.googleapis.com/drive/v3/files/${id}?fields=trashed`); if (f.trashed) id = null; }
    catch (e) { if (e.code === 'auth' || e.code === 'net') throw e; id = null; }
  }
  if (!id) {
    const q = encodeURIComponent("appProperties has { key='controleFinanceiro' and value='1' } and trashed=false");
    const r = await api(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&orderBy=createdTime&spaces=drive`);
    if (r.files && r.files.length) id = r.files[0].id;
    else { showLoading('Criando sua planilha no Google Drive…'); id = await createSheet(); }
  }
  SSID = id;
  try { localStorage.setItem('cf-ss:' + EMAIL, id); } catch (e) {}
  await getMeta(id);
  await ensureTabs();
}
async function load() {
  const qs = LOAD_TABS.map(t => 'ranges=' + encodeURIComponent(`'${t}'!A1:Z`)).join('&');
  const r = await api(`${SS}/${SSID}/values:batchGet?${qs}&valueRenderOption=UNFORMATTED_VALUE`);
  r.valueRanges.forEach((vr, i) => {
    const t = LOAD_TABS[i], rows = vr.values || [];
    const head = (rows[0] && rows[0].length) ? rows[0].map(h => String(h).trim()) : SHEETS[t];
    HEAD[t] = head; D[t] = [];
    rows.slice(1).forEach((row, j) => {
      if (!row.some(v => v !== '' && v != null)) return;
      const o = { _row: j + 1 }; head.forEach((h, k) => o[h] = row[k] ?? ''); D[t].push(o);
    });
  });
  HEAD.Arquivo = SHEETS.Arquivo;
  normalize();
}
function normalize() {
  L = D.Lancamentos.map(o => ({
    row: o._row, raw: o, id: String(o.id), data: toISO(o.data), tipo: String(o.tipo).trim(), valor: num(o.valor),
    cat: String(o.categoria || 'Outros'), origem: String(o.origem || ''), pag: String(o.pagamento || ''),
    cartao: String(o.cartao_id || ''), cartaoNome: String(o.cartao_nome || ''), par: Math.max(1, int(o.parcelas) || 1),
    fin: String(o.financiamento_id || ''), fixo: String(o.fixo_id || ''), desc: String(o.descricao || ''), criado: num(o.criado_em)
  })).filter(l => l.id && l.data && l.valor > 0);
  C = D.Cartoes.map(o => ({ row: o._row, raw: o, id: String(o.id), banco: String(o.banco || 'Cartão'), apelido: String(o.apelido || ''), limite: num(o.limite), ajuste: num(o.ajuste), fech: int(o.dia_fechamento), venc: int(o.dia_vencimento) })).filter(c => c.id);
  F = D.Financiamentos.map(o => ({ row: o._row, raw: o, id: String(o.id), nome: String(o.nome || 'Financiamento'), tipo: String(o.tipo || 'Outro'), total: num(o.valor_total), parc: Math.max(1, int(o.parcelas)), mensal: num(o.valor_mensal), pagasAntes: int(o.pagas_antes), dia: int(o.dia_vencimento) })).filter(f => f.id);
  X = D.Fixos.map(o => ({ row: o._row, raw: o, id: String(o.id), desc: String(o.descricao || 'Gasto fixo'), valor: num(o.valor), cat: String(o.categoria || 'Outros'), pag: String(o.pagamento || PIX), cartao: String(o.cartao_id || ''), dia: Math.max(1, int(o.dia) || 1), ativo: !/^(não|nao|false|0)$/i.test(String(o.ativo).trim()) })).filter(x => x.id);
  M = D.Metas.map(o => ({ row: o._row, cat: String(o.categoria), lim: num(o.limite) })).filter(m => m.cat && m.lim > 0);
  RZ = {}; D.Resumos.forEach(o => { const mes = toYM(o.mes); if (!mes) return; let cats = {}; try { cats = JSON.parse(o.categorias || '{}'); } catch (e) {} RZ[mes] = { row: o._row, ent: num(o.entradas), cats }; });
  CFG = {}; D.Config.forEach(o => CFG[String(o.chave)] = { row: o._row, v: o.valor });
}

/* ---------- gravação (tudo em lote, de forma atômica) ---------- */
function cell(v) { if (v === '' || v == null) return {}; if (typeof v === 'number' && isFinite(v)) return { userEnteredValue: { numberValue: v } }; return { userEnteredValue: { stringValue: String(v) } }; }
function rowOf(t, o) { return { values: (HEAD[t] || SHEETS[t]).map(h => cell(o[h])) }; }
const rq = {
  append: (t, o) => ({ appendCells: { sheetId: SID[t], rows: [rowOf(t, o)], fields: 'userEnteredValue' } }),
  update: (t, ri, o) => ({ updateCells: { start: { sheetId: SID[t], rowIndex: ri, columnIndex: 0 }, rows: [rowOf(t, o)], fields: 'userEnteredValue' } }),
  del: (t, ri) => ({ deleteDimension: { range: { sheetId: SID[t], dimension: 'ROWS', startIndex: ri, endIndex: ri + 1 } } })
};
async function findRow(t, key) {
  const r = await api(`${SS}/${SSID}/values/${encodeURIComponent(`'${t}'!A:A`)}?valueRenderOption=UNFORMATTED_VALUE`);
  const v = r.values || [];
  for (let i = 1; i < v.length; i++) if (v[i] && String(v[i][0]) === String(key)) return i;
  return -1;
}
const rawBy = (t, key) => D[t].find(o => String(o[(HEAD[t] || SHEETS[t])[0]]) === String(key)) || {};
async function write(build, okMsg) {
  if (ui.busy) return false;
  ui.busy = true; setSaving(true);
  try {
    const reqs = await build();
    if (reqs && reqs.length) await api(`${SS}/${SSID}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: reqs }) });
    await load(); render(); if (okMsg) toast(okMsg); return true;
  } catch (e) { handleErr(e); return false; }
  finally { ui.busy = false; setSaving(false); }
}
const addRows = (list, msg) => write(async () => list.map(([t, o]) => rq.append(t, o)), msg);
const updRow = (t, key, patch, msg) => write(async () => { const ri = await findRow(t, key); if (ri < 1) throw { code: 'gone' }; return [rq.update(t, ri, { ...rawBy(t, key), ...patch })]; }, msg);
const delRow = (t, key, msg) => write(async () => { const ri = await findRow(t, key); return ri < 1 ? [] : [rq.del(t, ri)]; }, msg);
const setCfg = (k, v, msg) => write(async () => { const ri = await findRow('Config', k); return [ri > 0 ? rq.update('Config', ri, { chave: k, valor: v }) : rq.append('Config', { chave: k, valor: v })]; }, msg);
async function reload() { try { await load(); render(); } catch (e) { handleErr(e); } }

/* ---------------- cálculos ---------------- */
const cardById = id => C.find(c => c.id === id);
const finById = id => F.find(f => f.id === id);
const cardNome = c => c ? c.banco + (c.apelido ? ' · ' + c.apelido : '') : '';
function nomeCartao(l) { const c = cardById(l.cartao); return c ? cardNome(c) : (l.cartaoNome || 'Cartão'); }
// Mês da fatura em que cai uma compra feita na data iso
function dueMonth(card, iso) {
  const ym = ymOf(iso);
  if (!card || !card.fech || !card.venc) return ym;
  const close = int(iso.slice(8, 10)) < card.fech ? ym : addM(ym, 1);
  return card.venc > card.fech ? close : addM(close, 1);
}
const credBase = l => dueMonth(cardById(l.cartao), l.data);
const isCred = l => l.tipo === T.G && l.pag === CRED;
function lastEffect(l) { return isCred(l) ? addM(credBase(l), l.par - 1) : ymOf(l.data); }
function gastosCalc(m) {
  const r = {};
  for (const l of L) {
    if (l.tipo === T.G) {
      if (l.pag === CRED) { const b = credBase(l); for (let k = 0; k < l.par; k++) if (addM(b, k) === m) r[l.cat] = (r[l.cat] || 0) + l.valor / l.par; }
      else if (ymOf(l.data) === m) r[l.cat] = (r[l.cat] || 0) + l.valor;
    } else if (l.tipo === T.J && ymOf(l.data) === m) r['Juros do cartão'] = (r['Juros do cartão'] || 0) + l.valor;
  }
  return r;
}
const gastosMes = m => RZ[m] ? RZ[m].cats : gastosCalc(m);
const entCalc = m => L.filter(l => l.tipo === T.R && ymOf(l.data) === m).reduce((a, l) => a + l.valor, 0);
const entradasMes = m => RZ[m] ? RZ[m].ent : entCalc(m);
function saldoConta() {
  let s = num(CFG.saldo_inicial && CFG.saldo_inicial.v);
  for (const l of L) { if (l.tipo === T.R) s += l.valor; else if (l.tipo === T.G && l.pag !== CRED) s -= l.valor; else if (l.tipo === T.F) s -= l.valor; }
  return r2(s);
}
function usado(c) {
  let u = c.ajuste;
  for (const l of L) { if (l.cartao !== c.id) continue; if (isCred(l) || l.tipo === T.J) u += l.valor; else if (l.tipo === T.F) u -= l.valor; }
  return r2(u);
}
function devidoAte(c, tm) {
  let d = c.ajuste;
  for (const l of L) {
    if (l.cartao !== c.id) continue;
    if (isCred(l)) { const b = dueMonth(c, l.data); for (let k = 0; k < l.par; k++) if (addM(b, k) <= tm) d += l.valor / l.par; }
    else if (l.tipo === T.J && ymOf(l.data) <= tm) d += l.valor;
    else if (l.tipo === T.F) d -= l.valor;
  }
  return r2(d);
}
// Situação da fatura que importa agora
function faturaInfo(c) {
  if (!c.fech || !c.venc) return null;
  const hoje = today(), cur = dueMonth(c, hoje), prev = addM(cur, -1), vPrev = dayIn(prev, c.venc);
  if (hoje <= vPrev) return { mes: prev, status: 'fechada', vence: vPrev, valor: Math.max(0, devidoAte(c, prev)), atraso: Math.max(0, devidoAte(c, addM(prev, -1))) };
  const closeM = c.venc > c.fech ? cur : addM(cur, -1);
  return { mes: cur, status: 'aberta', fecha: dayIn(closeM, c.fech), vence: dayIn(cur, c.venc), valor: Math.max(0, devidoAte(c, cur)), atraso: Math.max(0, devidoAte(c, prev)) };
}
const pagasFin = f => f.pagasAntes + L.filter(l => l.tipo === T.G && l.fin === f.id).length;

/* ---------- arquivamento após 6 meses ---------- */
let archiveChecked = false;
async function maybeArchive() {
  if (archiveChecked) return; archiveChecked = true;
  const cutoff = addM(ymOf(today()), -6);
  const arch = L.filter(l => lastEffect(l) < cutoff);
  let first = null;
  for (const l of L) { const m = isCred(l) ? credBase(l) : ymOf(l.data); if (!first || m < first) first = m; }
  const novos = [];
  if (first) for (let m = first; m < cutoff; m = addM(m, 1)) {
    if (RZ[m]) continue;
    const g = gastosCalc(m), e = entCalc(m), tot = soma(g);
    if (e > .004 || tot > .004) { const gr = {}; for (const k in g) gr[k] = r2(g[k]); novos.push({ mes: m, entradas: r2(e), gastos: r2(tot), sobrou: r2(e - tot), categorias: JSON.stringify(gr) }); }
  }
  if (!arch.length && !novos.length) return;
  let saldoD = 0; const cardD = {}, finD = {};
  for (const l of arch) {
    if (l.tipo === T.R) saldoD += l.valor; else if (l.tipo === T.G && l.pag !== CRED) saldoD -= l.valor; else if (l.tipo === T.F) saldoD -= l.valor;
    if (cardById(l.cartao)) { const s = (isCred(l) || l.tipo === T.J) ? l.valor : (l.tipo === T.F ? -l.valor : 0); if (s) cardD[l.cartao] = (cardD[l.cartao] || 0) + s; }
    if (l.tipo === T.G && l.fin && finById(l.fin)) finD[l.fin] = (finD[l.fin] || 0) + 1;
  }
  const reqs = novos.map(r => rq.append('Resumos', r));
  if (arch.length) {
    reqs.push({ appendCells: { sheetId: SID.Arquivo, rows: arch.map(l => ({ values: SHEETS.Arquivo.map(h => cell(l.raw[h])) })), fields: 'userEnteredValue' } });
    if (Math.abs(saldoD) > .004) { const cur = CFG.saldo_inicial, v = r2(num(cur && cur.v) + saldoD); reqs.push(cur ? rq.update('Config', cur.row, { chave: 'saldo_inicial', valor: v }) : rq.append('Config', { chave: 'saldo_inicial', valor: v })); }
    for (const id in cardD) { const c = cardById(id); reqs.push(rq.update('Cartoes', c.row, { ...c.raw, ajuste: r2(c.ajuste + cardD[id]) })); }
    for (const id in finD) { const f = finById(id); reqs.push(rq.update('Financiamentos', f.row, { ...f.raw, pagas_antes: f.pagasAntes + finD[id] })); }
    arch.map(l => l.row).sort((a, b) => b - a).forEach(ri => reqs.push(rq.del('Lancamentos', ri)));
  }
  try {
    await api(`${SS}/${SSID}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: reqs }) });
    await load();
    if (arch.length) toast(arch.length + (arch.length === 1 ? ' lançamento antigo foi movido' : ' lançamentos antigos foram movidos') + ' para a aba Arquivo da planilha.');
  } catch (e) { console.error(e); }
}

/* ---------------- interface ---------------- */
function delta(a, b, menosEhBom) {
  const d = a - b;
  if (Math.abs(d) < .005) return '<span class="d">igual ao mês anterior</span>';
  const up = d > 0, bom = menosEhBom ? !up : up;
  return `<span class="d ${bom ? 'up-good' : 'up-bad'}">${up ? '▲' : '▼'} ${brl(Math.abs(d))} vs ${mesCurto(addM(ui.mes, -1))}</span>`;
}
function delBtn(kind, id) {
  const k = kind + '|' + id;
  return ui.confirm === k ? `<button class="x sure" data-act="del" data-k="${esc(k)}">Confirmar exclusão</button>` : `<button class="x" data-act="askDel" data-k="${esc(k)}">Excluir</button>`;
}
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

function avisos() {
  const out = [], hoje = today(), curYM = ymOf(hoje), diaHoje = int(hoje.slice(8));
  for (const c of C) {
    const fi = faturaInfo(c); if (!fi) continue;
    if (fi.atraso > .004) out.push({ cls: 'bad', msg: `A fatura do <b>${esc(cardNome(c))}</b> venceu e ficou <b>${brl(fi.atraso)}</b> em aberto.`, btn: `<button class="b sm" data-act="goPagar" data-id="${c.id}">Registrar pagamento</button>` });
    else if (fi.status === 'fechada' && fi.valor > .004) { const n = diasAte(fi.vence); if (n <= 5) out.push({ cls: 'warn', msg: `Fatura do <b>${esc(cardNome(c))}</b>: <b>${brl(fi.valor)}</b>, ${n <= 0 ? 'vence hoje' : n === 1 ? 'vence amanhã' : 'vence em ' + n + ' dias'} (${dmy(fi.vence)}).`, btn: `<button class="b sm" data-act="goPagar" data-id="${c.id}">Paguei a fatura</button>` }); }
  }
  for (const f of F) {
    const pg = pagasFin(f); if (pg >= f.parc) continue;
    if (L.some(l => l.tipo === T.G && l.fin === f.id && ymOf(l.data) === curYM)) continue;
    if (diaHoje < (f.dia || 1) - 3) continue;
    out.push({ cls: 'info', msg: `Parcela ${pg + 1} de ${f.parc} do <b>${esc(f.nome)}</b> (${brl(f.mensal)}) ainda não foi lançada este mês.`, btn: `<button class="b sm" data-act="lancarFin" data-id="${f.id}">Lançar parcela</button>` });
  }
  for (const x of X) {
    if (!x.ativo) continue;
    if (L.some(l => l.fixo === x.id && ymOf(l.data) === curYM)) continue;
    if (diaHoje < x.dia - 3) continue;
    out.push({ cls: 'info', msg: `Gasto fixo: <b>${esc(x.desc)}</b>, todo dia ${x.dia}${x.pag === CRED ? ' no crédito' : ''}.`, btn: `<input inputmode="decimal" id="fx-${x.id}" value="${fmtIn(x.valor)}" aria-label="Valor de ${esc(x.desc)}"><button class="b sm" data-act="lancarFixo" data-id="${x.id}">Lançar</button>` });
  }
  const g = gastosMes(curYM);
  for (const m of M) {
    const v = g[m.cat] || 0;
    if (v > m.lim + .004) out.push({ cls: 'bad', msg: `Você passou do limite de <b>${esc(m.cat)}</b> este mês: ${brl(v)} de ${brl(m.lim)}.` });
    else if (v >= m.lim * .8) out.push({ cls: 'warn', msg: `<b>${esc(m.cat)}</b> já chegou a ${Math.round(v / m.lim * 100)}% do limite do mês: ${brl(v)} de ${brl(m.lim)}.` });
  }
  return out;
}

let pie, bar;
function renderResumo() {
  document.querySelectorAll('.mesLabel').forEach(e => e.textContent = mesNome(ui.mes));
  const av = avisos();
  $('avisos').innerHTML = av.map(a => `<div class="aviso ${a.cls}"><span class="msg">${a.msg}</span>${a.btn ? `<span class="actions">${a.btn}</span>` : ''}</div>`).join('');
  if (pie) { pie.destroy(); pie = null; } if (bar) { bar.destroy(); bar = null; }
  const ant = addM(ui.mes, -1);
  const g = gastosMes(ui.mes), gA = gastosMes(ant), ent = entradasMes(ui.mes), entA = entradasMes(ant), sai = soma(g), saiA = soma(gA);
  const vazio = !L.length && !C.length && !F.length && !Object.keys(RZ).length;
  let h = '';
  if (vazio) h += `<div class="panel"><h2>Comece por aqui</h2><ol class="steps"><li>Cadastre seus cartões, com limite, fechamento e vencimento.</li><li>Cadastre seus financiamentos, se tiver.</li><li>Informe quanto tem na conta hoje em "ajustar saldo inicial", no topo.</li><li>Lance o que recebeu e o que gastou.</li></ol><div class="actions"><button class="b pri" data-act="goto" data-v="cartoes">Cadastrar cartão</button><button class="b" data-act="goto" data-v="lanc">Fazer um lançamento</button></div></div>`;
  h += `<div class="kpis">
    <div class="kpi"><span class="l">Entrou</span><span class="v">${brl(ent)}</span>${delta(ent, entA, false)}</div>
    <div class="kpi"><span class="l">Gastou</span><span class="v">${brl(sai)}</span>${delta(sai, saiA, true)}</div>
    <div class="kpi"><span class="l">Sobrou</span><span class="v" style="color:${ent - sai < 0 ? 'var(--bad)' : 'inherit'}">${brl(ent - sai)}</span>${delta(ent - sai, entA - saiA, false)}</div>
  </div>`;
  if (M.length) h += `<div class="panel"><h2>Limites de ${mesNome(ui.mes)}</h2>${M.map(m => { const v = g[m.cat] || 0, pc = Math.min(100, v / m.lim * 100), cor = v > m.lim ? 'var(--bad)' : pc >= 80 ? 'var(--warn)' : 'var(--good)'; return `<div style="display:flex;flex-direction:column;gap:4px"><div class="cardhead"><span class="t">${esc(m.cat)}</span><span class="d">${brl(v)} de ${brl(m.lim)}</span></div><div class="meter"><div style="width:${pc}%;background:${cor}"></div></div></div>`; }).join('')}</div>`;
  const cats = Object.keys(g).filter(c => g[c] > .004).sort((a, b) => g[b] - g[a]);
  h += `<div class="grid2">
    <div class="panel"><h2>Para onde foi o dinheiro</h2>${cats.length ? `<div class="chart"><canvas id="pieC" role="img" aria-label="Gastos de ${mesNome(ui.mes)} por categoria"></canvas></div><div class="legend">${cats.map(c => `<span><i class="sw" style="background:${CATCOL[c] || '#a39d93'}"></i>${esc(c)} ${Math.round(g[c] / sai * 100)}%</span>`).join('')}</div>` : `<p class="sub">Nenhum gasto em ${mesNome(ui.mes)}.</p>`}</div>
    <div class="panel"><h2>Entradas e gastos, últimos 6 meses</h2><div class="legend"><span><i class="sw" style="background:#1baf7a"></i>Entrou</span><span><i class="sw" style="background:#eb6834"></i>Gastou</span></div><div class="chart"><canvas id="barC" role="img" aria-label="Entradas e gastos dos últimos seis meses"></canvas></div></div>
  </div>`;
  const todas = [...new Set([...Object.keys(g), ...Object.keys(gA)])].filter(c => (g[c] || 0) > .004 || (gA[c] || 0) > .004).sort((a, b) => (g[b] || 0) - (g[a] || 0));
  h += `<div class="panel"><h2>Comparação com ${mesNome(ant)}</h2>${todas.length ? `<div>${todas.map(c => { const a = g[c] || 0, b = gA[c] || 0, d = a - b; const cls = Math.abs(d) < .005 ? '' : (d > 0 ? 'up-bad' : 'up-good'); return `<div class="row"><div class="main"><span class="t"><i class="sw" style="background:${CATCOL[c] || '#a39d93'}"></i> ${esc(c)}</span><span class="d">${mesCurto(ant)}: ${brl(b)}</span></div><div class="right" style="flex-direction:column;align-items:flex-end;gap:0"><span class="amt">${brl(a)}</span><span class="d ${cls}">${Math.abs(d) < .005 ? 'igual' : (d > 0 ? '▲ gastou ' : '▼ economizou ') + brl(Math.abs(d)) + ' a ' + (d > 0 ? 'mais' : 'menos')}</span></div></div>`; }).join('')}</div>` : `<p class="sub">Quando houver gastos nos dois meses, a comparação aparece aqui.</p>`}</div>`;
  $('resumoBody').innerHTML = h;
  if (typeof Chart === 'undefined') return;
  const ink = css('--muted'), grid = css('--line'), surf = css('--surface');
  if (cats.length) pie = new Chart($('pieC'), { type: 'pie', data: { labels: cats, datasets: [{ data: cats.map(c => r2(g[c])), backgroundColor: cats.map(c => CATCOL[c] || '#a39d93'), borderColor: surf, borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: x => ' ' + brl(x.raw) } } } } });
  const ms = [5, 4, 3, 2, 1, 0].map(k => addM(ui.mes, -k));
  bar = new Chart($('barC'), { type: 'bar', data: { labels: ms.map(mesCurto), datasets: [{ label: 'Entrou', data: ms.map(m => r2(entradasMes(m))), backgroundColor: '#1baf7a', borderRadius: 4, maxBarThickness: 22 }, { label: 'Gastou', data: ms.map(m => r2(soma(gastosMes(m)))), backgroundColor: '#eb6834', borderRadius: 4, maxBarThickness: 22 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: x => ' ' + x.dataset.label + ': ' + brl(x.raw) } } }, scales: { x: { grid: { display: false }, ticks: { color: ink } }, y: { beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { color: ink, callback: v => 'R$ ' + Number(v).toLocaleString('pt-BR') } } } } });
}

function renderLanc() {
  $('lancTitle').textContent = 'Lançamentos de ' + mesNome(ui.mes);
  const it = L.filter(l => ymOf(l.data) === ui.mes).sort((a, b) => (b.data + String(b.criado).padStart(15, '0')).localeCompare(a.data + String(a.criado).padStart(15, '0')));
  let fora = 0;
  for (const l of L) { if (!isCred(l)) continue; const b = credBase(l); for (let k = 0; k < l.par; k++) if (addM(b, k) === ui.mes && ymOf(l.data) !== ui.mes) fora += l.valor / l.par; }
  let h = '';
  if (RZ[ui.mes] && !it.length) h += `<div class="row"><div class="main"><span class="t">Os detalhes deste mês foram arquivados</span><span class="d">Os lançamentos estão na aba "Arquivo" da sua planilha. O resumo continua nos gráficos.</span></div></div>`;
  if (fora > .004) h += `<div class="row"><div class="main"><span class="t">Compras no crédito de outros meses que caem em ${mesNome(ui.mes)}</span><span class="chips"><span class="chip">Faturas e parcelas</span></span></div><span class="amt">${brl(fora)}</span></div>`;
  h += it.map(l => {
    const chips = []; let amt = '', titulo = l.desc;
    if (l.tipo === T.R) { chips.push(l.origem || 'Recebimento'); titulo = titulo || l.origem || 'Recebimento'; amt = `<span class="amt in">+ ${brl(l.valor)}</span>`; }
    else if (l.tipo === T.G) {
      chips.push(l.cat);
      if (l.pag === CRED) { chips.push(nomeCartao(l)); const b = credBase(l); if (l.par > 1) chips.push(l.par + 'x de ' + brl(l.valor / l.par)); if (b !== ymOf(l.data)) chips.push('fatura de ' + mesCurto(b)); }
      else chips.push(PIX);
      if (l.fin) { const f = finById(l.fin); chips.push(f ? f.nome : 'Financiamento'); }
      if (l.fixo) chips.push('Fixo');
      titulo = titulo || l.cat; amt = `<span class="amt">- ${brl(l.valor)}</span>`;
    }
    else if (l.tipo === T.F) { chips.push(nomeCartao(l)); titulo = 'Pagamento de fatura'; amt = `<span class="amt" style="color:var(--muted)">${brl(l.valor)}</span>`; }
    else if (l.tipo === T.J) { chips.push('Juros do cartão', nomeCartao(l)); titulo = titulo || 'Juros e encargos'; amt = `<span class="amt">- ${brl(l.valor)}</span>`; }
    else { titulo = titulo || l.tipo; amt = `<span class="amt">${brl(l.valor)}</span>`; }
    return `<div class="row"><div class="main"><span class="t">${esc(titulo)} <span class="d">· ${dmy(l.data)}</span></span><span class="chips">${chips.map(c => `<span class="chip">${esc(c)}</span>`).join('')}</span></div><div class="right">${amt}${delBtn('Lancamentos', l.id)}</div></div>`;
  }).join('');
  $('lancList').innerHTML = h || `<p class="sub">Nenhum lançamento em ${mesNome(ui.mes)}. Use o formulário acima para adicionar.</p>`;
}

function renderCards() {
  if (!C.length) { $('cardList').innerHTML = '<p class="sub">Nenhum cartão cadastrado. Adicione abaixo para acompanhar o limite e as faturas.</p>'; return; }
  $('cardList').innerHTML = C.map(c => {
    const u = Math.max(0, usado(c)), lim = c.limite, pc = lim ? Math.min(100, u / lim * 100) : 0;
    const cor = pc >= 90 ? 'var(--bad)' : pc >= 70 ? 'var(--warn)' : 'var(--good)';
    const fi = faturaInfo(c);
    const p = ui.panel && ui.panel.id === c.id ? ui.panel.kind : null;
    const pagar = fi ? fi.valor : u;
    let fat = '';
    if (fi) fat = `<div class="fatura"><div style="display:flex;flex-direction:column;gap:2px"><span class="t">Fatura de ${MESES[+fi.mes.slice(5) - 1]}</span><span class="d">${fi.status === 'fechada' ? 'Fechada · vence ' + dmy(fi.vence) : 'Aberta · fecha ' + dmy(fi.fecha) + ' · vence ' + dmy(fi.vence)}${fi.atraso > .004 ? ` · <span style="color:var(--bad)">inclui ${brl(fi.atraso)} em atraso</span>` : ''}</span></div><span class="amt">${brl(fi.valor)}</span></div>`;
    else fat = `<p class="note">Cadastre o dia de fechamento e de vencimento em "Editar" para ver a fatura do mês e receber avisos.</p>`;
    let painel = '';
    if (p === 'pagar') painel = `<div class="inline"><div class="form"><div class="fld"><label for="pv">Valor pago (R$)</label><input id="pv" inputmode="decimal" value="${fmtIn(pagar)}"></div><div class="fld"><label for="pd">Data</label><input id="pd" type="date" value="${today()}"></div><div class="fld"><button class="b pri" data-act="pagar" data-id="${c.id}">Confirmar pagamento</button></div></div><p class="note">Sai do seu saldo em conta e libera o mesmo valor no limite. Não conta como gasto, porque as compras já foram lançadas. Se pagar menos que a fatura, o restante continua em aberto.</p></div>`;
    else if (p === 'juros') painel = `<div class="inline"><div class="form"><div class="fld"><label for="jv">Valor dos juros (R$)</label><input id="jv" inputmode="decimal" placeholder="45,90"></div><div class="fld"><label for="jd">Data</label><input id="jd" type="date" value="${today()}"></div><div class="fld"><button class="b pri" data-act="juros" data-id="${c.id}">Lançar juros</button></div></div><p class="note">Entra nos gastos do mês como "Juros do cartão" e na fatura. Não mexe no saldo em conta.</p></div>`;
    else if (p === 'ajustar') painel = `<div class="inline"><div class="form"><div class="fld"><label for="av">Somar ao valor em aberto (R$)</label><input id="av" inputmode="decimal" placeholder="200,00 ou -200,00"></div><div class="fld"><button class="b pri" data-act="ajustar" data-id="${c.id}">Aplicar ajuste</button></div></div><p class="note">Use para o app bater com o banco. Positivo ocupa limite, negativo libera. O ajuste não entra nos gastos. Ajuste atual: ${brl(c.ajuste)}.</p></div>`;
    else if (p === 'editar') painel = `<div class="inline"><div class="form"><div class="fld"><label for="eb">Banco</label><select id="eb">${BANKS.map(b => `<option${b === c.banco ? ' selected' : ''}>${b}</option>`).join('')}</select></div><div class="fld"><label for="ea">Apelido</label><input id="ea" value="${esc(c.apelido)}"></div><div class="fld"><label for="el">Limite (R$)</label><input id="el" inputmode="decimal" value="${fmtIn(lim)}"></div><div class="fld"><label for="ef">Dia de fechamento</label><input id="ef" type="number" min="1" max="31" value="${c.fech || ''}"></div><div class="fld"><label for="ev">Dia de vencimento</label><input id="ev" type="number" min="1" max="31" value="${c.venc || ''}"></div><div class="fld"><button class="b pri" data-act="saveCard" data-id="${c.id}">Salvar</button></div></div></div>`;
    const on = k => p === k ? ' style="border-color:var(--accent);color:var(--accent)"' : '';
    return `<div class="item"><div class="cardhead"><span class="t" style="font-weight:600;font-size:1.02rem">${esc(cardNome(c))}</span><span class="d">${Math.round(pc)}% do limite usado</span></div>
      <div class="meter" role="meter" aria-valuemin="0" aria-valuemax="${lim}" aria-valuenow="${u}" aria-label="Limite usado"><div style="width:${pc}%;background:${cor}"></div></div>
      <div class="trio"><div><span class="l">Em aberto</span><span class="v">${brl(u)}</span></div><div><span class="l">Disponível</span><span class="v" style="color:${lim - u < 0 ? 'var(--bad)' : 'inherit'}">${brl(lim - u)}</span></div><div><span class="l">Limite</span><span class="v">${brl(lim)}</span></div></div>
      ${fat}
      <div class="actions"><button class="b sm" data-act="panel" data-id="${c.id}" data-v="pagar"${on('pagar')}>Paguei a fatura</button><button class="b sm" data-act="panel" data-id="${c.id}" data-v="juros"${on('juros')}>Juros</button><button class="b sm" data-act="panel" data-id="${c.id}" data-v="ajustar"${on('ajustar')}>Ajustar</button><button class="b sm" data-act="panel" data-id="${c.id}" data-v="editar"${on('editar')}>Editar</button>${delBtn('Cartoes', c.id)}</div>${painel}</div>`;
  }).join('');
}

function renderFins() {
  if (!F.length) { $('finList').innerHTML = '<p class="sub">Nenhum financiamento cadastrado. Adicione abaixo: veículo, casa, empréstimo ou outro.</p>'; return; }
  const curYM = ymOf(today());
  $('finList').innerHTML = F.map(f => {
    const pg = Math.min(pagasFin(f), f.parc), falt = Math.max(0, f.parc - pg), pc = pg / f.parc * 100;
    const p = ui.panel && ui.panel.id === f.id ? ui.panel.kind : null;
    const mesPago = L.some(l => l.tipo === T.G && l.fin === f.id && ymOf(l.data) === curYM);
    let painel = '';
    if (p === 'editar') painel = `<div class="inline"><div class="form"><div class="fld"><label for="zn">Nome</label><input id="zn" value="${esc(f.nome)}"></div><div class="fld"><label for="zt">Tipo</label><select id="zt">${['Veículo', 'Casa', 'Empréstimo', 'Outro'].map(t => `<option${t === f.tipo ? ' selected' : ''}>${t}</option>`).join('')}</select></div><div class="fld"><label for="zv">Valor financiado (R$)</label><input id="zv" inputmode="decimal" value="${fmtIn(f.total)}"></div><div class="fld"><label for="zp">Parcelas</label><input id="zp" type="number" min="1" step="1" value="${f.parc}"></div><div class="fld"><label for="zm">Valor mensal (R$)</label><input id="zm" inputmode="decimal" value="${fmtIn(f.mensal)}"></div><div class="fld"><label for="za">Pagas antes do app</label><input id="za" type="number" min="0" step="1" value="${f.pagasAntes}"></div><div class="fld"><label for="zd">Dia de vencimento</label><input id="zd" type="number" min="1" max="31" value="${f.dia || ''}"></div><div class="fld"><button class="b pri" data-act="saveFin" data-id="${f.id}">Salvar</button></div></div></div>`;
    return `<div class="item"><div class="cardhead"><span class="t" style="font-weight:600;font-size:1.02rem">${esc(f.nome)} <span class="chip">${esc(f.tipo)}</span></span><span class="d">${!falt ? 'Quitado' : mesPago ? 'Parcela deste mês lançada' : 'Parcela deste mês pendente' + (f.dia ? ' · vence dia ' + f.dia : '')}</span></div>
      <div class="meter" role="meter" aria-valuemin="0" aria-valuemax="${f.parc}" aria-valuenow="${pg}" aria-label="Parcelas pagas"><div style="width:${pc}%;background:var(--accent)"></div></div>
      <div class="trio"><div><span class="l">Parcelas pagas</span><span class="v">${pg} de ${f.parc}</span></div><div><span class="l">Valor mensal</span><span class="v">${brl(f.mensal)}</span></div><div><span class="l">Falta pagar</span><span class="v">${brl(falt * f.mensal)}</span></div></div>
      <p class="d" style="margin:0">Valor financiado: ${brl(f.total)} · ${falt} parcela${falt === 1 ? '' : 's'} restante${falt === 1 ? '' : 's'}</p>
      <div class="actions">${falt && !mesPago ? `<button class="b sm" data-act="lancarFin" data-id="${f.id}">Lançar parcela de ${brl(f.mensal)}</button>` : ''}<button class="b sm" data-act="panel" data-id="${f.id}" data-v="editar">Editar</button>${delBtn('Financiamentos', f.id)}</div>${painel}</div>`;
  }).join('');
}

function renderMais() {
  const curYM = ymOf(today());
  $('fixoList').innerHTML = X.length ? X.map(x => {
    const feito = L.some(l => l.fixo === x.id && ymOf(l.data) === curYM);
    const c = cardById(x.cartao);
    return `<div class="row"><div class="main"><span class="t">${esc(x.desc)} <span class="d">· todo dia ${x.dia}</span></span><span class="chips"><span class="chip">${esc(x.cat)}</span><span class="chip">${x.pag === CRED ? esc(c ? cardNome(c) : 'Crédito') : PIX}</span><span class="chip">${!x.ativo ? 'Pausado' : feito ? 'Lançado este mês' : 'Pendente este mês'}</span></span></div><div class="right"><span class="amt">${brl(x.valor)}</span><button class="x" data-act="toggleFixo" data-id="${x.id}">${x.ativo ? 'Pausar' : 'Retomar'}</button>${delBtn('Fixos', x.id)}</div></div>`;
  }).join('') : '<p class="sub">Nenhum gasto fixo ainda. Você também pode marcar "Repetir todo mês" ao lançar um gasto.</p>';
  $('metaList').innerHTML = M.length ? M.map(m => `<div class="row"><div class="main"><span class="t">${esc(m.cat)}</span></div><div class="right"><span class="amt">${brl(m.lim)}/mês</span>${delBtn('Metas', m.cat)}</div></div>`).join('') : '<p class="sub">Nenhum limite definido.</p>';
  $('contaLine').textContent = 'Conectado como ' + EMAIL + '.';
  $('sheetLink').href = 'https://docs.google.com/spreadsheets/d/' + SSID;
}

function renderSelects() {
  const keep = (id, html) => { const el = $(id), v = el.value; el.innerHTML = html; if ([...el.options].some(o => o.value === v)) el.value = v; };
  const catOpts = FORM_CATS.map(c => `<option>${c}</option>`).join('');
  keep('fCat', catOpts); keep('xCat', catOpts); keep('mCat', catOpts);
  const reg = C.map(c => `<option value="${c.id}">${esc(cardNome(c))}</option>`).join('');
  const outros = BANKS.filter(b => b !== 'Outro' && !C.some(c => c.banco === b)).map(b => `<option value="banco:${b}">${b}</option>`).join('') + '<option value="banco:Outro">Outro</option>';
  keep('fCartao', (reg ? `<optgroup label="Seus cartões">${reg}</optgroup>` : '') + `<optgroup label="Outros (sem controle de limite)">${outros}</optgroup>`);
  keep('xCartao', reg || '<option value="">Cadastre um cartão primeiro</option>');
  keep('fFin', F.length ? F.map(f => `<option value="${f.id}">${esc(f.nome)}</option>`).join('') : '<option value="">Nenhum cadastrado</option>');
  if (!$('cBanco').options.length) $('cBanco').innerHTML = BANKS.map(b => `<option>${b}</option>`).join('');
}
function visForm() {
  const g = ui.tipo === 'G', cr = g && ui.pag === CRED;
  $('wOrigem').hidden = g; $('wCat').hidden = !g; $('wPag').hidden = !g; $('wCartao').hidden = !cr; $('wPar').hidden = !cr;
  $('wFin').hidden = !(g && $('fCat').value === 'Financiamentos'); $('wFixo').hidden = !g;
  document.querySelectorAll('[data-act="tipo"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === ui.tipo));
  document.querySelectorAll('[data-act="pag"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === ui.pag));
  $('wxCartao').hidden = $('xPag').value !== CRED;
}
function render() {
  if ($('scrApp').hidden) return;
  $('userLine').textContent = EMAIL;
  renderBand(); renderSelects(); visForm();
  document.querySelectorAll('.mesLabel').forEach(e => e.textContent = mesNome(ui.mes));
  if (ui.tab === 'resumo') renderResumo();
  renderLanc(); renderCards(); renderFins(); renderMais();
}
function setTab(t) {
  ui.tab = t; ui.panel = null; ui.confirm = null;
  document.querySelectorAll('.nav button').forEach(b => { if (b.dataset.tab === t) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  ['resumo', 'lanc', 'cartoes', 'fins', 'mais'].forEach(x => $('t-' + x).hidden = x !== t);
  render();
  try { localStorage.setItem('cf-aba', t); } catch (e) {}
}
function showErr(id, msg) { const e = $(id); e.textContent = msg; e.hidden = !msg; }

/* ---------------- ações ---------------- */
function cartaoCampos(val) {
  if (!val) return { cartao_id: '', cartao_nome: '' };
  if (val.startsWith('banco:')) return { cartao_id: '', cartao_nome: val.slice(6) };
  const c = cardById(val); return { cartao_id: val, cartao_nome: cardNome(c) };
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, id = b.dataset.id;
  if (a !== 'askDel' && a !== 'del') ui.confirm = null;
  switch (a) {
    case 'mes': ui.mes = addM(ui.mes, +b.dataset.k); render(); break;
    case 'mesHoje': ui.mes = ymOf(today()); render(); break;
    case 'goto': setTab(b.dataset.v); break;
    case 'tipo': ui.tipo = b.dataset.v; visForm(); break;
    case 'pag': ui.pag = b.dataset.v; visForm(); break;
    case 'reload': await reload(); toast('Dados atualizados'); break;
    case 'logout': logout(); break;
    case 'editSaldo': ui.editSaldo = true; renderBand(); setTimeout(() => $('saldoIni') && $('saldoIni').focus(), 0); break;
    case 'cancelSaldo': ui.editSaldo = false; renderBand(); break;
    case 'saveSaldo': { const v = money($('saldoIni').value || '0'); if (isNaN(v)) { toast('Digite um valor válido, como 1.250,00.'); return; } ui.editSaldo = false; await setCfg('saldo_inicial', v, 'Saldo inicial salvo'); break; }
    case 'askDel': ui.confirm = b.dataset.k; render(); break;
    case 'del': { const [t, k] = b.dataset.k.split('|'); ui.confirm = null; await delRow(t, k, 'Excluído'); break; }
    case 'panel': ui.panel = (ui.panel && ui.panel.id === id && ui.panel.kind === b.dataset.v) ? null : { id, kind: b.dataset.v }; render(); break;
    case 'goPagar': setTab('cartoes'); ui.panel = { id, kind: 'pagar' }; render(); break;

    case 'addLanc': {
      const v = money($('fValor').value), d = $('fData').value;
      if (!(v > 0)) return showErr('fErr', 'Digite um valor maior que zero, como 150,00.');
      if (!d) return showErr('fErr', 'Escolha a data.');
      const base = { id: uid(), data: d, valor: v, descricao: $('fDesc').value.trim(), criado_em: Date.now() };
      const rows = [];
      if (ui.tipo === 'R') rows.push(['Lancamentos', { ...base, tipo: T.R, origem: $('fOrigem').value }]);
      else {
        const cat = $('fCat').value, cr = ui.pag === CRED;
        const par = cr ? Math.min(48, Math.max(1, int($('fPar').value) || 1)) : 1;
        if (cat === 'Financiamentos' && !$('fFin').value) return showErr('fErr', 'Cadastre o financiamento na aba Financiamentos antes de lançar a parcela.');
        const cc = cr ? cartaoCampos($('fCartao').value) : { cartao_id: '', cartao_nome: '' };
        const o = { ...base, tipo: T.G, categoria: cat, pagamento: cr ? CRED : PIX, ...cc, parcelas: par, financiamento_id: cat === 'Financiamentos' ? $('fFin').value : '' };
        if ($('fFixo').checked) {
          if (par > 1) return showErr('fErr', 'Gasto fixo não pode ser parcelado. Deixe 1 parcela ou desmarque "Repetir todo mês".');
          const fx = { id: uid(), descricao: base.descricao || cat, valor: v, categoria: cat, pagamento: o.pagamento, cartao_id: cc.cartao_id, dia: int(d.slice(8)), ativo: 'sim' };
          o.fixo_id = fx.id; rows.push(['Fixos', fx]);
        }
        rows.push(['Lancamentos', o]);
      }
      showErr('fErr', '');
      if (await addRows(rows, 'Lançamento adicionado')) { $('fValor').value = ''; $('fDesc').value = ''; $('fPar').value = 1; $('fFixo').checked = false; if (ymOf(d) !== ui.mes) { ui.mes = ymOf(d); render(); } $('fValor').focus(); }
      break;
    }
    case 'addCard': {
      const lim = money($('cLimite').value), fe = int($('cFech').value), ve = int($('cVenc').value);
      if (!(lim > 0)) return showErr('cErr', 'Digite o limite do cartão, como 3.000,00.');
      if ((fe && (fe < 1 || fe > 31)) || (ve && (ve < 1 || ve > 31))) return showErr('cErr', 'Os dias de fechamento e vencimento vão de 1 a 31.');
      showErr('cErr', '');
      if (await addRows([['Cartoes', { id: uid(), banco: $('cBanco').value, apelido: $('cApelido').value.trim(), limite: lim, ajuste: 0, dia_fechamento: fe || '', dia_vencimento: ve || '' }]], 'Cartão adicionado')) ['cApelido', 'cLimite', 'cFech', 'cVenc'].forEach(i => $(i).value = '');
      break;
    }
    case 'saveCard': {
      const lim = money($('el').value); if (!(lim > 0)) { toast('Digite um limite maior que zero.'); return; }
      ui.panel = null;
      await updRow('Cartoes', id, { banco: $('eb').value, apelido: $('ea').value.trim(), limite: lim, dia_fechamento: int($('ef').value) || '', dia_vencimento: int($('ev').value) || '' }, 'Cartão atualizado');
      break;
    }
    case 'pagar': {
      const v = money($('pv').value), d = $('pd').value, c = cardById(id);
      if (!(v > 0)) { toast('Digite quanto você pagou.'); return; } if (!d) { toast('Escolha a data do pagamento.'); return; }
      ui.panel = null;
      await addRows([['Lancamentos', { id: uid(), data: d, tipo: T.F, valor: v, cartao_id: id, cartao_nome: cardNome(c), criado_em: Date.now() }]], 'Pagamento registrado. ' + brl(v) + ' liberados no limite.');
      break;
    }
    case 'juros': {
      const v = money($('jv').value), d = $('jd').value || today(), c = cardById(id);
      if (!(v > 0)) { toast('Digite o valor dos juros.'); return; }
      ui.panel = null;
      await addRows([['Lancamentos', { id: uid(), data: d, tipo: T.J, valor: v, categoria: 'Juros do cartão', pagamento: CRED, cartao_id: id, cartao_nome: cardNome(c), criado_em: Date.now() }]], 'Juros lançados');
      break;
    }
    case 'ajustar': {
      const v = money($('av').value); if (isNaN(v) || v === 0) { toast('Digite um valor, como 200,00 ou -200,00.'); return; }
      const c = cardById(id); ui.panel = null;
      await updRow('Cartoes', id, { ajuste: r2(c.ajuste + v) }, 'Cartão ajustado');
      break;
    }
    case 'addFin': {
      const nome = $('nNome').value.trim(), total = money($('nTotal').value), parc = int($('nParc').value), mensal = money($('nMensal').value), pagas = Math.max(0, int($('nPagas').value)), dia = int($('nDia').value);
      if (!nome) return showErr('nErr', 'Dê um nome ao financiamento, como "Carro".');
      if (!(parc > 0)) return showErr('nErr', 'Informe a quantidade de parcelas.');
      if (!(mensal > 0)) return showErr('nErr', 'Informe o valor mensal da parcela.');
      showErr('nErr', '');
      if (await addRows([['Financiamentos', { id: uid(), nome, tipo: $('nTipo').value, valor_total: total > 0 ? total : r2(mensal * parc), parcelas: parc, valor_mensal: mensal, pagas_antes: Math.min(pagas, parc), dia_vencimento: dia >= 1 && dia <= 31 ? dia : '' }]], 'Financiamento adicionado')) { ['nNome', 'nTotal', 'nParc', 'nMensal', 'nDia'].forEach(i => $(i).value = ''); $('nPagas').value = 0; }
      break;
    }
    case 'saveFin': {
      const parc = int($('zp').value), mensal = money($('zm').value);
      if (!(parc > 0 && mensal > 0)) { toast('Confira a quantidade de parcelas e o valor mensal.'); return; }
      ui.panel = null;
      await updRow('Financiamentos', id, { nome: $('zn').value.trim() || 'Financiamento', tipo: $('zt').value, valor_total: money($('zv').value) || 0, parcelas: parc, valor_mensal: mensal, pagas_antes: Math.max(0, int($('za').value)), dia_vencimento: int($('zd').value) || '' }, 'Financiamento atualizado');
      break;
    }
    case 'lancarFin': {
      const f = finById(id); if (!f) return;
      await addRows([['Lancamentos', { id: uid(), data: today(), tipo: T.G, valor: f.mensal, categoria: 'Financiamentos', pagamento: PIX, parcelas: 1, financiamento_id: f.id, descricao: 'Parcela ' + (pagasFin(f) + 1) + ' de ' + f.parc, criado_em: Date.now() }]], 'Parcela lançada');
      break;
    }
    case 'lancarFixo': {
      const x = X.find(z => z.id === id); if (!x) return;
      const v = money($('fx-' + id).value); if (!(v > 0)) { toast('Digite o valor deste mês.'); return; }
      const c = cardById(x.cartao), cr = x.pag === CRED;
      await addRows([['Lancamentos', { id: uid(), data: dayIn(ymOf(today()), x.dia), tipo: T.G, valor: v, categoria: x.cat, pagamento: cr ? CRED : PIX, cartao_id: cr ? x.cartao : '', cartao_nome: cr && c ? cardNome(c) : '', parcelas: 1, fixo_id: x.id, descricao: x.desc, criado_em: Date.now() }]], x.desc + ' lançado');
      break;
    }
    case 'addFixo': {
      const desc = $('xDesc').value.trim(), v = money($('xValor').value), dia = int($('xDia').value), pag = $('xPag').value;
      if (!desc) return showErr('xErr', 'Dê um nome ao gasto fixo, como "Internet".');
      if (!(v > 0)) return showErr('xErr', 'Digite o valor de costume, como 99,90.');
      if (!(dia >= 1 && dia <= 31)) return showErr('xErr', 'Informe o dia do mês, de 1 a 31.');
      if (pag === CRED && !$('xCartao').value) return showErr('xErr', 'Cadastre um cartão na aba Cartões para usar gasto fixo no crédito.');
      showErr('xErr', '');
      if (await addRows([['Fixos', { id: uid(), descricao: desc, valor: v, categoria: $('xCat').value, pagamento: pag, cartao_id: pag === CRED ? $('xCartao').value : '', dia, ativo: 'sim' }]], 'Gasto fixo adicionado')) ['xDesc', 'xValor', 'xDia'].forEach(i => $(i).value = '');
      break;
    }
    case 'toggleFixo': { const x = X.find(z => z.id === id); if (x) await updRow('Fixos', id, { ativo: x.ativo ? 'não' : 'sim' }, x.ativo ? 'Gasto fixo pausado' : 'Gasto fixo retomado'); break; }
    case 'addMeta': {
      const cat = $('mCat').value, lim = money($('mLim').value);
      if (!(lim > 0)) return showErr('mErr', 'Digite o limite por mês, como 400,00.');
      showErr('mErr', '');
      const existe = M.some(m => m.cat === cat);
      const ok = existe ? await updRow('Metas', cat, { categoria: cat, limite: lim }, 'Limite atualizado') : await addRows([['Metas', { categoria: cat, limite: lim }]], 'Limite salvo');
      if (ok) $('mLim').value = '';
      break;
    }
  }
});
document.querySelectorAll('.nav button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
$('fCat').addEventListener('change', visForm);
$('xPag').addEventListener('change', visForm);
['fValor', 'fDesc'].forEach(i => $(i).addEventListener('input', () => showErr('fErr', '')));
$('fValor').addEventListener('keydown', e => { if (e.key === 'Enter') document.querySelector('[data-act="addLanc"]').click(); });
$('btnLogin').addEventListener('click', login);
$('fData').value = today();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (ui.tab === 'resumo' && !$('scrApp').hidden) renderResumo(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && SSID && !ui.busy) { if (tokenOk()) reload(); else showLogin('Sua sessão do Google expirou. Entre de novo para continuar.'); } });

/* ---------------- início ---------------- */
async function start() {
  showLoading('Conectando à sua conta Google…');
  try {
    const u = await api('https://www.googleapis.com/oauth2/v3/userinfo');
    EMAIL = u.email || ''; try { localStorage.setItem('cf-email', EMAIL); } catch (e) {}
    showLoading('Abrindo sua planilha…');
    await openSheet();
    await load();
    await maybeArchive();
    showScreen('scrApp');
    let t = 'resumo'; try { t = localStorage.getItem('cf-aba') || 'resumo'; } catch (e) {}
    setTab($('t-' + t) ? t : 'resumo');
  } catch (e) {
    if (e && e.code === 'auth') showLogin('Sua sessão do Google expirou. Entre de novo para continuar.');
    else if (e && e.code === 'net') showLogin('Sem conexão com a internet. Confira e tente de novo.');
    else { console.error(e); showLogin('Não deu para abrir sua planilha agora. Tente entrar de novo em alguns instantes.'); }
  }
}
loadTok();
const waitGis = setInterval(() => { initGis(); if (tokenClient) clearInterval(waitGis); }, 200);
if (tokenOk()) start(); else showLogin('');

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
