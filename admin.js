            
import { app, auth, db } from './firebase-config.js';
import { 
  onAuthStateChanged, 
  signOut 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
  doc, 
  getDoc, 
  setDoc, 
  getDocs, 
  collection, 
  serverTimestamp, 
  updateDoc,
  query,
  where,
  addDoc,
  deleteDoc,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { 
  initializeApp, 
  deleteApp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getAuth, 
  createUserWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

console.log('admin.js carregado');

let adminAtual = null;

onAuthStateChanged(auth, async (user) => {
  console.log('Auth mudou:', user?.email);

  if (!user) {
    console.log('Sem login');
    document.getElementById('acessoNegado').style.display = 'block';
    document.getElementById('adminContent').style.display = 'none';
    setTimeout(() => window.location.href = 'index.html', 2000);
    return;
  }

  try {
    const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
    
    if (!userDoc.exists()) {
      console.log('Doc não existe');
      throw new Error('Usuário sem cadastro');
    }

    const dados = userDoc.data();
    console.log('Perfil:', dados.perfil);

    if (dados.perfil !== 'admin') {
      console.log('Não é admin');
      throw new Error('Sem permissão de admin');
    }

    adminAtual = { uid: user.uid, ...dados };
    document.getElementById('adminContent').style.display = 'block';
    document.getElementById('acessoNegado').style.display = 'none';
    console.log('Admin confirmado');
    
    iniciarPainel();

  } catch (err) {
    console.error('Erro auth:', err);
    document.getElementById('acessoNegado').style.display = 'block';
    document.getElementById('adminContent').style.display = 'none';
    document.getElementById('acessoNegado').innerHTML = `
      <i class="fa-solid fa-ban" style="font-size:60px;color:#dc2626"></i>
      <h2>Erro: ${err.code || ''}</h2>
      <p>${err.message}</p>
    `;
  }
});

// 1. INICIAR PAINEL COM TRY/CATCH EM CADA FUNÇÃO
function iniciarPainel() {
  console.log('Iniciando painel...');
  
  // Roda cada função separada pra uma não quebrar tudo
  carregarStats().catch(e => console.error('Erro stats:', e));
  carregarConvites().catch(e => console.error('Erro convites:', e));
  carregarEscolas().catch(e => console.error('Erro escolas:', e));
  carregarEscolasSelect().catch(e => console.error('Erro select:', e));
  carregarFinanceiro().catch(e => console.error('Erro financeiro:', e));
  carregarLogs().catch(e => console.error('Erro logs:', e));
}

// 2. TROCAR ABAS
window.trocarAba = (aba) => {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('ativa'));
  document.querySelectorAll('.painel').forEach(p => p.classList.remove('ativo'));
  
  event.target.closest('.tab').classList.add('ativa');
  document.getElementById(`painel-${aba}`).classList.add('ativo');
}

// 3. DASHBOARD STATS
async function carregarStats() {
  try {
    const escolasSnap = await getDocs(collection(db, 'escolas'));
    let ativas = 0, congeladas = 0, inadimplentes = 0, totalAlunos = 0;

    escolasSnap.forEach(docSnap => {
      const e = docSnap.data();
      if (e.congelada) congeladas++;
      else if (e.ativo !== false) ativas++;
      if (e.inadimplente) inadimplentes++;
      totalAlunos += e.totalAlunos || 0;
    });

    document.getElementById('totalEscolas').textContent = ativas;
    document.getElementById('totalAlunos').textContent = totalAlunos;
    document.getElementById('totalCongeladas').textContent = congeladas;
    document.getElementById('totalInadimplentes').textContent = inadimplentes;

  } catch (err) {
    console.error('Erro stats:', err);
    document.getElementById('totalEscolas').textContent = 'Erro';
  }
}

// 4. CONVITES
window.gerarCodigo = async () => {
  const nomeEscola = document.getElementById('nomeEscolaConvite').value.trim();
  const email = document.getElementById('emailLiberado').value.trim();
  const dias = parseInt(document.getElementById('validadeDias').value) || 30;
  const plano = document.getElementById('plano').value.trim() || 'basico';

  if (!nomeEscola) return alert('Nome da escola obrigatório');

  const codigo = `EDU${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const expiraEm = new Date();
  expiraEm.setDate(expiraEm.getDate() + dias);

  try {
    await setDoc(doc(db, 'convites', codigo), {
      nomeEscola: nomeEscola,
      emailLiberado: email || null,
      plano: plano,
      usado: false,
      expiraEm: expiraEm,
      criadoEm: serverTimestamp(),
      criadoPor: adminAtual.email
    });

    document.getElementById('codigoGerado').innerHTML = `
      <div class="card" style="background:rgba(22,163,74,.1);border-color:#16a34a">
        <strong>Código:</strong> ${codigo}<br>
        <strong>Escola:</strong> ${nomeEscola}<br>
        <strong>Expira:</strong> ${expiraEm.toLocaleDateString()}
      </div>
    `;

    document.getElementById('nomeEscolaConvite').value = '';
    document.getElementById('emailLiberado').value = '';
    
    registrarLog('Criou convite', codigo);
    carregarConvites();

  } catch (err) {
    alert('Erro: ' + err.message);
  }
}

async function carregarConvites() {
  const tbody = document.getElementById('listaCodigos');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6">Carregando...</td></tr>';

  try {
    const q = query(collection(db, 'convites'), orderBy('criadoEm', 'desc'));
    const snap = await getDocs(q);
    
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="6">Nenhum convite criado</td></tr>';
      return;
    }
    
    tbody.innerHTML = '';
    snap.forEach((docSnap) => {
      const c = docSnap.data();
      const expira = c.expiraEm?.toDate ? c.expiraEm.toDate().toLocaleDateString() : '-';
      const status = c.usado ? 
        '<span class="badge badge-green">Usado</span>' : 
        '<span class="badge badge-yellow">Disponível</span>';
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${docSnap.id}</strong></td>
        <td>${c.nomeEscola || '-'}</td>
        <td>${c.plano}</td>
        <td>${expira}</td>
        <td>${status}</td>
        <td>
          ${!c.usado ? `<button class="btn btn-red" onclick="revogarConvite('${docSnap.id}')">Revogar</button>` : '-'}
        </td>
      `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="6">Erro: ' + err.message + '</td></tr>';
  }
}

window.revogarConvite = async (codigo) => {
  if (!confirm(`Revogar convite ${codigo}?`)) return;
  try {
    await deleteDoc(doc(db, 'convites', codigo));
    registrarLog('Revogou convite', codigo);
    carregarConvites();
  } catch (err) {
    alert('Erro: ' + err.message);
  }
}

// 5. ESCOLAS
async function carregarEscolas() {
  const tbody = document.getElementById('listaEscolas');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6">Carregando...</td></tr>';

  try {
    const snap = await getDocs(collection(db, 'escolas'));
    
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="6">Nenhuma escola cadastrada</td></tr>';
      return;
    }
    
    tbody.innerHTML = '';
    snap.forEach((docSnap) => {
      const e = docSnap.data();
      const venc = e.vencimento?.toDate ? e.vencimento.toDate().toLocaleDateString() : '-';
      
      let statusBadge = '<span class="badge badge-green">Ativa</span>';
      if (e.congelada) statusBadge = '<span class="badge badge-red">Congelada</span>';
      else if (e.inadimplente) statusBadge = '<span class="badge badge-yellow">Inadimplente</span>';
      
      const btnCongelar = e.congelada ? 
        `<button class="btn btn-green" onclick="descongelarEscola('${docSnap.id}')">Descongelar</button>` :
        `<button class="btn btn-yellow" onclick="congelarEscola('${docSnap.id}')">Congelar</button>`;
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${e.nome || '-'}</td>
        <td>${e.plano || '-'}</td>
        <td>${statusBadge}</td>
        <td>${e.totalAlunos || 0}</td>
        <td>${venc}</td>
        <td>${btnCongelar}</td>
      `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="6">Erro: ' + err.message + '</td></tr>';
  }
}

window.congelarEscola = async (escolaId) => {
  const motivo = prompt("Motivo do congelamento:");
  if (!motivo) return;
  try {
    await updateDoc(doc(db, 'escolas', escolaId), {
      congelada: true,
      motivoCongelamento: motivo,
      congeladaEm: serverTimestamp(),
      congeladaPor: adminAtual.email
    });
    registrarLog('Congelou escola', escolaId);
    carregarEscolas();
    carregarStats();
  } catch (err) {
    alert('Erro: ' + err.message);
  }
}

window.descongelarEscola = async (escolaId) => {
  if (!confirm('Descongelar escola?')) return;
  try {
    await updateDoc(doc(db, 'escolas', escolaId), {
      congelada: false,
      descongeladaEm: serverTimestamp(),
      descongeladaPor: adminAtual.email
    });
    registrarLog('Descongelou escola', escolaId);
    carregarEscolas();
    carregarStats();
  } catch (err) {
    alert('Erro: ' + err.message);
  }
}

window.filtrarEscolas = () => {
  const termo = document.getElementById('buscaEscola').value.toLowerCase();
  document.querySelectorAll('#listaEscolas tr').forEach(tr => {
    const nome = tr.cells[0]?.textContent.toLowerCase() || '';
    tr.style.display = nome.includes(termo) ? '' : 'none';
  });
}

// 6. USUÁRIOS
async function carregarEscolasSelect() {
  const select = document.getElementById('escolaId');
  if (!select) return;
  try {
    const snap = await getDocs(collection(db, 'escolas'));
    select.innerHTML = '<option value="">Selecione a escola</option>';
    snap.forEach((docSnap) => {
      const e = docSnap.data();
      select.innerHTML += `<option value="${docSnap.id}">${e.nome}</option>`;
    });
  } catch (err) {
    console.error(err);
  }
}

window.criarUsuarioManual = async () => {
  const escolaId = document.getElementById('escolaId').value;
  const nome = document.getElementById('nome').value.trim();
  const email = document.getElementById('email').value.trim();
  const senha = document.getElementById('senha').value;
  const perfil = document.getElementById('perfil').value;

  if (!escolaId || !nome || !email || !senha || senha.length < 6) {
    return alert('Preenche todos os campos. Senha mín 6 caracteres');
  }

  try {
    const secondaryApp = initializeApp(auth.app.options, "Secondary" + Date.now());
    const secondaryAuth = getAuth(secondaryApp);

    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, senha);
    const uid = cred.user.uid;

    await setDoc(doc(db, 'usuarios', uid), {
      nome: nome,
      email: email,
      perfil: perfil,
      escolaId: escolaId,
      ativo: true,
      criadoEm: serverTimestamp(),
      criadoPor: adminAtual.email
    });

    await signOut(secondaryAuth);
    await deleteApp(secondaryApp);

    document.getElementById('formAdmin').reset();
    registrarLog('Criou usuário', email);
    alert('Usuário criado!');

  } catch (err) {
    console.error(err);
    alert('Erro: ' + err.message);
  }
}

// 7. FINANCEIRO
async function carregarFinanceiro() {
  const tbody = document.getElementById('listaFinanceiro');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6">Carregando...</td></tr>';
  try {
    const snap = await getDocs(collection(db, 'escolas'));
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="6">Nenhuma escola</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    snap.forEach((docSnap) => {
      const e = docSnap.data();
      const venc = e.vencimento?.toDate ? e.vencimento.toDate().toLocaleDateString() : '-';
      let status = '<span class="badge badge-green">Em dia</span>';
      if (e.inadimplente) status = '<span class="badge badge-red">Inadimplente</span>';
      else if (e.congelada) status = '<span class="badge badge-yellow">Congelada</span>';
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${e.nome || '-'}</td>
        <td>${e.plano || '-'}</td>
        <td>Kz ${e.valorMensal || 0}</td>
        <td>${venc}</td>
        <td>${status}</td>
        <td><button class="btn btn-blue" onclick="marcarPago('${docSnap.id}')">Marcar Pago</button></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="6">Erro: ' + err.message + '</td></tr>';
  }
}

window.marcarPago = async (escolaId) => {
  if (!confirm('Confirmar pagamento?')) return;
  try {
    const novoVenc = new Date();
    novoVenc.setMonth(novoVenc.getMonth() + 1);
    await updateDoc(doc(db, 'escolas', escolaId), {
      inadimplente: false,
      ultimoPagamento: serverTimestamp(),
      vencimento: novoVenc
    });
    registrarLog('Marcou pagamento', escolaId);
    carregarFinanceiro();
    carregarStats();
  } catch (err) {
    alert('Erro: ' + err.message);
  }
}

// 8. LOGS
async function carregarLogs() {
  const tbody = document.getElementById('listaLogs');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5">Carregando...</td></tr>';
  try {
    const q = query(collection(db, 'admin_logs'), orderBy('data', 'desc'), limit(100));
    const snap = await getDocs(q);
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="5">Sem logs</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    snap.forEach((docSnap) => {
      const l = docSnap.data();
      const data = l.data?.toDate ? l.data.toDate().toLocaleString('pt-AO') : '-';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${data}</td>
        <td>${l.admin}</td>
        <td>${l.acao}</td>
        <td>${l.alvo}</td>
        <td>${l.ip || '-'}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="5">Erro: ' + err.message + '</td></tr>';
  }
}

async function registrarLog(acao, alvo) {
  try {
    await addDoc(collection(db, 'admin_logs'), {
      data: serverTimestamp(),
      admin: adminAtual.email,
      acao: acao,
      alvo: alvo,
      ip: null
    });
  } catch (err) {
    console.error('Erro log:', err);
  }
}

// 9. MANUTENÇÃO
window.toggleModoManutencao = async () => {
  const status = confirm('Ativar modo manutenção? OK = Ativar, Cancelar = Desativar');
  try {
    await setDoc(doc(db, 'config', 'manutencao'), {
      ativo: status,
      ativadoPor: adminAtual.email,
      ativadoEm: serverTimestamp()
    });
    registrarLog(status ? 'Ativou manutenção' : 'Desativou manutenção', 'Sistema');
    alert(status ? 'Manutenção ativada' : 'Manutenção desativada');
  } catch (err) {
    alert('Erro: ' + err.message);
  }
}

// 10. LOGOUT
window.logout = async () => {
  await signOut(auth);
  window.location.href = 'index.html';
}
