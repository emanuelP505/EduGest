import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, where, getDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Cria tela de login se não tiver logado
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
    <script src="https://cdn.jsdelivr.net/npm/eruda"></script>
    <script>eruda.init();</script>
  `;
}

window.loginAdmin = async () => {
  const email = document.getElementById('adminEmail').value;
  const senha = document.getElementById('adminSenha').value;
  const erro = document.getElementById('erroLogin');
  try {
    await signInWithEmailAndPassword(auth, email, senha);
    location.reload(); // Recarrega pra verificar cargo
  } catch (e) {
    erro.textContent = 'Email ou senha inválidos';
    erro.style.display = 'block';
  }
};

document.documentElement.style.visibility = 'hidden';

onAuthStateChanged(auth, async (user) => {
  console.log('=== CHECK ADMIN ===');
  console.log('User:', user?.email);

  if (!user) {
    console.log('Sem usuário - mostrando login');
    mostrarLogin();
    return;
  }

  try {
    const userDoc = await getDoc(doc(db, 'usuarios', user.uid));

    if (!userDoc.exists() || userDoc.data().perfil!== 'admin' || userDoc.data().ativo === false) {
      console.log('BARRADO - Sem permissão de admin');
      document.getElementById('acessoNegado').style.display = 'block';
      document.documentElement.style.visibility = 'visible';
      setTimeout(() => signOut(auth), 2000);
      return;
    }

    console.log('LIBERADO - Admin confirmado');
    document.getElementById('adminContent').style.display = 'block';
    document.documentElement.style.visibility = 'visible';
    await carregarEscolas();
    await listarEscolas();
    await listarCodigos();

  } catch (error) {
    console.error('Erro:', error);
    mostrarLogin();
  }
});

//... resto das funções igual ao código anterior...
async function carregarEscolas() {
  const select = document.getElementById('escolaId');
  if (!select) return;
  const snap = await getDocs(collection(db, 'escolas'));
  select.innerHTML = '<option value="">Selecione a escola</option>';
  snap.forEach(doc => {
    const nome = doc.data().config?.escola?.nome || doc.data().nome || doc.id;
    select.innerHTML += `<option value="${doc.id}">${nome}</option>`;
  });
}

async function criarUsuarioManual() {
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
    window.location.reload();
  } catch (e) { alert('Erro: ' + e.message); }
}

async function gerarCodigo() {
  const nomeEscola = document.getElementById('nomeEscolaConvite').value.trim();
  const emailLiberado = document.getElementById('emailLiberado').value.trim();
  if (!nomeEscola) return alert('Nome da escola obrigatório');
  const codigo = 'EDU-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  try {
    await setDoc(doc(db, 'codigos_convite', codigo), {
      escola: nomeEscola, emailLiberado: emailLiberado || null,
      usado: false, criadoEm: serverTimestamp(), criadoPor: auth.currentUser.uid
    });
    document.getElementById('codigoGerado').innerHTML = `
      <div style="background:#16a34a20;padding:12px;border-radius:8px;margin-top:12px;border:1px solid #16a34a50">
        <b>Código:</b> <span style="font-size:18px;color:#16a34a;font-weight:700">${codigo}</span>
        <button class="btn btn-blue" style="margin-left:10px" onclick="navigator.clipboard.writeText('${codigo}');this.textContent='Copiado!'">Copiar</button>
      </div>`;
    document.getElementById('nomeEscolaConvite').value = '';
    document.getElementById('emailLiberado').value = '';
    listarCodigos();
  } catch (e) { alert('Erro: ' + e.message); }
}

async function listarCodigos() {
  const tbody = document.getElementById('listaCodigos');
  if (!tbody) return;
  const snap = await getDocs(query(collection(db, 'codigos_convite'), where('usado', '==', false)));
  tbody.innerHTML = '';
  if (snap.empty) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--secondary-color)">Nenhum código ativo</td></tr>`;
    return;
  }
  snap.forEach(doc => {
    const d = doc.data();
    const data = d.criadoEm?.toDate().toLocaleDateString('pt-AO') || 'Agora';
    tbody.innerHTML += `
      <tr><td><b>${doc.id}</b></td><td>${d.escola}</td><td>${d.emailLiberado || 'Qualquer email'}</td>
      <td>${data}</td><td><button class="btn btn-red" onclick="deletarCodigo('${doc.id}')">Revogar</button></td></tr>`;
  });
}

async function deletarCodigo(codigo) {
  if (!confirm(`Revogar código ${codigo}?`)) return;
  await deleteDoc(doc(db, 'codigos_convite', codigo));
  listarCodigos();
}

async function listarEscolas() {
  const tbody = document.getElementById('listaEscolas');
  if (!tbody) return;
  const escolas = await getDocs(collection(db, 'escolas'));
  tbody.innerHTML = '';
  if (escolas.empty) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center">Nenhuma escola cadastrada</td></tr>`;
    return;
  }
  for (const escola of escolas.docs) {
    const dadosEscola = escola.data();
    const nomeEscola = dadosEscola.config?.escola?.nome || dadosEscola.nome || escola.id;
    const diretores = await getDocs(query(collection(db, 'usuarios'), where('escolaId', '==', escola.id), where('perfil', '==', 'diretor')));
    const dir = diretores.docs[0]?.data();
    tbody.innerHTML += `
      <tr><td>${nomeEscola}</td><td>${dir?.nome || 'Sem diretor'}</td>
      <td>${dir?.email || '-'}</td><td>${dadosEscola.criadoEm?.toDate().toLocaleDateString('pt-AO') || '-'}</td></tr>`;
  }
}

function trocarAba(aba) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('ativa', 'active'));
  document.querySelectorAll('.painel').forEach(p => p.classList.remove('ativo', 'active'));
  event.target.classList.add('ativa');
  document.getElementById('painel-' + aba).classList.add('ativo');
}

async function logout() {
  if (!confirm('Deseja sair?')) return;
  await signOut(auth);
  window.location.href = '/index.html';
}

window.criarUsuarioManual = criarUsuarioManual;
window.gerarCodigo = gerarCodigo;
window.deletarCodigo = deletarCodigo;
window.trocarAba = trocarAba;
window.logout = logout;