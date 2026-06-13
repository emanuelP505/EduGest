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
  where
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

// 1. PROTEÇÃO DA PÁGINA ADMIN
let authIniciado = false;

onAuthStateChanged(auth, async (user) => {
  console.log('Auth mudou:', user?.email);

  // Ignora o primeiro null que o Firebase manda
  if (!authIniciado) {
    authIniciado = true;
    if (!user) return;
  }

  if (!user) {
    console.log('Sem usuário, voltando pro login');
    window.location.href = 'index.html';
    return;
  }

  try {
    const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
    
    if (!userDoc.exists()) {
      console.log('Usuário sem documento');
      await signOut(auth);
      window.location.href = 'index.html';
      return;
    }

    const dados = userDoc.data();
    console.log('Perfil:', dados.perfil);

    if (dados.perfil !== 'admin') {
      console.log('Não é admin');
      await signOut(auth);
      window.location.href = 'index.html';
      return;
    }

    // Libera o painel
    document.body.style.display = 'block';
    console.log('Admin confirmado');
    carregarPainelAdmin();

  } catch (err) {
    console.error('Erro ao verificar admin:', err);
    if (err.code !== 'unavailable' && err.code !== 'auth/network-request-failed') {
      await signOut(auth);
      window.location.href = 'index.html';
    }
  }
});

// 2. FUNÇÕES DO PAINEL ADMIN
function carregarPainelAdmin() {
  listarUsuarios();
  listarConvites();
  document.getElementById('btnLogout')?.addEventListener('click', logout);
}

// 2.1 Listar usuários
async function listarUsuarios() {
  const tbody = document.getElementById('tabelaUsuarios');
  if (!tbody) return;
  
  tbody.innerHTML = '<tr><td colspan="4">Carregando...</td></tr>';

  try {
    const q = query(collection(db, 'usuarios'));
    const snap = await getDocs(q);
    
    tbody.innerHTML = '';
    snap.forEach((docSnap) => {
      const u = docSnap.data();
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${u.nome || '-'}</td>
        <td>${u.email}</td>
        <td>${u.perfil}</td>
        <td>${u.ativo ? 'Ativo' : 'Inativo'}</td>
      `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="4">Erro ao carregar usuários</td></tr>';
  }
}

// 2.2 Listar convites
async function listarConvites() {
  const tbody = document.getElementById('tabelaConvites');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="4">Carregando...</td></tr>';

  try {
    const snap = await getDocs(collection(db, 'convites'));
    
    tbody.innerHTML = '';
    snap.forEach((docSnap) => {
      const c = docSnap.data();
      const tr = document.createElement('tr');
      const expira = c.expiraEm?.toDate ? c.expiraEm.toDate().toLocaleDateString() : '-';
      
      tr.innerHTML = `
        <td>${docSnap.id}</td>
        <td>${c.plano || '-'}</td>
        <td>${c.usado ? 'Usado' : 'Disponível'}</td>
        <td>${expira}</td>
      `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="4">Erro ao carregar convites</td></tr>';
  }
}

// 2.3 Criar usuário manual sem deslogar admin
window.criarUsuarioManual = async () => {
  const email = prompt("Email do novo usuário:");
  if (!email) return;
  
  const senha = prompt("Senha (mínimo 6 caracteres):");
  if (!senha || senha.length < 6) return alert("Senha inválida");
  
  const nome = prompt("Nome completo:");
  if (!nome) return;
  
  const perfil = prompt("Perfil: admin, diretor, professor, aluno");
  if (!['admin', 'diretor', 'professor', 'aluno'].includes(perfil)) {
    return alert("Perfil inválido");
  }

  try {
    // Usa app secundário pra não deslogar o admin
    const secondaryApp = initializeApp(auth.app.options, "Secondary");
    const secondaryAuth = getAuth(secondaryApp);

    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, senha);
    const uid = cred.user.uid;

    // Salva no Firestore usando auth principal
    await setDoc(doc(db, 'usuarios', uid), {
      nome: nome,
      email: email,
      perfil: perfil,
      ativo: true,
      criadoEm: serverTimestamp(),
      criadoPor: auth.currentUser.email
    });

    // Limpa app secundário
    await signOut(secondaryAuth);
    await deleteApp(secondaryApp);

    alert('Usuário criado com sucesso!');
    listarUsuarios();

  } catch (err) {
    console.error(err);
    alert('Erro: ' + err.message);
  }
}

// 2.4 Criar código convite
window.criarConvite = async () => {
  const codigo = prompt("Código do convite:").toUpperCase();
  if (!codigo) return;
  
  const plano = prompt("Plano: basico, premium");
  if (!['basico', 'premium'].includes(plano)) return alert("Plano inválido");
  
  const dias = parseInt(prompt("Válido por quantos dias?")) || 30;

  try {
    const expiraEm = new Date();
    expiraEm.setDate(expiraEm.getDate() + dias);

    await setDoc(doc(db, 'convites', codigo), {
      plano: plano,
      usado: false,
      expiraEm: expiraEm,
      criadoEm: serverTimestamp(),
      criadoPor: auth.currentUser.email
    });

    alert('Convite criado!');
    listarConvites();

  } catch (err) {
    console.error(err);
    alert('Erro: ' + err.message);
  }
}

// 2.5 Logout
async function logout() {
  await signOut(auth);
  window.location.href = 'index.html';
                    }
