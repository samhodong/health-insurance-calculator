/**
 * 2026년 건강보험료 계산기 - 핵심 로직
 * =====================================
 * 기준: 2026년 보건복지부 고시
 *
 * [직장가입자]
 *   건강보험료 = 보수월액 × 7.19%
 *   근로자 부담 = 건강보험료 × 50% (3.595%)
 *   장기요양보험료 = 건강보험료(근로자분) × 13.14%
 *   → 총 본인 부담 = 건강보험료(본인) + 장기요양(본인)
 *
 * [지역가입자]
 *   부과점수 = 소득점수 + 재산점수(재산 미포함 → 소득점수만)
 *   건강보험료 = 소득점수 × 점수당 금액(211.5원) [하한 20,160원]
 *   장기요양보험료 = 건강보험료 × 13.14%
 *   → 총 납부 = 건강보험료 + 장기요양보험료
 *
 * [혼합가입자] = 직장(근로자분) + 지역(피부양자 제외 별도 세대)
 *   실무적으로: 직장가입자 기준 적용 + 지역 세대 추가 → 합산 표시
 *
 * [맞벌이 부부] = 부부 모두 직장가입자
 *   - 각자 본인 소득에서 독립적으로 건강보험료 납부
 *   - 피부양자 관계 없음 (각자 별도 가입자)
 *   - 슬라이더로 배우자 소득 비율 조절 (30~70%)
 */

// ======================================
// 2026년 기준 데이터
// ======================================

/** 2026년 기준 중위소득 (단위: 원/월) */
const MEDIAN_INCOME_2026 = {
  1: 2_564_238,
  2: 4_199_292,
  3: 5_359_036,
  4: 6_494_738,
  5: 7_556_719,
  6: 8_555_952,
};

/** 2026년 건강보험료율 */
const HEALTH_RATE = 0.0719;         // 7.19%
const EMPLOYEE_SHARE = 0.5;         // 근로자 50%
const LTC_RATE = 0.1314;            // 장기요양 13.14% (건강보험료 대비)

/** 지역가입자 점수당 금액 */
const SCORE_UNIT = 211.5;           // 원/점
const LOCAL_MIN_PREMIUM = 20_160;   // 지역 보험료 하한액

// ======================================
// 계산 함수들
// ======================================

/**
 * 지역가입자 소득점수 계산
 * - 연소득 336만원 이하: 최저 점수로 하한선만 적용
 * - 연소득 336만원 초과: 기본점수 + 초과소득 1만원당 0.28351점 추가
 */
function calcLocalIncomeScore(annualIncome) {
  const BASE_INCOME = 3_360_000;
  const BASE_SCORE = 95.25911708;
  const SCORE_PER_10K = 2835.0928 / 10000;

  if (annualIncome <= BASE_INCOME) {
    return BASE_SCORE;
  }
  const excessIncome = annualIncome - BASE_INCOME;
  return BASE_SCORE + (excessIncome / 10_000) * SCORE_PER_10K;
}

/**
 * 지역가입자 월 건강보험료 계산 (소득만 반영)
 */
function calcLocalPremium(monthlyIncome) {
  const annualIncome = monthlyIncome * 12;
  const score = calcLocalIncomeScore(annualIncome);
  const rawPremium = Math.round(score * SCORE_UNIT);
  return Math.max(rawPremium, LOCAL_MIN_PREMIUM);
}

/**
 * 직장가입자 건강보험료 계산
 */
function calcEmployeePremium(monthlyIncome) {
  const totalHealth = Math.round(monthlyIncome * HEALTH_RATE);
  const employeeHealth = Math.round(totalHealth * EMPLOYEE_SHARE);
  const employeeLtc = Math.round(employeeHealth * LTC_RATE);
  const employerHealth = totalHealth - employeeHealth;
  const employerLtc = Math.round(employerHealth * LTC_RATE);

  return {
    totalHealth,
    employeeHealth,
    employeeLtc,
    employerHealth,
    employerLtc,
    employeeTotal: employeeHealth + employeeLtc,
    employerTotal: employerHealth + employerLtc,
    totalAll: totalHealth + Math.round(totalHealth * LTC_RATE),
  };
}

/**
 * 지역가입자 건강보험료 계산 (상세)
 */
function calcLocalPremiumDetail(monthlyIncome) {
  const health = calcLocalPremium(monthlyIncome);
  const ltc = Math.round(health * LTC_RATE);
  return {
    health,
    ltc,
    total: health + ltc,
    incomeScore: calcLocalIncomeScore(monthlyIncome * 12),
  };
}

/**
 * 혼합가입자 = 직장가입자(본인) + 지역가입자(배우자, 소득 40% 추정)
 */
function calcMixedPremium(monthlyIncome) {
  const employee = calcEmployeePremium(monthlyIncome);
  const localIncome = monthlyIncome * 0.4;
  const local = calcLocalPremiumDetail(localIncome);

  return {
    employee,
    local,
    totalEmployee: employee.employeeTotal,
    totalLocal: local.total,
    grandTotal: employee.employeeTotal + local.total,
  };
}

/**
 * 맞벌이 부부 건강보험료 계산
 * - 두 분 모두 직장가입자
 * - spouseRatio: 배우자 소득 비율 (0.3 ~ 0.7)
 * - 본인 소득 = totalIncome × (1 - spouseRatio)
 * - 배우자 소득 = totalIncome × spouseRatio
 */
function calcDualPremium(totalIncome, spouseRatio) {
  const incomeA = Math.round(totalIncome * (1 - spouseRatio)); // 본인
  const incomeB = Math.round(totalIncome * spouseRatio);       // 배우자
  const a = calcEmployeePremium(incomeA);
  const b = calcEmployeePremium(incomeB);

  return {
    incomeA,
    incomeB,
    a,
    b,
    totalA: a.employeeTotal,
    totalB: b.employeeTotal,
    grandTotal: a.employeeTotal + b.employeeTotal,
    employerA: a.employerTotal,
    employerB: b.employerTotal,
  };
}

// ======================================
// 소득 구간 생성 (40% ~ 200%, 10% 단위)
// ======================================

function getRatios() {
  const ratios = [];
  for (let r = 40; r <= 200; r += 10) ratios.push(r);
  return ratios;
}

function getMonthlyIncome(householdSize, ratio) {
  const base = MEDIAN_INCOME_2026[householdSize];
  return Math.round(base * (ratio / 100));
}

// ======================================
// 표시 유틸
// ======================================

function won(amount) {
  return amount.toLocaleString('ko-KR') + '원';
}

// ======================================
// 상태
// ======================================

const state = {
  size: 1,
  ratio: 100,
  type: 'employee',
  spouse: 0.4, // 배우자 소득 비율 기본값 40%
};

const TYPE_NAMES = {
  employee: '직장가입자',
  local: '지역가입자',
  mixed: '혼합가입자',
  dual: '맞벌이 부부',
};

const $ = (id) => document.getElementById(id);

// ======================================
// 유형별 결과 모델
//  - total: 대표 금액, segments: 구성 막대(2개)
//  - tiles: 지표 카드, rows: 상세 내역
//  - columns/cells: 구간표
// ======================================

function buildResult(income) {
  if (state.type === 'employee') {
    const p = calcEmployeePremium(income);
    return {
      totalLabel: '근로자 월 본인 부담',
      total: p.employeeTotal,
      segments: [
        { label: '건강보험료', value: p.employeeHealth },
        { label: '장기요양보험료', value: p.employeeLtc },
      ],
      tiles: [
        { label: '근로자 건강보험료', value: won(p.employeeHealth), sub: '보수월액 × 3.595%' },
        { label: '근로자 장기요양', value: won(p.employeeLtc), sub: '본인 건강보험료 × 13.14%' },
        { label: '사업주 부담 (참고)', value: won(p.employerTotal), sub: '사업주 동일 부담', muted: true },
        { label: '전체 합산 (참고)', value: won(p.totalAll), sub: '근로자 + 사업주', muted: true },
      ],
      detailTitle: '보험료 계산 상세 내역',
      rows: [
        { k: `보수월액 (중위소득 ${state.ratio}%)`, v: won(income) },
        { k: '건강보험료 합계 (× 7.19%)', v: won(p.totalHealth) },
        { k: '근로자 건강보험료 (× 3.595%)', v: won(p.employeeHealth), cls: 'accent' },
        { k: '사업주 건강보험료 (× 3.595%)', v: won(p.employerHealth) },
        { k: '근로자 장기요양보험료 (본인 건강보험료의 13.14%)', v: won(p.employeeLtc), cls: 'accent' },
        { k: '사업주 장기요양보험료', v: won(p.employerLtc) },
        { k: '근로자 월 총 납부', v: won(p.employeeTotal), cls: 'total' },
        { k: '전체 (근로자 + 사업주) 합산', v: won(p.totalAll) },
      ],
    };
  }

  if (state.type === 'local') {
    const p = calcLocalPremiumDetail(income);
    return {
      totalLabel: '월 납부액 (소득 기준 추정)',
      total: p.total,
      segments: [
        { label: '건강보험료', value: p.health },
        { label: '장기요양보험료', value: p.ltc },
      ],
      tiles: [
        { label: '소득 부과점수', value: p.incomeScore.toFixed(2) + '점', sub: '점수당 211.5원' },
        { label: '건강보험료', value: won(p.health), sub: '하한 ' + won(LOCAL_MIN_PREMIUM) },
        { label: '장기요양보험료', value: won(p.ltc), sub: '건강보험료 × 13.14%' },
      ],
      detailTitle: '보험료 계산 상세 내역 (소득 기준 추정)',
      rows: [
        { k: `월 소득 (중위소득 ${state.ratio}%)`, v: won(income) },
        { k: '연 소득 환산', v: won(income * 12) },
        { k: '소득 부과점수', v: p.incomeScore.toFixed(4) + '점', cls: 'accent' },
        { k: '건강보험료 (점수 × 211.5원)', v: won(p.health), cls: 'accent' },
        { k: '장기요양보험료 (건강보험료 × 13.14%)', v: won(p.ltc), cls: 'accent' },
        { k: '월 총 납부액', v: won(p.total), cls: 'total' },
        { k: '재산·자동차 보험료 제외', v: '실제는 더 높을 수 있음', cls: 'note' },
      ],
    };
  }

  if (state.type === 'mixed') {
    const p = calcMixedPremium(income);
    return {
      totalLabel: '세대 월 합산 납부',
      total: p.grandTotal,
      segments: [
        { label: '직장가입자', value: p.totalEmployee },
        { label: '지역가입자', value: p.totalLocal },
      ],
      tiles: [
        { label: '직장가입자 부담', value: won(p.totalEmployee), sub: '건강 + 장기요양 (본인)' },
        { label: '지역가입자 부담', value: won(p.totalLocal), sub: '소득의 40% 기준 추정' },
      ],
      detailTitle: '혼합가입자 상세 내역 (직장 + 지역 혼합 세대)',
      rows: [
        { k: `세대 기준 소득 (중위소득 ${state.ratio}%)`, v: won(income) },
        { k: '직장가입자', v: '', cls: 'group', dot: 'a' },
        { k: '보수월액', v: won(income), cls: 'indent' },
        { k: '건강보험료 (본인)', v: won(p.employee.employeeHealth), cls: 'indent accent' },
        { k: '장기요양 (본인)', v: won(p.employee.employeeLtc), cls: 'indent accent' },
        { k: '소계', v: won(p.totalEmployee), cls: 'indent' },
        { k: '지역가입자 (소득의 40% 추정)', v: '', cls: 'group', dot: 'b' },
        { k: '추정 지역 소득', v: won(Math.round(income * 0.4)), cls: 'indent' },
        { k: '건강보험료', v: won(p.local.health), cls: 'indent accent' },
        { k: '장기요양', v: won(p.local.ltc), cls: 'indent accent' },
        { k: '소계', v: won(p.totalLocal), cls: 'indent' },
        { k: '세대 월 총 납부', v: won(p.grandTotal), cls: 'total' },
      ],
    };
  }

  // 맞벌이 부부
  const p = calcDualPremium(income, state.spouse);
  const ratioB = Math.round(state.spouse * 100);
  const ratioA = 100 - ratioB;
  return {
    totalLabel: '부부 월 합산 납부',
    total: p.grandTotal,
    segments: [
      { label: `본인 (${ratioA}%)`, value: p.totalA },
      { label: `배우자 (${ratioB}%)`, value: p.totalB },
    ],
    tiles: [
      { label: `본인 (소득 ${ratioA}%)`, value: won(p.totalA), sub: '건강 + 장기요양' },
      { label: `배우자 (소득 ${ratioB}%)`, value: won(p.totalB), sub: '건강 + 장기요양' },
      { label: '회사 부담 합계 (참고)', value: won(p.employerA + p.employerB), sub: '두 회사 사업주 합산', muted: true },
    ],
    detailTitle: '맞벌이 부부 상세 내역 (두 분 모두 직장가입자)',
    rows: [
      { k: `세대 기준 소득 (중위소득 ${state.ratio}%)`, v: won(income) },
      { k: `본인 · 소득 ${ratioA}%`, v: won(p.incomeA) + '/월', cls: 'group', dot: 'a' },
      { k: '건강보험료 (본인 부담)', v: won(p.a.employeeHealth), cls: 'indent accent' },
      { k: '장기요양 (본인 부담)', v: won(p.a.employeeLtc), cls: 'indent accent' },
      { k: '사업주 부담 (참고)', v: won(p.employerA), cls: 'indent' },
      { k: '본인 납부 소계', v: won(p.totalA), cls: 'indent' },
      { k: `배우자 · 소득 ${ratioB}%`, v: won(p.incomeB) + '/월', cls: 'group', dot: 'b' },
      { k: '건강보험료 (본인 부담)', v: won(p.b.employeeHealth), cls: 'indent accent' },
      { k: '장기요양 (본인 부담)', v: won(p.b.employeeLtc), cls: 'indent accent' },
      { k: '사업주 부담 (참고)', v: won(p.employerB), cls: 'indent' },
      { k: '배우자 납부 소계', v: won(p.totalB), cls: 'indent' },
      { k: '부부 월 합산 납부', v: won(p.grandTotal), cls: 'total' },
    ],
  };
}

/** 구간표: 유형별 열 제목과 행 값 (strong = 강조할 열 번호) */
function buildTable() {
  if (state.type === 'employee') {
    return {
      columns: ['건강(본인)', '장기요양(본인)', '총 본인부담', '사업주부담'],
      strong: 2,
      cells: (income) => {
        const p = calcEmployeePremium(income);
        return [p.employeeHealth, p.employeeLtc, p.employeeTotal, p.employerTotal];
      },
    };
  }
  if (state.type === 'local') {
    return {
      columns: ['건강보험료', '장기요양', '월 납부 합계'],
      strong: 2,
      cells: (income) => {
        const p = calcLocalPremiumDetail(income);
        return [p.health, p.ltc, p.total];
      },
    };
  }
  if (state.type === 'mixed') {
    return {
      columns: ['직장(본인)', '지역가입자', '세대 합산'],
      strong: 2,
      cells: (income) => {
        const p = calcMixedPremium(income);
        return [p.totalEmployee, p.totalLocal, p.grandTotal];
      },
    };
  }
  const rB = Math.round(state.spouse * 100);
  return {
    columns: [`본인(${100 - rB}%)`, `배우자(${rB}%)`, '부부 합산'],
    strong: 2,
    cells: (income) => {
      const p = calcDualPremium(income, state.spouse);
      return [p.totalA, p.totalB, p.grandTotal];
    },
  };
}

// ======================================
// 렌더링
// ======================================

let shownTotal = 0;
let animFrame = 0;

/** 대표 금액을 부드럽게 바꿔 표시 */
function animateTotal(target) {
  const el = $('total-amount');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  cancelAnimationFrame(animFrame);
  if (reduce || shownTotal === target) {
    shownTotal = target;
    el.textContent = target.toLocaleString('ko-KR');
    return;
  }
  const from = shownTotal;
  const start = performance.now();
  const duration = 320;
  const step = (now) => {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    shownTotal = Math.round(from + (target - from) * eased);
    el.textContent = shownTotal.toLocaleString('ko-KR');
    if (t < 1) animFrame = requestAnimationFrame(step);
  };
  animFrame = requestAnimationFrame(step);
}

function render() {
  const income = getMonthlyIncome(state.size, state.ratio);
  const r = buildResult(income);

  // 입력 영역 표시
  $('ratio-display').textContent = state.ratio + '%';
  $('income-amount').textContent = won(income);
  setSliderFill($('income-ratio'));

  // 요약
  $('total-label').textContent = r.totalLabel;
  $('result-type-badge').textContent = TYPE_NAMES[state.type];
  $('result-summary-info').innerHTML =
    `<strong>${state.size}인 가구</strong> · 기준 중위소득 <strong>${state.ratio}%</strong> · 월 소득 <strong>${won(income)}</strong>`;
  animateTotal(r.total);

  $('breakdown-bar').innerHTML = r.segments
    .map((s, i) => `<i class="seg-${i + 1}" style="flex-grow:${s.value}"></i>`)
    .join('');
  $('breakdown-legend').innerHTML = r.segments
    .map((s, i) => {
      const pct = r.total ? Math.round((s.value / r.total) * 100) : 0;
      return `<li><i class="dot seg-${i + 1}"></i>${s.label} <strong>${won(s.value)}</strong> <small>${pct}%</small></li>`;
    })
    .join('');

  // 지표 카드
  $('result-cards').innerHTML = r.tiles
    .map((t) => `
      <div class="tile${t.muted ? ' muted' : ''}">
        <div class="tile-label">${t.label}</div>
        <div class="tile-value">${t.value}</div>
        <div class="tile-sub">${t.sub}</div>
      </div>`)
    .join('');

  // 상세 내역
  $('detail-title').textContent = r.detailTitle;
  $('detail-section').innerHTML = r.rows
    .map((row) => {
      const dot = row.dot ? `<i class="dot dot-${row.dot}"></i>` : '';
      return `<div class="detail-row ${row.cls || ''}"><dt>${dot}${row.k}</dt><dd>${row.v}</dd></div>`;
    })
    .join('');

  renderTable();
  renderMedianList();

  // 모바일 하단 바
  $('mobile-bar-label').textContent = r.totalLabel;
  $('mobile-bar-amount').textContent = won(r.total);
}

function renderTable() {
  const t = buildTable();
  $('table-header').innerHTML =
    '<th scope="col">중위소득</th><th scope="col">월 소득</th>' +
    t.columns.map((c) => `<th scope="col">${c}</th>`).join('');

  $('table-body').innerHTML = getRatios()
    .map((ratio) => {
      const income = getMonthlyIncome(state.size, ratio);
      const cells = t.cells(income)
        .map((v, i) => `<td${i === t.strong ? ' class="strong"' : ''}>${won(v)}</td>`)
        .join('');
      const current = ratio === state.ratio;
      return `<tr data-ratio="${ratio}"${current ? ' class="current-row" aria-current="true"' : ''}><td>${ratio}%</td><td>${won(income)}</td>${cells}</tr>`;
    })
    .join('');
}

function renderMedianList() {
  $('median-list').innerHTML = Object.entries(MEDIAN_INCOME_2026)
    .map(([size, income]) => `
      <li${Number(size) === state.size ? ' class="current"' : ''}>
        <span>${size}인 가구</span>
        <strong>${won(income)}</strong>
      </li>`)
    .join('');
}

function renderDual() {
  const income = getMonthlyIncome(state.size, state.ratio);
  const ratioB = Math.round(state.spouse * 100);
  const ratioA = 100 - ratioB;
  $('dual-ratio-a').textContent = ratioA + '%';
  $('dual-ratio-b').textContent = ratioB + '%';
  $('dual-amount-a').textContent = won(Math.round(income * (1 - state.spouse)));
  $('dual-amount-b').textContent = won(Math.round(income * state.spouse));
  $('dual-bar-a').style.width = ratioA + '%';
  setSliderFill($('dual-ratio-slider'));
}

/** 슬라이더 채움 비율(--pct) 갱신 */
function setSliderFill(slider) {
  const min = Number(slider.min);
  const max = Number(slider.max);
  const pct = ((Number(slider.value) - min) / (max - min)) * 100;
  slider.style.setProperty('--pct', pct + '%');
}

function update() {
  render();
  if (state.type === 'dual') renderDual();
}

// ======================================
// 이벤트
// ======================================

function initControls() {
  // 가구원 수
  document.querySelectorAll('.size-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.size-btn').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      state.size = parseInt(btn.dataset.size, 10);
      update();
    });
  });

  // 중위소득 비율
  const ratioSlider = $('income-ratio');
  ratioSlider.addEventListener('input', () => {
    state.ratio = parseInt(ratioSlider.value, 10);
    update();
  });

  // 가입자 유형
  document.querySelectorAll('input[name="insurer-type"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      state.type = radio.value;
      $('dual-panel').hidden = state.type !== 'dual';
      update();
    });
  });

  // 맞벌이 소득 분담
  const dualSlider = $('dual-ratio-slider');
  dualSlider.addEventListener('input', () => {
    state.spouse = parseInt(dualSlider.value, 10) / 100;
    update();
  });

  // 구간표 행 선택 → 해당 구간으로 계산
  $('table-body').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-ratio]');
    if (!tr) return;
    state.ratio = parseInt(tr.dataset.ratio, 10);
    ratioSlider.value = state.ratio;
    update();
  });
}

function initTheme() {
  $('theme-btn').addEventListener('click', () => {
    const root = document.documentElement;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const current = root.getAttribute('data-theme') || (systemDark ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) { /* 저장 불가 시 이번 화면에만 적용 */ }
  });

  $('print-btn').addEventListener('click', () => window.print());
}

/** 요약 카드가 화면에 보이면 모바일 하단 바를 숨김 */
function initMobileBar() {
  const bar = $('mobile-bar');
  const summary = document.querySelector('.summary');
  if (!('IntersectionObserver' in window)) return;
  new IntersectionObserver(
    ([entry]) => bar.classList.toggle('is-hidden', entry.isIntersecting),
    { threshold: 0.4 }
  ).observe(summary);
}

document.addEventListener('DOMContentLoaded', () => {
  initControls();
  initTheme();
  initMobileBar();
  update();
});
