// ---------------------------------------------------------------------------
// Interfaz. Todo el HUD es HTML/CSS por encima del canvas, que es más barato
// y más accesible que dibujar texto dentro de la escena 3D.
// Este módulo solo toca el DOM; no sabe nada de three.js.
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

export function createUI(stops, handlers = {}) {
  const el = {
    loading: $('loading'),
    loadingBar: $('loading-bar-fill'),
    loadingLabel: $('loading-label'),
    start: $('start'),
    startBtn: $('start-btn'),
    hud: $('hud'),
    objective: $('objective'),
    objectiveSub: $('objective-sub'),
    distance: $('distance'),
    compass: $('compass'),
    compassArrow: $('compass-arrow'),
    progress: $('progress'),
    timer: $('timer'),
    slots: $('slots'),
    toast: $('toast'),
    bug: $('bug-alert'),
    quiz: $('quiz'),
    quizNpc: $('quiz-npc'),
    quizHouse: $('quiz-house'),
    quizGreeting: $('quiz-greeting'),
    quizText: $('quiz-text'),
    quizOptions: $('quiz-options'),
    quizResult: $('quiz-result'),
    quizExplain: $('quiz-explain'),
    quizFragment: $('quiz-fragment'),
    quizReward: $('quiz-reward'),
    quizBtn: $('quiz-btn'),
    final: $('final'),
    finalEncoded: $('final-encoded'),
    finalTime: $('final-time'),
    finalStats: $('final-stats'),
    finalList: $('final-list'),
    copyBtn: $('copy-btn'),
    restartBtn: $('restart-btn'),
    fxState: $('fx-state'),
  };

  // --- casilleros de la clave ---------------------------------------------
  const slotEls = stops.map((stop, i) => {
    const d = document.createElement('div');
    d.className = 'slot';
    d.innerHTML = `<span class="slot-i">${i + 1}</span><span class="slot-v">?</span>`;
    d.title = stop.name;
    el.slots.appendChild(d);
    return d;
  });

  let toastTimer = 0;
  let bugTimer = 0;
  let onQuizContinue = null;

  el.startBtn.addEventListener('click', () => handlers.onStart?.());
  el.restartBtn.addEventListener('click', () => location.reload());
  el.quizBtn.addEventListener('click', () => onQuizContinue?.());
  window.addEventListener('keydown', (e) => {
    if (!el.quiz.classList.contains('show')) return;
    if (!el.quizBtn.classList.contains('show')) return;
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      onQuizContinue?.();
    }
  });

  el.copyBtn.addEventListener('click', async () => {
    const text = el.finalEncoded.textContent;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Sin permiso de portapapeles (o sin HTTPS): copia por selección.
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    el.copyBtn.textContent = 'Copiada';
    setTimeout(() => (el.copyBtn.textContent = 'Copiar cadena'), 1800);
  });

  const api = {
    // --- carga -------------------------------------------------------------
    setLoading(fraction, label) {
      el.loadingBar.style.width = `${Math.round(fraction * 100)}%`;
      if (label) el.loadingLabel.textContent = label;
    },
    hideLoading() {
      el.loading.classList.remove('show');
    },
    showStart() {
      el.start.classList.add('show');
    },
    hideStart() {
      el.start.classList.remove('show');
      el.hud.classList.add('show');
    },

    // --- HUD ---------------------------------------------------------------
    setObjective(text, sub = '', color = null) {
      el.objective.textContent = text;
      el.objectiveSub.textContent = sub;
      el.objective.style.color = color || '';
    },
    setDistance(meters) {
      el.distance.textContent = meters == null ? '' : `${Math.round(meters)} m`;
    },
    setCompass(angleRad, visible = true) {
      el.compass.style.opacity = visible ? '1' : '0';
      if (visible) el.compassArrow.style.transform = `rotate(${angleRad}rad)`;
    },
    setProgress(done, total) {
      el.progress.textContent = `${done}/${total} entregas`;
    },
    setTimer(seconds) {
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      el.timer.textContent = `${m}:${String(s).padStart(2, '0')}`;
    },
    fillSlot(index, fragment) {
      const d = slotEls[index];
      d.classList.add('filled');
      d.querySelector('.slot-v').textContent = fragment;
    },
    toast(message, ms = 2200) {
      el.toast.textContent = message;
      el.toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.toast.classList.remove('show'), ms);
    },
    setFxState(enabled) {
      el.fxState.textContent = enabled ? 'efectos: on' : 'efectos: off';
    },

    // --- aviso del bug ------------------------------------------------------
    // Aparece en la esquina, no detiene el juego y se va a los 3 segundos.
    bugAlert() {
      el.bug.classList.add('show');
      clearTimeout(bugTimer);
      bugTimer = setTimeout(() => el.bug.classList.remove('show'), 3000);
    },

    // --- pregunta del NPC ---------------------------------------------------
    showQuestion(stop, { onAnswer, onContinue }) {
      const q = stop.question;
      const accent = hex(stop.beaconColor || stop.roofColor);

      el.quizNpc.textContent = stop.npcName;
      el.quizNpc.style.color = accent;
      el.quizHouse.textContent = stop.name;
      el.quizGreeting.textContent = stop.greeting;
      el.quizText.textContent = q.text;

      el.quizResult.textContent = '';
      el.quizResult.className = 'quiz-result';
      el.quizReward.classList.remove('show');
      el.quizBtn.classList.remove('show');
      el.quizExplain.textContent = '';
      el.quizOptions.innerHTML = '';

      let solved = false;

      q.options.forEach((text, i) => {
        const b = document.createElement('button');
        b.className = 'option';
        b.innerHTML = `<span class="option-k">${'ABCD'[i]}</span><span>${text}</span>`;
        b.addEventListener('click', () => {
          if (solved || b.disabled) return;
          if (onAnswer(i)) {
            solved = true;
            b.classList.add('right');
            // Al acertar se bloquean todas y se revela la recompensa.
            [...el.quizOptions.children].forEach((o) => (o.disabled = true));
            el.quizResult.textContent = 'Correcto';
            el.quizResult.className = 'quiz-result ok';
            el.quizExplain.textContent = q.explain;
            el.quizFragment.textContent = stop.fragment;
            el.quizFragment.style.color = accent;
            el.quizReward.classList.add('show');
            el.quizBtn.classList.add('show');
          } else {
            b.classList.add('wrong');
            b.disabled = true;
            el.quizResult.textContent =
              'Esa no es. Piénsalo otra vez y elige de nuevo.';
            el.quizResult.className = 'quiz-result bad';
          }
        });
        el.quizOptions.appendChild(b);
      });

      onQuizContinue = () => {
        el.quiz.classList.remove('show');
        onQuizContinue = null;
        onContinue();
      };

      el.quiz.classList.add('show');
    },

    // --- pantalla final ----------------------------------------------------
    // Solo se muestra la cadena codificada. Decodificarla es parte del
    // desafío, así que la clave en claro no aparece ni se calcula aquí.
    showFinal(encoded, seconds, stats = {}) {
      el.finalEncoded.textContent = encoded;
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      el.finalTime.textContent = `${m} min ${String(s).padStart(2, '0')} s`;
      el.finalStats.textContent =
        `${stats.stolen || 0} paquete(s) robados por el bug · ` +
        `${stats.wrong || 0} respuesta(s) erradas`;
      el.finalList.innerHTML = stops
        .map(
          (st) => `<li>
            <code>${st.fragment}</code>
            <strong>${st.principle}</strong>
            <span>${st.name} · ${st.npcName}</span>
          </li>`
        )
        .join('');
      el.final.classList.add('show');
      el.hud.classList.remove('show');
    },
  };

  return api;
}
