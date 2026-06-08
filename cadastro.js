import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';
import { app } from './firebase-config.js';

const functions = getFunctions(app);
const criarEscola = httpsCallable(functions, 'criarEscola');

const form = document.getElementById('formCadastro');
const btn = document.getElementById('btnCadastro');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  // 1. MAPEIA CAMPOS
  const campos = {
    codigo: document.getElementById('codigoConvite'),
    nomeEscola: document.getElementById('nomeEscola'),
    nomeDiretor: document.getElementById('nomeDiretor'),
    email: document.getElementById('email'),
    senha: document.getElementById('senha')
  };

  // 2. LIMPA ERROS ANTERIORES
  document.querySelectorAll('.erro-campo').forEach(el => el.textContent = '');
  Object.values(campos).forEach(input => input.classList.remove('input-erro'));

  const valores = {
    codigo: campos.codigo.value.trim().toUpperCase(),
    nomeEscola: campos.nomeEscola.value.trim(),
    nomeDiretor: campos.nomeDiretor.value.trim(),
    email: campos.email.value.trim(),
    senha: campos.senha.value
  };

  // 3. VALIDA QUAL CAMPO FALTOU
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

  // 4. CHAMA FUNCTION
  btn.disabled = true;
  btn.textContent = 'Criando escola...';

  try {
    await criarEscola(valores);
    document.getElementById('sucessoMsg').textContent = 'Escola cadastrada! Redirecionando...';
    document.getElementById('sucessoMsg').style.display = 'block';
    setTimeout(() => window.location.href = 'index.html', 2000);
  } catch (err) {
    document.getElementById('erroMsg').textContent = err.message;
    document.getElementById('erroMsg').style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Criar Conta';
  }
});