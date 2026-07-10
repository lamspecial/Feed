// صفحة التحليلات — منطق الصفحة
import { db } from "./firebase-init.js";
import { escapeHtml } from "./utils.js";
import { collection, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

let employees = [];
let tags = [];
let responses = [];
let selectedTagId = null;

onSnapshot(collection(db, 'employees'), snap => {
  employees = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  recompute();
});
onSnapshot(query(collection(db, 'tags'), orderBy('createdAt', 'asc')), snap => {
  tags = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  recompute();
});
onSnapshot(collection(db, 'responses'), snap => {
  responses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  recompute();
});

function recompute() {
  document.getElementById('totalEmployees').textContent = employees.length;
  document.getElementById('totalResponses').textContent = responses.length;

  const tagById = Object.fromEntries(tags.map(t => [t.id, t]));
  const empById = Object.fromEntries(employees.map(e => [e.id, e]));

  renderTopTag(tagById);
  renderBranchBars(tagById, empById);
  renderTagFilterButtons();
  renderComments(tagById, empById);
}

function renderTopTag(tagById) {
  const overallCounts = {};
  responses.forEach(r => {
    (r.tags || []).forEach(tid => { overallCounts[tid] = (overallCounts[tid] || 0) + 1; });
  });
  const topTagId = Object.keys(overallCounts).sort((a, b) => overallCounts[b] - overallCounts[a])[0];
  const topTagEl = document.getElementById('topTagOverall');
  if (topTagId && tagById[topTagId]) {
    topTagEl.innerHTML = `${escapeHtml(tagById[topTagId].name)} <small>(${overallCounts[topTagId]})</small>`;
  } else {
    topTagEl.textContent = 'لا يوجد بعد';
  }
}

function renderBranchBars(tagById, empById) {
  const branchCounts = {};
  responses.forEach(r => {
    const emp = empById[r.employeeId];
    if (!emp) return;
    branchCounts[emp.branch] = branchCounts[emp.branch] || {};
    (r.tags || []).forEach(tid => {
      branchCounts[emp.branch][tid] = (branchCounts[emp.branch][tid] || 0) + 1;
    });
  });

  const wrap = document.getElementById('branchesWrap');
  const branchNames = Object.keys(branchCounts).sort();
  if (branchNames.length === 0) {
    wrap.innerHTML = '<div class="empty-hint">لا توجد بيانات كافية بعد.</div>';
    return;
  }

  wrap.innerHTML = branchNames.map(branch => {
    const counts = branchCounts[branch];
    const entries = Object.keys(counts)
      .map(tid => ({ tid, count: counts[tid], tag: tagById[tid] }))
      .filter(e => e.tag)
      .sort((a, b) => b.count - a.count);
    const max = entries.length ? entries[0].count : 1;
    const barsHtml = entries.length ? entries.map(e => `
      <div class="bar-row">
        <div class="top"><span class="tag-name">${escapeHtml(e.tag.name)}</span><span>${e.count}</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${(e.count / max) * 100}%;background:${e.tag.color}"></div></div>
      </div>
    `).join('') : '<div class="empty-hint">لا توجد أوسمة مضافة على ردود هذا الفرع بعد.</div>';
    return `<div><div class="branch-name">${escapeHtml(branch)}</div>${barsHtml}</div>`;
  }).join('');
}

/* ==================== أزرار الأوسمة والتعليقات المرتبطة ==================== */

function renderTagFilterButtons() {
  const row = document.getElementById('tagFilterRow');
  if (tags.length === 0) {
    row.innerHTML = '<div class="empty-hint">لا يوجد أوسمة بعد.</div>';
    return;
  }
  row.innerHTML = tags.map(t => {
    const active = t.id === selectedTagId;
    const count = responses.filter(r => (r.tags || []).includes(t.id)).length;
    return `<button class="tag-filter-btn ${active ? 'active' : ''}" style="${active ? `background:${t.color};` : ''}" data-tag-btn="${t.id}">
      <span class="dot" style="background:${t.color}"></span> ${escapeHtml(t.name)} (${count})
    </button>`;
  }).join('');

  row.querySelectorAll('[data-tag-btn]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tid = btn.dataset.tagBtn;
      selectedTagId = selectedTagId === tid ? null : tid;
      const tagById = Object.fromEntries(tags.map(t => [t.id, t]));
      const empById = Object.fromEntries(employees.map(e => [e.id, e]));
      renderTagFilterButtons();
      renderComments(tagById, empById);
    });
  });
}

function renderComments(tagById, empById) {
  const wrap = document.getElementById('commentsWrap');

  if (!selectedTagId) {
    wrap.innerHTML = '<div class="empty-hint">اختر وسمًا أعلاه لعرض التعليقات المرتبطة به مع اسم الموظفة والفرع.</div>';
    return;
  }

  const tag = tagById[selectedTagId];
  const matching = responses
    .filter(r => (r.tags || []).includes(selectedTagId))
    .slice()
    .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));

  if (matching.length === 0) {
    wrap.innerHTML = `<div class="empty-hint">لا توجد تعليقات موسومة بـ «${escapeHtml(tag ? tag.name : '')}» بعد.</div>`;
    return;
  }

  wrap.innerHTML = matching.map(r => {
    const emp = empById[r.employeeId];
    const empName = emp ? emp.name : 'موظفة غير معروفة';
    const branch = emp ? emp.branch : '—';
    const time = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString('ar-SA') : '';
    return `<div class="comment-card">
      <div class="comment-head">
        <span class="comment-emp">${escapeHtml(empName)}</span>
        <span class="comment-branch">${escapeHtml(branch)}</span>
      </div>
      <div class="comment-question">${escapeHtml(r.questionText || '')}</div>
      <div class="comment-text">${escapeHtml(r.answerText || '')}</div>
      <div class="comment-time">${time}</div>
    </div>`;
  }).join('');
}
