import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, where, getDoc, serverTimestamp, orderBy, limit, addDoc, deleteField } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// LOGIN
function mostrarLogin() {
  document.documentElement.style.visibility = 'visible';
  document.body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0f172a;padding:20px">
      <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:32px;width:100%;max-width:400px">
        <h2 style="color:#f1f5f9;text-align:center;margin:0 0 24px">Login Admin</h2>
        <input id="adminEmail" type="email" placeholder="Email" style="width:100%;padding:12px;margin-bottom:12px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#f1f5f9">
        <input id="adminSenha" type="password" placeholder="Senha" style="width:100%;padding:12px;margin-bottom:16px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#f1f5f9">
        <button onclick="loginAdmin()" style="width:100%;padding:12px;border:none;border-radius:8px;background:#3b82f6;color:#fff;font-weight:600;cursor:pointer">Entrar</button>
        <p id="erroLogin" style="color:#dc2626;font-size:13px;margin-top:12px;text-align:center;display:none"></p>
      </div>
    </div>
  `;
}

window.loginAdmin = async () => {
  const email = document.getElementById('adminEmail').value;
  const senha = document.getElementById('adminSenha').value;
  const erro = document.getElementById('erroLogin');
  try {
    await signInWithEmailAndPassword(auth, email, senha);
    location.reload();
  } catch (e) {
    erro.textContent = 'Email ou senha inválidos';
    erro.style.display = 'block';
  }
};

document.documentElement.style.visibility = 'hidden';

onAuthStateChanged(auth, async (user) => {
  if (!user) return mostrarLogin();

  try {
    const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
    const dados = userDoc.data();

    if (!userDoc.exists() || dados.perfil!== 'admin' || dados.ativo === false) {
      document.getElementById('acessoNegado').style.display = 'block';
      document.documentElement.style.visibility = 'visible';
      setTimeout(() => signOut(auth), 2000);
      return;
    }

    document.getElementById('adminContent').style.display = 'block';
    document.documentElement.style.visibility = 'visible';

    await Promise.all([
      carregarStats(),
      carregarEscolas(),
      listarEscolas(),
      listarCodigos(),
      listarFinanceiro(),
      listarLogs()
    ]);

  } catch (error) {
    console.error('Erro:', error);
    mostrarLogin();
  }
};

// STATS - BUG 1 CORRIGIDO: alunos -> estudantes
async function carregarStats() {
  const escolas = await getDocs(collection(db, 'escolas'));
  let ativas = 0, congeladas = 0, inadimplentes = 0, totalAlunos = 0;

  for (const docEscola of escolas.docs) {
    const d = docEscola.data();
    if (d.ativo === false) congeladas++;
    else ativas++;
    if (d.inadimplente === true) inadimplentes++;

    const alunos = await getDocs(query(collection(db, 'estudantes'), where('escolaId', '==', docEscola.id)));
    totalAlunos += alunos.size;
  }

  document.getElementById('totalEscolas').textContent = ativas;
  document.getElementById('totalCongeladas').textContent = congeladas;
  document.getElementById('totalInadimplentes').textContent = inadimplentes;
  document.getElementById('totalAlunos').textContent = totalAlunos;
}

// ESCOLAS + CONGELAR - BUG 1 e 2 CORRIGIDOS
async function listarEscolas() {
  const tbody = document.getElementById('listaEscolas');
  if (!tbody) return;
  const escolas = await getDocs(collection(db, 'escolas'));
  tbody.innerHTML = '';

  if (escolas.empty) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center">Nenhuma escola</td></tr>`;
    return;
  }

  for (const escola of escolas.docs) {
    const d = escola.data();
    const nome = d.nome || d.nomeEscola || escola.id; // BUG 2: fallback
    const plano = d.plano || 'basico';
    const ativo = d.ativo!== false;
    const vencimento = d.vencimento?.toDate().toLocaleDateString('pt-AO') || 'Sem data'; // BUG 3: fallback

    const alunos = await getDocs(query(collection(db, 'estudantes'), where('escolaId', '==', escola.id))); // BUG 1: estudantes

    const statusBadge = ativo
    ? '<span class="badge badge-green">Ativa</span>'
      : '<span class="badge badge-red">Congelada</span>';

    const btnAcao = ativo
    ? `<button class="btn btn-red" onclick="handleCongelar('${escola.id}', '${nome}')">Congelar</button>`
      : `<button class="btn btn-green" onclick="handleDescongelar('${escola.id}', '${nome}')">Descongelar</button>`;

    tbody.innerHTML += `
      <tr>
        <td>${nome}</td>
        <td>${plano}</td>
        <td>${statusBadge}</td>
        <td>${alunos.size}</td>
        <td>${vencimento}</td>
        <td>${btnAcao}</td>
      </tr>`;
  }
}

// BUG 4 CORRIGIDO: updateDoc + new Date()
window.handleCongelar = async (escolaId, nome) => {
  const motivo = prompt(`Motivo do bloqueio da escola ${nome}:`, 'Inadimplência');
  if (!motivo) return;

  try {
    const escolaRef = doc(db, 'escolas', escolaId);
    const escolaSnap = await getDoc(escolaRef);

    if (!escolaSnap.exists()) {
      alert('Erro: Escola não encontrada no banco.');
      return;
    }

    await updateDoc(escolaRef, {
      ativo: false,
      motivoBloqueio: motivo,
      bloqueadoEm: new Date()
    });

    await addDoc(collection(db, 'logs_admin'), {
      acao: 'CONGELAR',
      escolaId: escolaId,
      escolaNome: nome,
      motivo: motivo,
      adminId: auth.currentUser.uid,
      adminEmail: auth.currentUser.email,
      data: new Date()
    });

    alert('Escola congelada com sucesso!');
    listarEscolas();
    carregarStats();

  } catch (e) {
    console.error('ERRO COMPLETO:', e);
    alert(`Erro ao congelar: ${e.code || 'desconhecido'} - ${e.message}`);
  }
};

window.handleDescongelar = async (escolaId, nome) => {
  if (!confirm(`Descongelar escola ${nome}?`)) return;

  try {
    const escolaRef = doc(db, 'escolas', escolaId);

    await updateDoc(escolaRef, {
      ativo: true,
      motivoBloqueio: deleteField(),
      desbloqueadoEm: new Date()
    });

    await addDoc(collection(db, 'logs_admin'), {
      acao: 'DESCONGELAR',
      escolaId: escolaId,
      escolaNome: nome,
      adminId: auth.currentUser.uid,
      adminEmail: auth.currentUser.email,
      data: new Date()
    });

    alert('Escola liberada!');
    listarEscolas();
    carregarStats();

  } catch (e) {
    console.error('ERRO COMPLETO:', e);
    alert(`Erro ao descongelar: ${e.code || 'desconhecido'} - ${e.message}`);
  }
};

window.filtrarEscolas = () => {
  const termo = document.getElementById('buscaEscola').value.toLowerCase();
  document.querySelectorAll('#listaEscolas tr').forEach(tr => {
    const nome = tr.cells[0]?.textContent.toLowerCase() || '';
    tr.style.display = nome.includes(termo)? '' : 'none';
  });
};

// CONVITES
async function gerarCodigo() {
  const nomeEscola = document.getElementById('nomeEscolaConvite').value.trim();
  const emailLiberado = document.getElementById('emailLiberado').value.trim();
  const validadeDias = parseInt(document.getElementById('validadeDias').value) || 30;
  const plano = document.getElementById('plano').value || 'basico';

  if (!nomeEscola) return alert('Nome da escola obrigatório');

  const codigo = 'EDU-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  const expiraEm = new Date();
  expiraEm.setDate(expiraEm.getDate() + validadeDias);

  try {
    await setDoc(doc(db, 'codigos_convite', codigo), {
      escola: nomeEscola,
      emailLiberado: emailLiberado || null,
      plano,
      usado: false,
      expiraEm,
      criadoEm: serverTimestamp(),
      criadoPor: auth.currentUser.uid
    });
    document.getElementById('codigoGerado').innerHTML = `
      <div style="background:#16a34a20;padding:12px;border-radius:8px;margin-top:12px;border:1px solid #16a34a50">
        <b>Código:</b> <span style="font-size:18px;color:#16a34a;font-weight:700">${codigo}</span>
        <button class="btn btn-blue" style="margin-left:10px" onclick="navigator.clipboard.writeText('${codigo}');this.textContent='Copiado!'">Copiar</button>
        <div style="font-size:12px;margin-top:4px;color:var(--secondary-color)">Plano: ${plano} | Expira: ${expiraEm.toLocaleDateString('pt-AO')}</div>
      </div>`;
    listarCodigos();
  } catch (e) { alert('Erro: ' + e.message); }
}

async function listarCodigos() {
  const tbody = document.getElementById('listaCodigos');
  if (!tbody) return;
  const snap = await getDocs(query(collection(db, 'codigos_convite'), where('usado', '==', false)));
  tbody.innerHTML = '';
  if (snap.empty) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center">Nenhum código ativo</td></tr>`;
    return;
  }
  snap.forEach(docSnap => {
    const d = docSnap.data();
    const expira = d.expiraEm?.toDate().toLocaleDateString('pt-AO') || '-';
    const expirado = d.expiraEm?.toDate() < new Date();
    const status = expirado? '<span class="badge badge-red">Expirado</span>' : '<span class="badge badge-green">Válido</span>';
    tbody.innerHTML += `
      <tr>
        <td><b>${docSnap.id}</b></td>
        <td>${d.escola}</td>
        <td>${d.plano || 'basico'}</td>
        <td>${expira}</td>
        <td>${status}</td>
        <td><button class="btn btn-red" onclick="deletarCodigo('${docSnap.id}')">Revogar</button></td>
      </tr>`;
  });
}

window.deletarCodigo = async (codigo) => {
  if (!confirm(`Revogar código ${codigo}?`)) return;
  await deleteDoc(doc(db, 'codigos_convite', codigo));
  listarCodigos();
};

// FINANCEIRO - BUG 2 e 3 CORRIGIDOS
async function listarFinanceiro() {
  const tbody = document.getElementById('listaFinanceiro');
  if (!tbody) return;
  const escolas = await getDocs(collection(db, 'escolas'));
  tbody.innerHTML = '';

  escolas.forEach(docEscola => {
    const d = docEscola.data();
    const nome = d.nome || d.nomeEscola || docEscola.id; // BUG 2: fallback
    const vencimento = d.vencimento?.toDate();
    const vencido = vencimento && vencimento < new Date();
    const status = d.inadimplente? '<span class="badge badge-red">Inadimplente</span>'
      : vencido? '<span class="badge badge-yellow">Vencido</span>'
      : '<span class="badge badge-green">Em dia</span>';

    tbody.innerHTML += `
      <tr>
        <td>${nome}</td>
        <td>${d.plano || 'basico'}</td>
        <td>€${d.valorMensal || 50}</td>
        <td>${vencimento?.toLocaleDateString('pt-AO') || 'Sem data'}</td>
        <td>${status}</td>
        <td><button class="btn btn-blue" onclick="marcarPago('${docEscola.id}')">Marcar Pago</button></td>
      </tr>`;
  });
}

window.marcarPago = async (escolaId) => {
  const novaData = new Date();
  novaData.setMonth(novaData.getMonth() + 1);
  await updateDoc(doc(db, 'escolas', escolaId), {
    vencimento: novaData,
    inadimplente: false,
    ultimoPagamento: new Date()
  });
  listarFinanceiro();
  carregarStats();
};

// LOGS
async function listarLogs() {
  const tbody = document.getElementById('listaLogs');
  if (!tbody) return;
  const logs = await getDocs(query(collection(db, 'logs_admin'), orderBy('data', 'desc'), limit(100)));
  tbody.innerHTML = '';
  logs.forEach(docLog => {
    const d = docLog.data();
    tbody.innerHTML += `
      <tr>
        <td>${d.data?.toDate().toLocaleString('pt-AO') || '-'}</td>
        <td>${d.adminEmail || '-'}</td>
        <td>${d.acao}</td>
        <td>${d.escolaNome || d.alvo || '-'}</td>
        <td>${d.ip || '-'}</td>
      </tr>`;
  });
}

// USUÁRIOS
async function carregarEscolas() {
  const select = document.getElementById('escolaId');
  if (!select) return;
  const snap = await getDocs(collection(db, 'escolas'));
  select.innerHTML = '<option value="">Selecione a escola</option>';
  snap.forEach(docSnap => {
    const nome = docSnap.data().nome || docSnap.data().nomeEscola || docSnap.id;
    select.innerHTML += `<option value="${docSnap.id}">${nome}</option>`;
  });
}

window.criarUsuarioManual = async () => {
  const dados = {
    escolaId: document.getElementById('escolaId').value,
    nome: document.getElementById('nome').value,
    email: document.getElementById('email').value,
    senha: document.getElementById('senha').value,
    perfil: document.getElementById('perfil').value
  };
  if (Object.values(dados).some(v =>!v)) return alert('Preencha tudo');
  try {
    const cred = await createUserWithEmailAndPassword(auth, dados.email, dados.senha);
    await setDoc(doc(db, 'usuarios', cred.user.uid), {
      nome: dados.nome, email: dados.email, perfil: dados.perfil,
      escolaId: dados.escolaId, ativo: true, criadoEm: serverTimestamp()
    });
    alert('Usuário criado!');
    document.getElementById('formAdmin').reset();
  } catch (e) { alert('Erro: ' + e.message); }
};

// MANUTENÇÃO
window.toggleModoManutencao = async () => {
  if (!confirm('Ativar/Desativar modo manutenção? Todas as escolas serão bloqueadas.')) return;
  try {
    const configRef = doc(db, 'config', 'app');
    const configSnap = await getDoc(configRef);
    const novoStatus =!configSnap.data()?.manutencao;

    await setDoc(configRef, { manutencao: novoStatus }, { merge: true });

    await addDoc(collection(db, 'logs_admin'), {
      acao: novoStatus? 'MANUTENCAO_ON' : 'MANUTENCAO_OFF',
      adminId: auth.currentUser.uid,
      adminEmail: auth.currentUser.email,
      data: new Date()
    });

    alert(novoStatus? 'Modo manutenção ATIVADO' : 'Modo manutenção DESATIVADO');
  } catch (e) {
    console.error(e);
    alert('Erro: ' + e.message);
  }
};

// NAVEGAÇÃO
window.trocarAba = (aba) => {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('ativa'));
  document.querySelectorAll('.painel').forEach(p => p.classList.remove('ativo'));
  event.target.classList.add('ativa');
  document.getElementById('painel-' + aba).classList.add('ativo');
};

window.logout = async () => {
  if (!confirm('Deseja sair?')) return;
  await signOut(auth);
  window.location.href = '/index.html';
};

window.gerarCodigo = gerarCodigo;
// DEBUG TEMPORARIO - APAGA DEPOIS
window.addEventListener('load', () => {
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#000;color:#0f0;padding:10px;font-size:10px;z-index:99999;max-height:200px;overflow:auto';
  div.id = 'debugLog';
  document.body.appendChild(div);
  
  const oldLog = console.log;
  const oldError = console.error;
  console.log = (...args) => {
    oldLog(...args);
    document.getElementById('debugLog').innerHTML += 'LOG: ' + args.join(' ') + '<br>';
  };
  console.error = (...args) => {
    oldError(...args);
    document.getElementById('debugLog').innerHTML += 'ERRO: ' + args.join(' ') + '<br>';
  };
  
  console.log('Função atual:', window.handleCongelar.toString().substring(0, 100));
});
// FIM DEBUG
