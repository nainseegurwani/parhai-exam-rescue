const form = document.getElementById('plannerForm');
const generateButton = document.getElementById('generateButton');
const formError = document.getElementById('formError');
const emptyState = document.getElementById('emptyState');
const resultPanel = document.getElementById('resultPanel');
const historyButton = document.getElementById('historyButton');
const historyDrawer = document.getElementById('historyDrawer');
const historyList = document.getElementById('historyList');
const historyCount = document.getElementById('historyCount');
const drawerOverlay = document.getElementById('drawerOverlay');
const closeHistory = document.getElementById('closeHistory');
const copyButton = document.getElementById('copyButton');
const downloadButton = document.getElementById('downloadButton');

const STORAGE_KEY = 'parhai_plans_v1';
let currentRecord = null;

function getPlans() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function savePlans(plans) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plans.slice(0, 8)));
  updateHistoryCount();
}

function updateHistoryCount() {
  historyCount.textContent = getPlans().length;
}

function setLoading(loading) {
  generateButton.disabled = loading;
  generateButton.classList.toggle('loading', loading);
  generateButton.querySelector('.button-label').textContent = loading
    ? 'Building your plan...'
    : 'Generate my rescue plan';
}

function readFormData() {
  return {
    examName: document.getElementById('examName').value.trim(),
    availableHours: Number(document.getElementById('availableHours').value),
    topics: document.getElementById('topics').value.trim(),
    weakTopics: document.getElementById('weakTopics').value.trim(),
    confidence: Number(document.getElementById('confidence').value),
    intensity: document.getElementById('intensity').value,
    language: document.getElementById('language').value,
  };
}

function validateInput(input) {
  if (!input.examName || !input.topics) return 'Please enter the exam name and topics.';
  if (!Number.isFinite(input.availableHours) || input.availableHours < 1 || input.availableHours > 24) {
    return 'Available hours must be between 1 and 24.';
  }
  if (input.topics.length < 8) return 'Please add a little more detail about your topics.';
  return '';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  formError.textContent = '';
  const input = readFormData();
  const validationError = validateInput(input);
  if (validationError) {
    formError.textContent = validationError;
    return;
  }

  setLoading(true);
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'The AI service could not create a plan.');

    const record = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      createdAt: new Date().toISOString(),
      input,
      plan: payload.plan,
      completed: [],
    };

    const plans = getPlans();
    savePlans([record, ...plans]);
    renderPlan(record);
    resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    formError.textContent = `${error.message} Check the API key in Vercel environment variables.`;
  } finally {
    setLoading(false);
  }
});

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderPlan(record) {
  currentRecord = record;
  emptyState.classList.add('hidden');
  resultPanel.classList.remove('hidden');

  const { plan, input } = record;
  document.getElementById('resultTitle').textContent = plan.title || `${input.examName} Rescue Plan`;
  document.getElementById('resultSummary').textContent = plan.summary || 'A focused plan based on your time and weak areas.';
  document.getElementById('motivation').textContent = plan.motivation || 'Focus on the next small step—not the whole syllabus at once.';

  const priorities = safeArray(plan.priorities);
  document.getElementById('priorityList').innerHTML = priorities.map((item, index) => `
    <div class="priority-item">
      <span class="priority-rank">${index + 1}</span>
      <div>
        <strong>${escapeHtml(item.topic)}</strong>
        <small>${escapeHtml(item.reason)}</small>
      </div>
      <span class="priority-badge">${escapeHtml(item.level || 'Important')}</span>
    </div>
  `).join('') || '<p>No priorities returned.</p>';

  const timeline = safeArray(plan.timeline);
  document.getElementById('timelineList').innerHTML = timeline.map((item, index) => {
    const checked = safeArray(record.completed).includes(index);
    return `
      <label class="timeline-item ${checked ? 'completed' : ''}">
        <input class="timeline-check" type="checkbox" data-index="${index}" ${checked ? 'checked' : ''} />
        <span class="timeline-duration">${escapeHtml(item.duration)}</span>
        <span>
          <h4>${escapeHtml(item.task)}</h4>
          <p>${escapeHtml(item.method)}</p>
        </span>
      </label>
    `;
  }).join('') || '<p>No timeline returned.</p>';

  document.querySelectorAll('.timeline-check').forEach((checkbox) => {
    checkbox.addEventListener('change', handleProgressChange);
  });

  const quiz = safeArray(plan.quiz);
  document.getElementById('quizList').innerHTML = quiz.map((item, index) => `
    <article class="quiz-item">
      <button class="quiz-question" type="button">
        <span>Q${index + 1}. ${escapeHtml(item.question)}</span>
        <span>Show</span>
      </button>
      <div class="quiz-answer"><strong>Answer:</strong> ${escapeHtml(item.answer)}</div>
    </article>
  `).join('') || '<p>No quiz returned.</p>';

  document.querySelectorAll('.quiz-question').forEach((button) => {
    button.addEventListener('click', () => {
      const item = button.closest('.quiz-item');
      item.classList.toggle('open');
      button.lastElementChild.textContent = item.classList.contains('open') ? 'Hide' : 'Show';
    });
  });

  document.getElementById('checklist').innerHTML = safeArray(plan.checklist)
    .map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  document.getElementById('tipsList').innerHTML = safeArray(plan.tips)
    .map((item) => `<li>${escapeHtml(item)}</li>`).join('');

  updateProgress();
}

function handleProgressChange(event) {
  if (!currentRecord) return;
  const index = Number(event.target.dataset.index);
  const completed = new Set(safeArray(currentRecord.completed));
  if (event.target.checked) completed.add(index);
  else completed.delete(index);
  currentRecord.completed = [...completed].sort((a, b) => a - b);

  const plans = getPlans().map((plan) => plan.id === currentRecord.id ? currentRecord : plan);
  savePlans(plans);
  event.target.closest('.timeline-item').classList.toggle('completed', event.target.checked);
  updateProgress();
}

function updateProgress() {
  const total = safeArray(currentRecord?.plan?.timeline).length;
  const done = safeArray(currentRecord?.completed).length;
  const percentage = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('progressText').textContent = `${percentage}% complete`;
  document.getElementById('progressBar').style.width = `${percentage}%`;
}

function planToText(record) {
  const { plan, input } = record;
  const lines = [
    plan.title || `${input.examName} Rescue Plan`,
    '='.repeat(48),
    plan.summary || '',
    '',
    'PRIORITY TOPICS',
    ...safeArray(plan.priorities).map((item, i) => `${i + 1}. ${item.topic} — ${item.reason}`),
    '',
    'STUDY TIMELINE',
    ...safeArray(plan.timeline).map((item, i) => `${i + 1}. [${item.duration}] ${item.task}: ${item.method}`),
    '',
    'QUICK QUIZ',
    ...safeArray(plan.quiz).flatMap((item, i) => [`Q${i + 1}. ${item.question}`, `Answer: ${item.answer}`, '']),
    'FINAL CHECKLIST',
    ...safeArray(plan.checklist).map((item) => `- ${item}`),
    '',
    'RESCUE TIPS',
    ...safeArray(plan.tips).map((item) => `- ${item}`),
    '',
    plan.motivation || '',
    '',
    'Generated by ParhAI — Exam Rescue Planner',
  ];
  return lines.join('\n');
}

copyButton.addEventListener('click', async () => {
  if (!currentRecord) return;
  await navigator.clipboard.writeText(planToText(currentRecord));
  copyButton.textContent = 'Copied!';
  setTimeout(() => { copyButton.textContent = 'Copy'; }, 1300);
});

downloadButton.addEventListener('click', () => {
  if (!currentRecord) return;
  const blob = new Blob([planToText(currentRecord)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${currentRecord.input.examName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-study-plan.txt`;
  link.click();
  URL.revokeObjectURL(url);
});

function openDrawer() {
  renderHistory();
  historyDrawer.classList.add('open');
  historyDrawer.setAttribute('aria-hidden', 'false');
  drawerOverlay.classList.remove('hidden');
}

function closeDrawer() {
  historyDrawer.classList.remove('open');
  historyDrawer.setAttribute('aria-hidden', 'true');
  drawerOverlay.classList.add('hidden');
}

historyButton.addEventListener('click', openDrawer);
closeHistory.addEventListener('click', closeDrawer);
drawerOverlay.addEventListener('click', closeDrawer);

function renderHistory() {
  const plans = getPlans();
  if (!plans.length) {
    historyList.innerHTML = '<p class="history-empty">No saved plans yet. Generate your first plan.</p>';
    return;
  }

  historyList.innerHTML = plans.map((record) => `
    <article class="history-card">
      <h3>${escapeHtml(record.input.examName)}</h3>
      <p>${new Date(record.createdAt).toLocaleString()} · ${record.input.availableHours} hours</p>
      <div class="history-card-actions">
        <button type="button" data-action="open" data-id="${record.id}">Open</button>
        <button type="button" class="delete-button" data-action="delete" data-id="${record.id}">Delete</button>
      </div>
    </article>
  `).join('');

  historyList.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      const { action, id } = button.dataset;
      if (action === 'open') {
        const record = getPlans().find((item) => item.id === id);
        if (record) {
          renderPlan(record);
          closeDrawer();
          resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
      if (action === 'delete') {
        savePlans(getPlans().filter((item) => item.id !== id));
        if (currentRecord?.id === id) {
          currentRecord = null;
          resultPanel.classList.add('hidden');
          emptyState.classList.remove('hidden');
        }
        renderHistory();
      }
    });
  });
}

updateHistoryCount();
