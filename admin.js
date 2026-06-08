import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { collection, getDocs, doc, setDoc, updateDoc, query, where, getDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const EMAIL_ADMIN = 'esperancagaspar505@email.com';

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
});

async function carregarEscolas() {
  const select = document.getElementById('escolaId');
  const snap = await getDocs(collection(db, 'escolas'));
  select.innerHTML = '<option value="">Selecione a escola</option>';
  snap.forEach(doc => {
    select.innerHTML += `<option value="${doc.id}">${doc.data().config?.escola?.nome || doc.id}</option>`;
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

  const adminEmail = auth.currentUser.email;
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
    alert('Criado! Faça login novamente.');
    window.location.href = '/index.html';
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

async function buscarUsuario() {
  const email = document.getElementById('buscaEmail').value;
  if (email.length < 5) return;
  const q = query(collection(db, 'usuarios'), where('email', '==', email));
  const snap = await getDocs(q);
  const div = document.getElementById('resultadoBusca');
  if (snap.empty) return div.innerHTML = 'Não encontrado';
  const u = snap.docs[0].data();
  div.innerHTML = `
    <p><b>Nome:</b> ${u.nome}</p>
    <p><b>Perfil:</b> ${u.perfil}</p>
    <p><b>Escola:</b> ${u.escolaId}</p>
    <p><b>Ativo:</b> ${u.ativo? 'Sim' : 'Não'}</p>
  `;
}

async function resetarSenha() {
  const email = document.getElementById('emailReset').value;
  try {
    await sendPasswordResetEmail(auth, email);
    alert('Link enviado pro email');
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

async function desativarUsuario() {
  const email = document.getElementById('emailDesativar').value;
  if (!confirm(`Desativar ${email}?`)) return;
  const q = query(collection(db, 'usuarios'), where('email', '==', email));
  const snap = await getDocs(q);
  if (snap.empty) return alert('Não encontrado');
  await updateDoc(snap.docs[0].ref, { ativo: false });
  alert('Desativado');
}

async function listarEscolas() {
  const tbody = document.getElementById('listaEscolas');
  const escolas = await getDocs(collection(db, 'escolas'));
  tbody.innerHTML = '';
  for (const escola of escolas.docs) {
    const alunos = await getDocs(query(collection(db, 'estudantes'), where('escolaId', '==', escola.id)));
    const diretores = await getDocs(query(collection(db, 'usuarios'), where('escolaId', '==', escola.id), where('perfil', '==', 'diretor')));
    const dir = diretores.docs[0]?.data().nome || 'Sem diretor';
    tbody.innerHTML += `
      <tr>
        <td>${escola.data().config?.escola?.nome || escola.id}</td>
        <td>${dir}</td>
        <td>${alunos.size}</td>
        <td>Ativo</td>
        <td><button class="btn btn-red" onclick="alert('Em breve')">Desativar</button></td>
      </tr>
    `;
  }
}

function trocarAba(aba) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('ativa'));
  document.querySelectorAll('.painel').forEach(p => p.classList.remove('ativo'));
  event.target.classList.add('ativa');
  document.getElementById('painel-' + aba).classList.add('ativo');
}

window.criarUsuario = criarUsuario;
window.buscarUsuario = buscarUsuario;
window.resetarSenha = resetarSenha;
window.desativarUsuario = desativarUsuario;
window.trocarAba = trocarAba;

