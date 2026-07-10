// لوحة التحكم — منطق الصفحة
import { db } from "./firebase-init.js";
import { escapeHtml } from "./utils.js";
import {
  collection, addDoc, doc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, serverTimestamp,
  arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const SWATCHES = ["#2f6fed", "#e74c3c", "#f39c12", "#27ae60", "#8e44ad", "#16a085", "#d35400", "#7f8c8d"];
let selectedSwatch = SWATCHES[0];

let employees = [];
let tags = [];
let questions = [];
let branches = [];
let currentEmpId = null;
let currentEmpAnswersUnsub = null;

const branchesWrap = document.getElementById('branchesWrap');
const newBranchSelect = document.getElementById('newBranch');

/* ==================== الموظفات ==================== */

onSnapshot(query(collection(db, 'employees'), orderBy('createdAt', 'asc')), (snap) => {
  employees = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderEmployees();
});

document.getElementById('addEmpBtn').addEventListener('click', async () => {
  const name = document.getElementById('newName').value.trim();
  const branch = newBranchSelect.value;
  const jobTitle = document.getElementById('newTitle').value.trim();
  if (!name || !branch || !jobTitle) { alert('يرجى تعبئة جميع الحقول واختيار الفرع'); return; }
  await addDoc(collection(db, 'employees'), { name, branch, jobTitle, createdAt: serverTimestamp() });
  document.getElementById('newName').value = '';
  document.getElementById('newTitle').value = '';
  newBranchSelect.selectedIndex = 0;
});

function renderEmployees() {
  if (employees.length === 0) {
    branchesWrap.innerHTML = '<div class="empty-hint">لا يوجد موظفات بعد.</div>';
    return;
  }
  const byBranch = {};
  employees.forEach(e => {
    byBranch[e.branch] = byBranch[e.branch] || {};
    byBranch[e.branch][e.jobTitle] = byBranch[e.branch][e.jobTitle] || [];
    byBranch[e.branch][e.jobTitle].push(e);
  });

  branchesWrap.innerHTML = Object.keys(byBranch).sort().map(branchName => {
    const jobs = byBranch[branchName];
    const total = Object.values(jobs).reduce((a, arr) => a + arr.length, 0);
    const jobsHtml = Object.keys(jobs).sort().map(jobTitle => {
      const rows = jobs[jobTitle].map(emp => `
        <div class="emp-row" data-id="${emp.id}">
          <div>
            <div class="emp-name">${escapeHtml(emp.name)}</div>
            <div class="emp-meta">${escapeHtml(jobTitle)}</div>
          </div>
          <div class="emp-actions">
            <span class="badge-count" data-count-for="${emp.id}">…</span>
          </div>
        </div>`).join('');
      return `<div class="job-group"><div class="job-label">${escapeHtml(jobTitle)}</div>${rows}</div>`;
    }).join('');
    return `<div class="branch-block">
      <div class="branch-title">${escapeHtml(branchName)} <span class="count">${total}</span></div>
      ${jobsHtml}
    </div>`;
  }).join('');

  branchesWrap.querySelectorAll('.emp-row').forEach(row => {
    row.addEventListener('click', () => openEmployee(row.dataset.id));
  });

  employees.forEach(emp => {
    onSnapshot(query(collection(db, 'responses'), where('employeeId', '==', emp.id)), (snap) => {
      const el = branchesWrap.querySelector(`[data-count-for="${emp.id}"]`);
      if (el) el.textContent = snap.size + ' رد';
    });
  });
}

/* ==================== الفروع (اختيار من متعدد) ==================== */

onSnapshot(query(collection(db, 'branches'), orderBy('createdAt', 'asc')), (snap) => {
  branches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderBranchSelect();
  renderBranchSettings();
});

function renderBranchSelect() {
  const current = newBranchSelect.value;
  newBranchSelect.innerHTML = '<option value="" disabled selected>اختاري الفرع</option>' +
    branches.map(b => `<option value="${escapeHtml(b.name)}">${escapeHtml(b.name)}</option>`).join('');
  if (branches.some(b => b.name === current)) newBranchSelect.value = current;
}

function renderBranchSettings() {
  const listEl = document.getElementById('branchList');
  listEl.innerHTML = branches.length ? branches.map(b => `
    <div class="list-edit-row">
      <span style="flex:1;font-size:14px;font-weight:600;color:var(--text);">${escapeHtml(b.name)}</span>
      <button class="btn danger small" data-del-branch="${b.id}">حذف</button>
    </div>`).join('') : '<div class="empty-hint">لا يوجد فروع بعد. أضف فرعًا ليظهر عند إضافة موظفة.</div>';

  listEl.querySelectorAll('[data-del-branch]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('حذف هذا الفرع؟ (لن يؤثر على الموظفات الحاليات)')) {
        await deleteDoc(doc(db, 'branches', btn.dataset.delBranch));
      }
    });
  });
}

document.getElementById('addBranchBtn').addEventListener('click', async () => {
  const input = document.getElementById('newBranchName');
  const name = input.value.trim();
  if (!name) return;
  if (branches.some(b => b.name === name)) { alert('هذا الفرع مضاف بالفعل'); return; }
  await addDoc(collection(db, 'branches'), { name, createdAt: serverTimestamp() });
  input.value = '';
});

/* ==================== الأسئلة (قابلة للتعديل والإضافة) ==================== */

onSnapshot(query(collection(db, 'questions'), orderBy('order', 'asc')), (snap) => {
  questions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderQuestionSettings();
  if (currentEmpId) renderAnswersForCurrentEmp();
});

function renderQuestionSettings() {
  const listEl = document.getElementById('questionList');
  listEl.innerHTML = questions.length ? questions.map((q, idx) => `
    <div class="list-edit-row">
      <span class="list-index">${idx + 1}.</span>
      <input value="${escapeHtml(q.text)}" data-edit-question="${q.id}">
      <div class="reorder-btns">
        <button data-move-up="${q.id}" ${idx === 0 ? 'disabled' : ''}>▲</button>
        <button data-move-down="${q.id}" ${idx === questions.length - 1 ? 'disabled' : ''}>▼</button>
      </div>
      <button class="btn danger small" data-del-question="${q.id}">حذف</button>
    </div>`).join('') : '<div class="empty-hint">لا يوجد أسئلة بعد. أضف سؤالًا ليظهر في الاستبيان.</div>';

  listEl.querySelectorAll('[data-edit-question]').forEach(input => {
    input.addEventListener('change', async () => {
      const newText = input.value.trim();
      if (!newText) { input.value = questions.find(q => q.id === input.dataset.editQuestion)?.text || ''; return; }
      await updateDoc(doc(db, 'questions', input.dataset.editQuestion), { text: newText });
    });
  });

  listEl.querySelectorAll('[data-del-question]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('حذف هذا السؤال؟ الردود السابقة عليه ستبقى محفوظة.')) {
        await deleteDoc(doc(db, 'questions', btn.dataset.delQuestion));
      }
    });
  });

  listEl.querySelectorAll('[data-move-up]').forEach(btn => {
    btn.addEventListener('click', () => swapQuestionOrder(btn.dataset.moveUp, -1));
  });
  listEl.querySelectorAll('[data-move-down]').forEach(btn => {
    btn.addEventListener('click', () => swapQuestionOrder(btn.dataset.moveDown, 1));
  });
}

async function swapQuestionOrder(qId, direction) {
  const idx = questions.findIndex(q => q.id === qId);
  const targetIdx = idx + direction;
  if (idx === -1 || targetIdx < 0 || targetIdx >= questions.length) return;
  const a = questions[idx];
  const b = questions[targetIdx];
  await Promise.all([
    updateDoc(doc(db, 'questions', a.id), { order: b.order }),
    updateDoc(doc(db, 'questions', b.id), { order: a.order })
  ]);
}

document.getElementById('addQuestionBtn').addEventListener('click', async () => {
  const input = document.getElementById('newQuestionText');
  const text = input.value.trim();
  if (!text) return;
  const maxOrder = questions.reduce((max, q) => Math.max(max, q.order ?? 0), -1);
  await addDoc(collection(db, 'questions'), { text, order: maxOrder + 1, createdAt: serverTimestamp() });
  input.value = '';
});

/* ==================== الأوسمة ==================== */

onSnapshot(query(collection(db, 'tags'), orderBy('createdAt', 'asc')), (snap) => {
  tags = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderTagSettings();
  if (currentEmpId) renderAnswersForCurrentEmp();
});

function renderTagSettings() {
  const listEl = document.getElementById('tagList');
  listEl.innerHTML = tags.length ? tags.map(t => `
    <div class="tag-edit-row">
      <span class="swatch" style="background:${t.color}"></span>
      <span style="flex:1;font-size:14px;font-weight:600;color:var(--text);">${escapeHtml(t.name)}</span>
      <button class="btn danger small" data-del-tag="${t.id}">حذف</button>
    </div>`).join('') : '<div class="empty-hint">لا يوجد أوسمة بعد.</div>';

  listEl.querySelectorAll('[data-del-tag]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('حذف هذا الوسم؟')) await deleteDoc(doc(db, 'tags', btn.dataset.delTag));
    });
  });
}

const swatchPicker = document.getElementById('swatchPicker');
swatchPicker.innerHTML = SWATCHES.map(c => `<div class="swatch-opt" style="background:${c}" data-c="${c}"></div>`).join('');
function refreshSwatchSel() {
  swatchPicker.querySelectorAll('.swatch-opt').forEach(el => {
    el.classList.toggle('sel', el.dataset.c === selectedSwatch);
  });
}
refreshSwatchSel();
swatchPicker.addEventListener('click', (e) => {
  const opt = e.target.closest('.swatch-opt');
  if (!opt) return;
  selectedSwatch = opt.dataset.c;
  refreshSwatchSel();
});

document.getElementById('addTagBtn').addEventListener('click', async () => {
  const name = document.getElementById('newTagName').value.trim();
  if (!name) return;
  await addDoc(collection(db, 'tags'), { name, color: selectedSwatch, createdAt: serverTimestamp() });
  document.getElementById('newTagName').value = '';
});

/* ==================== نافذة الإعدادات (تبويبات) ==================== */

document.getElementById('openSettings').addEventListener('click', () => document.getElementById('settingsOverlay').classList.add('open'));
document.getElementById('closeSettings').addEventListener('click', () => document.getElementById('settingsOverlay').classList.remove('open'));

document.querySelectorAll('.settings-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.settings-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`pane-${btn.dataset.tab}`).classList.add('active');
  });
});

/* ==================== لوحة الموظفة والردود ==================== */

async function openEmployee(empId) {
  currentEmpId = empId;
  const emp = employees.find(e => e.id === empId);
  if (!emp) return;
  document.getElementById('pName').textContent = emp.name;
  document.getElementById('pMeta').textContent = `${emp.branch} · ${emp.jobTitle}`;
  const link = new URL('survey.html', window.location.href);
  link.searchParams.set('emp', empId);
  document.getElementById('linkInput').value = link.toString();
  document.getElementById('copiedMsg').style.display = 'none';
  document.getElementById('empOverlay').classList.add('open');

  if (currentEmpAnswersUnsub) currentEmpAnswersUnsub();
  currentEmpAnswersUnsub = onSnapshot(
    query(collection(db, 'responses'), where('employeeId', '==', empId)),
    (snap) => {
      window.__currentAnswers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      window.__currentAnswers.sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0));
      renderAnswersForCurrentEmp();
    }
  );
}

function renderAnswersForCurrentEmp() {
  const answers = window.__currentAnswers || [];
  const wrap = document.getElementById('answersWrap');

  if (questions.length === 0) {
    wrap.innerHTML = '<div class="empty-hint">لا يوجد أسئلة معرّفة بعد. أضف أسئلة من الإعدادات.</div>';
    return;
  }

  wrap.innerHTML = questions.map((q) => {
    // الردود الجديدة تُربط بمعرّف السؤال، والردود القديمة (إن وجدت) قد تحمل questionIndex فقط
    const entries = answers.filter(a => a.questionId === q.id);
    const entriesHtml = entries.length ? entries.map(a => {
      const time = a.createdAt?.toDate ? a.createdAt.toDate().toLocaleString('ar-SA') : '';
      const chipHtml = tags.map(t => {
        const active = (a.tags || []).includes(t.id);
        return `<span class="tag-chip ${active ? 'active' : ''}" style="${active ? `background:${t.color};color:#fff;border-color:transparent;` : ''}" data-resp="${a.id}" data-tag="${t.id}">${escapeHtml(t.name)}</span>`;
      }).join('');
      return `<div class="answer-card">
        <div class="answer-text">${escapeHtml(a.answerText || '')}</div>
        <div class="answer-time">${time}</div>
        <div class="tag-row">${chipHtml}</div>
      </div>`;
    }).join('') : '<div class="empty-hint">لا يوجد رد بعد على هذا السؤال.</div>';
    return `<div class="q-block"><div class="q-title">${escapeHtml(q.text)}</div>${entriesHtml}</div>`;
  }).join('');

  wrap.querySelectorAll('.tag-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      const respId = chip.dataset.resp;
      const tagId = chip.dataset.tag;
      const isActive = chip.classList.contains('active');
      await updateDoc(doc(db, 'responses', respId), {
        tags: isActive ? arrayRemove(tagId) : arrayUnion(tagId)
      });
    });
  });
}

document.getElementById('closePanel').addEventListener('click', () => {
  document.getElementById('empOverlay').classList.remove('open');
  currentEmpId = null;
  if (currentEmpAnswersUnsub) { currentEmpAnswersUnsub(); currentEmpAnswersUnsub = null; }
});

document.getElementById('copyLinkBtn').addEventListener('click', async () => {
  const input = document.getElementById('linkInput');
  input.select();
  try {
    await navigator.clipboard.writeText(input.value);
  } catch (e) {
    document.execCommand('copy');
  }
  document.getElementById('copiedMsg').style.display = 'block';
});
