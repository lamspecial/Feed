// صفحة الاستبيان — منطق الصفحة
import { db } from "./firebase-init.js";
import { escapeHtml } from "./utils.js";
import {
  collection, addDoc, doc, getDoc,
  query, orderBy, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const empId = params.get('emp');
const card = document.getElementById('card');

let step = 0;
let employee = null;
let questions = [];

const logoImg = `<img src="logo.svg" alt="شعار الاستبيان">`;

init();

async function init() {
  if (!empId) { renderError('الرابط غير صالح.'); return; }
  try {
    const empSnap = await getDoc(doc(db, 'employees', empId));
    if (!empSnap.exists()) { renderError('لم يتم العثور على بيانات الموظفة.'); return; }
    employee = empSnap.data();

    const qSnap = await getDocs(query(collection(db, 'questions'), orderBy('order', 'asc')));
    questions = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (questions.length === 0) { renderError('لا يوجد أسئلة متاحة حاليًا في الاستبيان.'); return; }

    renderStep();
  } catch (e) {
    renderError('حدث خطأ أثناء تحميل الاستبيان.');
  }
}

function renderError(msg) {
  card.innerHTML = `<div class="center-state"><div class="icon">⚠️</div><h2>تعذر فتح الاستبيان</h2><p>${escapeHtml(msg)}</p></div>`;
}

function renderStep() {
  if (step >= questions.length) { renderDone(); return; }

  const q = questions[step];
  const pct = Math.round((step / questions.length) * 100);

  // الحقل يظهر فارغًا دائمًا عند فتح كل سؤال، ولا تتم تعبئته بإجابات سابقة
  card.innerHTML = `
    <div style="text-align:center;margin-bottom:20px">${logoImg}</div>
    <div class="top-row">
      <span class="emp-name">استبيان الموظفين</span>
    </div>
    <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    <div class="question">${escapeHtml(q.text)}</div>
    <textarea id="answerBox" placeholder="اكتبي إجابتك هنا..."></textarea>
    <div class="saved-hint" id="savedHint"></div>
    <div class="btn-row">
      <button class="btn btn-ghost" id="backBtn" ${step === 0 ? 'disabled' : ''}>السابق</button>
      <button class="btn btn-primary" id="nextBtn">${step === questions.length - 1 ? 'إنهاء الاستبيان' : 'استمرار'}</button>
    </div>
  `;

  document.getElementById('backBtn').addEventListener('click', () => {
    step = Math.max(0, step - 1);
    renderStep();
  });

  document.getElementById('nextBtn').addEventListener('click', async () => {
    const btn = document.getElementById('nextBtn');
    const text = document.getElementById('answerBox').value.trim();
    if (!text) { alert('يرجى كتابة إجابة قبل الاستمرار.'); return; }
    btn.disabled = true;
    btn.textContent = 'جاري الحفظ...';
    try {
      // كل إجابة جديدة تُضاف كسجل مستقل، ولا تستبدل الإجابات السابقة في لوحة المدير
      await addDoc(collection(db, 'responses'), {
        employeeId: empId,
        questionId: q.id,
        questionText: q.text,
        answerText: text,
        tags: [],
        createdAt: serverTimestamp()
      });
      step += 1;
      renderStep();
    } catch (e) {
      alert('حدث خطأ أثناء الحفظ، حاولي مرة أخرى.');
      btn.disabled = false;
      btn.textContent = step === questions.length - 1 ? 'إنهاء الاستبيان' : 'استمرار';
    }
  });
}

function renderDone() {
  card.innerHTML = `
    <div class="center-state">
      <div class="icon">${logoImg}</div>
      <h2>شكرًا لكِ</h2>
      <p>تم إرسال إجاباتك بنجاح. رأيك يساهم في تحسين بيئة العمل.</p>
    </div>`;
}
