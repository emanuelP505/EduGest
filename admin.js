import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, where, getDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const EMAIL_ADMIN = 'esperancagaspar505@gmail.com';

document.documentElement.style.visibility = 'hidden';

onAuthStateChanged(auth, async (user) => {
  if (!user || user.email!== EMAIL_ADMIN) {
    document.getElementById('acessoNegado').style.display = 'block';
    document.documentElement.style.visibility = 'visible';
    if (user) await signOut(auth);
    return;
  }
  document.getElementById('adminContent').style.display = 'block';
  document.documentElement.style.visibility = 'visible';
  await carregarEscolas();
  await listarEscolas();
  await listarCodigos();
});

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

async function criarUsuario() {
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
      nome: dados.nome,
      email: dados.email,
      perfil: dados.perfil,
      escolaId: dados.escolaId,
      ativo: true,
      criadoEm: serverTimestamp()
    });
    alert('Usuário criado! Faça login novamente no sistema.');
    window.location.href = '/index.html';
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

async function gerarCodigo() {
  const nomeEscola = document.getElementById('nomeEscolaConvite').value.trim();
  const emailLiberado = document.getElementById('emailLiberado').value.trim();

  if (!nomeEscola) return alert('Nome da escola obrigatório');

  const codigo = 'EDU-' + Math.random().toString(36).substring(2, 8).toUpperCase();

  try {
    await setDoc(doc(db, 'codigos_convite', codigo), {
      escola: nomeEscola,
      emailLiberado: emailLiberado || null,
      usado: false,
      criadoEm: serverTimestamp(),
      criadoPor: auth.currentUser.uid
    });

    document.getElementById('codigoGerado').innerHTML = `
      <div style="background:#16a34a20;padding:12px;border-radius:8px;margin-top:12px;border:1px solid #16a34a50">
        <b>Código gerado:</b> <span style="font-size:18px;color:#16a34a;font-weight:700">${codigo}</span>
        <button class="btn btn-blue" style="margin-left:10px" onclick="navigator.clipboard.writeText('${codigo}');this.textContent='Copiado!'">Copiar</button>
        <p style="margin:8px 0 0;font-size:13px;color:var(--secondary-color)">Envia pro diretor. Válido para 1 uso apenas.</p>
      </div>
    `;
    document.getElementById('nomeEscolaConvite').value = '';
    document.getElementById('emailLiberado').value = '';
    listarCodigos();
  } catch (e) {
    alert('Erro ao gerar: ' + e.message);
  }
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
      <tr>
        <td><b>${doc.id}</b></td>
        <td>${d.escola}</td>
        <td>${d.emailLiberado || 'Qualquer email'}</td>
        <td>${data}</td>
        <td><button class="btn btn-red" onclick="deletarCodigo('${doc.id}')">Revogar</button></td>
      </tr>
    `;
  });
}

async function deletarCodigo(codigo) {
  if (!confirm(`Revogar código ${codigo}? O cliente não vai conseguir usar.`)) return;
  await deleteDoc(doc(db, 'codigos_convite', codigo));
  listarCodigos();
}

async function buscarUsuario() {
  const email = document.getElementById('buscaEmail').value;
  if (email.length < 5) return;
  const q = query(collection(db, 'usuarios'), where('email', '==', email));
  const snap = await getDocs(q);
  const div = document.getElementById('resultadoBusca');
  if (snap.empty) return div.innerHTML = '<p style="color:#dc2626">Não encontrado</p>';
  const u = snap.docs[0].data();
  div.innerHTML = `
    <div style="background:var(--search-area-bg);padding:12px;border-radius:8px">
      <p><b>Nome:</b> ${u.nome}</p>
      <p><b>Perfil:</b> ${u.perfil}</p>
      <p><b>Escola:</b> ${u.escolaId}</p>
      <p><b>Ativo:</b> ${u.ativo? 'Sim' : 'Não'}</p>
    </div>
  `;
}

async function resetarSenha() {
  const email = document.getElementById('emailReset').value;
  if (!email) return alert('Digite o email');
  try {
    await sendPasswordResetEmail(auth, email);
    alert('Link enviado pro email ' + email);
    document.getElementById('emailReset').value = '';
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

async function desativarUsuario() {
  const email = document.getElementById('emailDesativar').value;
  if (!email) return alert('Digite o email');
  if (!confirm(`Desativar ${email}?`)) return;
  const q = query(collection(db, 'usuarios'), where('email', '==', email));
  const snap = await getDocs(q);
  if (snap.empty) return alert('Usuário não encontrado');
  await updateDoc(snap.docs[0].ref, { ativo: false });
  alert('Usuário desativado');
  document.getElementById('emailDesativar').value = '';
}

async function listarEscolas() {
  const tbody = document.getElementById('listaEscolas');
  if (!tbody) return;
  const escolas = await getDocs(collection(db, 'escolas'));
  tbody.innerHTML = '';
  if (escolas.empty) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--secondary-color)">Nenhuma escola cadastrada ainda</td></tr>`;
    return;
  }
  for (const escola of escolas.docs) {
    const dadosEscola = escola.data();
    const nomeEscola = dadosEscola.config?.escola?.nome || dadosEscola.nome || escola.id;
    const diretores = await getDocs(query(collection(db, 'usuarios'), where('escolaId', '==', escola.id), where('perfil', '==', 'diretor')));
    const dir = diretores.docs[0]?.data();
    tbody.innerHTML += `
      <tr>
        <td>${nomeEscola}</td>
        <td>${dir?.nome || 'Sem diretor'}</td>
        <td>${dir?.email || '-'}</td>
        <td>${dadosEscola.criadoEm?.toDate().toLocaleDateString('pt-AO') || '-'}</td>
      </tr>
    `;
  }
}

function trocarAba(aba) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('ativa', 'active'));
  document.querySelectorAll('.painel').forEach(p => p.classList.remove('ativo', 'active'));
  event.target.classList.add('ativa');
  document.getElementById('painel-' + aba).classList.add('ativo');
}

async function logout() {
  if (!confirm('Deseja sair do painel admin?')) return;
  await signOut(auth);
  window.location.href = '/index.html';
}

window.criarUsuarioManual = criarUsuario;
window.criarUsuario = criarUsuario;
window.buscarUsuario = buscarUsuario;
window.resetarSenha = resetarSenha;
window.desativarUsuario = desativarUsuario;
window.trocarAba = trocarAba;
window.gerarCodigo = gerarCodigo;
window.deletarCodigo = deletarCodigo;
window.logout = logout;