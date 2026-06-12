import { app, auth, db } from './firebase-config.js';
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const form = document.getElementById('formCadastro');
const btn = document.getElementById('btnCadastro');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const campos = {
    codigo: document.getElementById('codigoConvite'),
    nomeEscola: document.getElementById('nomeEscola'),
    nomeDiretor: document.getElementById('nomeDiretor'),
    email: document.getElementById('email'),
    senha: document.getElementById('senha')
  };

  document.querySelectorAll('.erro-campo').forEach(el => el.textContent = '');
  Object.values(campos).forEach(input => input.classList.remove('input-erro'));

  const valores = {
    codigo: campos.codigo.value.trim().toUpperCase(),
    nomeEscola: campos.nomeEscola.value.trim(),
    nomeDiretor: campos.nomeDiretor.value.trim(),
    email: campos.email.value.trim(),
    senha: campos.senha.value
  };

  const erros = [];
  if (!valores.codigo) erros.push({ campo: 'codigo', msg: 'Código obrigatório' });
  if (!valores.nomeEscola) erros.push({ campo: 'nomeEscola', msg: 'Nome da escola obrigatório' });
  if (!valores.nomeDiretor) erros.push({ campo: 'nomeDiretor', msg: 'Nome do diretor obrigatório' });
  if (!valores.email) erros.push({ campo: 'email', msg: 'E-mail obrigatório' });
  else if (!/\S+@\S+\.\S+/.test(valores.email)) erros.push({ campo: 'email', msg: 'E-mail inválido' });
  if (!valores.senha) erros.push({ campo: 'senha', msg: 'Senha obrigatória' });
  else if (valores.senha.length < 6) erros.push({ campo: 'senha', msg: 'Mínimo 6 caracteres' });

  if (erros.length > 0) {
    erros.forEach(erro => {
      campos[erro.campo].classList.add('input-erro');
      document.getElementById(`erro-${erro.campo}`).textContent = erro.msg;
    });
    campos[erros[0].campo].focus();
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Criando escola...';

  try {
    const conviteRef = doc(db, 'convites', valores.codigo);
    const conviteSnap = await getDoc(conviteRef);

    if (!conviteSnap.exists()) throw new Error('Código inválido');
    const convite = conviteSnap.data();
    if (convite.usado) throw new Error('Código já usado');
    if (new Date(convite.expiraEm) < new Date()) throw new Error('Código expirado');

    const cred = await createUserWithEmailAndPassword(auth, valores.email, valores.senha);
    const uid = cred.user.uid;

    await setDoc(doc(db, 'escolas', uid), {
      nome: valores.nomeEscola,
      plano: convite.plano || 'basico',
      ativo: true,
      criadoEm: serverTimestamp(),
      criadoPor: valores.email,
      codigoConvite: valores.codigo
    });

    await setDoc(doc(db, 'usuarios', uid), {
      nome: valores.nomeDiretor,
      email: valores.email,
      perfil: 'diretor',
      escolaId: uid,
      ativo: true,
      criadoEm: serverTimestamp()
    });

    await updateDoc(conviteRef, {
      usado: true,
      usadoPor: uid,
      usadoEm: serverTimestamp()
    });

    document.getElementById('sucessoMsg').textContent = 'Escola cadastrada! Redirecionando...';
    document.getElementById('sucessoMsg').style.display = 'block';
    setTimeout(() => window.location.href = 'index.html', 2000);

  } catch (err) {
    console.error(err);
    document.getElementById('erroMsg').textContent = err.message;
    document.getElementById('erroMsg').style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Criar Conta';
  }
});
