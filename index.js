const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const {getAuth} = require("firebase-admin/auth");

initializeApp();
const db = getFirestore();

exports.criarUsuario = onCall(async (request) => {
  // 1. Só o admin pode criar usuários
  if (!request.auth || request.auth.token.email !== 'esperancagaspar505@gmail.com') {
    throw new HttpsError('permission-denied', 'Apenas o administrador pode criar usuários.');
  }

  const {email, password, nome, role} = request.data;

  if (!email || !password || !nome || !role) {
    throw new HttpsError('invalid-argument', 'Faltam dados: email, password, nome, role.');
  }

  try {
    // 2. Cria o usuário no Authentication
    const userRecord = await getAuth().createUser({
      email: email,
      password: password,
      displayName: nome,
    });

    // 3. Salva os dados extras no Firestore
    await db.collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      email: email,
      nome: nome,
      role: role, // ex: 'professor', 'aluno', 'secretaria'
      criadoEm: new Date(),
    });

    return {success: true, uid: userRecord.uid};
  } catch (error) {
    console.error("Erro ao criar usuário:", error);
    throw new HttpsError('internal', error.message);
  }
});
