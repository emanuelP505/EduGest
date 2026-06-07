

// theme.js - Controle de tema para GestEdu+
(function() {
  // Aplica tema salvo antes do CSS carregar
  if (localStorage.getItem('gestedu_theme') === 'dark') {
    document.documentElement.classList.add('dark');
  }

  // Espera DOM carregar pra ligar o botão
  document.addEventListener('DOMContentLoaded', function() {
    const modeSwitch = document.querySelector('.mode-switch');
    if (!modeSwitch) return;

    // Ajusta estado do botão
    if (document.documentElement.classList.contains('dark')) {
      modeSwitch.classList.add('active');
    }

    // Liga o toggle
    modeSwitch.onclick = () => {
      document.documentElement.classList.toggle('dark');
      modeSwitch.classList.toggle('active');
      
      const isDark = document.documentElement.classList.contains('dark');
      localStorage.setItem('gestedu_theme', isDark ? 'dark' : 'light');
    };
  });
})();