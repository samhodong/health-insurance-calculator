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
// 상태 변수
// ======================================

let currentSize = 1;
let currentRatio = 100;
let currentType = 'employee';
let currentDualRatio = 0.4; // 배우자 소득 비율 기본값 40%

// ======================================
// UI 초기화
// ======================================

function initMedianList() {
  const ul = document.getElementById('median-list');
  ul.innerHTML = Object.entries(MEDIAN_INCOME_2026).map(([size, income]) => `
    <li>
      <span class="info-label">${size}인 가구</span>
      <span class="info-value">${won(income)}</span>
    </li>
  `).join('');
}

function initSizeBtns() {
  document.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSize = parseInt(btn.dataset.size);
      updateSliderDisplay();
      if (currentType === 'dual') updateDualVisual();
    });
  });
}

function initTypeCards() {
  document.querySelectorAll('.type-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.type-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      currentType = card.querySelector('input').value;

      // 맞벌이 패널 토글
      const panel = document.getElementById('dual-panel');
      if (currentType === 'dual') {
        panel.style.display = 'block';
        updateDualVisual();
      } else {
        panel.style.display = 'none';
      }
    });
  });

  document.querySelectorAll('input[name="insurer-type"]').forEach(radio => {
    radio.addEventListener('change', () => {
      currentType = radio.value;
    });
  });
}

function initSlider() {
  const slider = document.getElementById('income-ratio');
  slider.addEventListener('input', () => {
    currentRatio = parseInt(slider.value);
    updateSliderDisplay();
    updateSliderTrack();
    if (currentType === 'dual') updateDualVisual();
  });
  updateSliderDisplay();
  updateSliderTrack();
}

function updateSliderTrack() {
  const slider = document.getElementById('income-ratio');
  const min = parseInt(slider.min);
  const max = parseInt(slider.max);
  const pct = ((currentRatio - min) / (max - min)) * 100;
  slider.style.setProperty('--pct', pct + '%');
}

function updateSliderDisplay() {
  const income = getMonthlyIncome(currentSize, currentRatio);
  document.getElementById('ratio-display').textContent = currentRatio + '%';
  document.getElementById('income-amount').textContent = '≈ ' + won(income) + '/월';
}

// ======================================
// 맞벌이 슬라이더
// ======================================

function initDualSlider() {
  const slider = document.getElementById('dual-ratio-slider');
  slider.addEventListener('input', () => {
    currentDualRatio = parseInt(slider.value) / 100;
    updateDualSliderTrack();
    updateDualVisual();
  });
  updateDualSliderTrack();
  updateDualVisual();
}

function updateDualSliderTrack() {
  const slider = document.getElementById('dual-ratio-slider');
  const min = parseInt(slider.min);
  const max = parseInt(slider.max);
  const pct = ((currentDualRatio * 100 - min) / (max - min)) * 100;
  slider.style.setProperty('--pct', pct + '%');
}

function updateDualVisual() {
  const income = getMonthlyIncome(currentSize, currentRatio);
  const ratioA = Math.round((1 - currentDualRatio) * 100);
  const ratioB = Math.round(currentDualRatio * 100);
  const incomeA = Math.round(income * (1 - currentDualRatio));
  const incomeB = Math.round(income * currentDualRatio);

  document.getElementById('dual-ratio-a').textContent = ratioA + '%';
  document.getElementById('dual-ratio-b').textContent = ratioB + '%';
  document.getElementById('dual-amount-a').textContent = won(incomeA);
  document.getElementById('dual-amount-b').textContent = won(incomeB);

  const barA = document.getElementById('dual-bar-a');
  barA.style.width = ratioA + '%';
}

// ======================================
// 계산 실행
// ======================================

function calculate() {
  const resultSection = document.getElementById('result-section');
  resultSection.style.display = 'flex';
  resultSection.style.flexDirection = 'column';
  resultSection.style.gap = '20px';

  resultSection.style.animation = 'none';
  void resultSection.offsetWidth;
  resultSection.style.animation = 'fade-in-up 0.5s ease both';

  const income = getMonthlyIncome(currentSize, currentRatio);

  const typeNames = {
    employee: '직장가입자',
    local: '지역가입자',
    mixed: '혼합가입자',
    dual: '맞벌이 부부',
  };
  document.getElementById('result-type-badge').textContent = typeNames[currentType];

  if (currentType === 'dual') {
    const ratioB = Math.round(currentDualRatio * 100);
    const ratioA = 100 - ratioB;
    document.getElementById('result-summary-info').innerHTML =
      `<strong>${currentSize}인 가구</strong> · 기준 중위소득 <strong>${currentRatio}%</strong> · 세대 월 소득 <strong>${won(income)}</strong>
       <br><span style="font-size:12px; margin-top:4px; display:inline-block;">
       👤 본인 ${ratioA}% (${won(Math.round(income * (1 - currentDualRatio)))}) &nbsp;
       👤 배우자 ${ratioB}% (${won(Math.round(income * currentDualRatio))})</span>`;
  } else {
    document.getElementById('result-summary-info').innerHTML =
      `<strong>${currentSize}인 가구</strong> · 기준 중위소득 <strong>${currentRatio}%</strong> · 월 소득 <strong>${won(income)}</strong>`;
  }

  if (currentType === 'employee') renderEmployee(income);
  else if (currentType === 'local') renderLocal(income);
  else if (currentType === 'mixed') renderMixed(income);
  else renderDual(income);

  renderFullTable();

  setTimeout(() => {
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

// ======================================
// 렌더링 함수들
// ======================================

function renderEmployee(income) {
  const p = calcEmployeePremium(income);

  document.getElementById('result-cards').innerHTML = `
    <div class="result-card">
      <div class="result-card-label">근로자 건강보험료</div>
      <div class="result-card-amount blue">${won(p.employeeHealth)}</div>
      <div class="result-card-sub">보수월액 × 3.595%</div>
    </div>
    <div class="result-card">
      <div class="result-card-label">근로자 장기요양</div>
      <div class="result-card-amount purple">${won(p.employeeLtc)}</div>
      <div class="result-card-sub">건강보험료 × 13.14% / 2</div>
    </div>
    <div class="result-card">
      <div class="result-card-label">근로자 월 총 부담</div>
      <div class="result-card-amount teal">${won(p.employeeTotal)}</div>
      <div class="result-card-sub">건강 + 장기요양</div>
    </div>
    <div class="result-card">
      <div class="result-card-label">사업주 부담(참고)</div>
      <div class="result-card-amount amber">${won(p.employerTotal)}</div>
      <div class="result-card-sub">사업주 동일 부담</div>
    </div>
  `;

  document.getElementById('detail-section').innerHTML = `
    <div class="detail-title">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
      보험료 계산 상세 내역
    </div>
    <div class="detail-row"><span class="detail-key">보수월액(중위소득 ${currentRatio}%)</span><span class="detail-val">${won(income)}</span></div>
    <div class="detail-row"><span class="detail-key">건강보험료 합계 (×7.19%)</span><span class="detail-val">${won(p.totalHealth)}</span></div>
    <div class="detail-row"><span class="detail-key">근로자 건강보험료 (×3.595%)</span><span class="detail-val accent">${won(p.employeeHealth)}</span></div>
    <div class="detail-row"><span class="detail-key">사업주 건강보험료 (×3.595%)</span><span class="detail-val">${won(p.employerHealth)}</span></div>
    <div class="detail-row"><span class="detail-key">근로자 장기요양보험료 (건강의 13.14%/2)</span><span class="detail-val accent">${won(p.employeeLtc)}</span></div>
    <div class="detail-row"><span class="detail-key">사업주 장기요양보험료</span><span class="detail-val">${won(p.employerLtc)}</span></div>
    <div class="detail-row"><span class="detail-key">★ 근로자 월 총 납부</span><span class="detail-val total">${won(p.employeeTotal)}</span></div>
    <div class="detail-row"><span class="detail-key">전체(근로자+사업주) 합산</span><span class="detail-val">${won(p.totalAll)}</span></div>
  `;
}

function renderLocal(income) {
  const p = calcLocalPremiumDetail(income);

  document.getElementById('result-cards').innerHTML = `
    <div class="result-card">
      <div class="result-card-label">소득 부과점수</div>
      <div class="result-card-amount blue">${p.incomeScore.toFixed(2)}점</div>
      <div class="result-card-sub">점수당 211.5원</div>
    </div>
    <div class="result-card">
      <div class="result-card-label">건강보험료</div>
      <div class="result-card-amount teal">${won(p.health)}</div>
      <div class="result-card-sub">하한 ${won(LOCAL_MIN_PREMIUM)}</div>
    </div>
    <div class="result-card">
      <div class="result-card-label">장기요양보험료</div>
      <div class="result-card-amount purple">${won(p.ltc)}</div>
      <div class="result-card-sub">건강보험료 × 13.14%</div>
    </div>
    <div class="result-card">
      <div class="result-card-label">월 총 납부</div>
      <div class="result-card-amount green">${won(p.total)}</div>
      <div class="result-card-sub">건강 + 장기요양</div>
    </div>
  `;

  document.getElementById('detail-section').innerHTML = `
    <div class="detail-title">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
      보험료 계산 상세 내역 (소득 기준 추정)
    </div>
    <div class="detail-row"><span class="detail-key">월 소득(중위소득 ${currentRatio}%)</span><span class="detail-val">${won(income)}</span></div>
    <div class="detail-row"><span class="detail-key">연 소득 환산</span><span class="detail-val">${won(income * 12)}</span></div>
    <div class="detail-row"><span class="detail-key">소득 부과점수</span><span class="detail-val accent">${p.incomeScore.toFixed(4)}점</span></div>
    <div class="detail-row"><span class="detail-key">건강보험료 (점수 × 211.5원)</span><span class="detail-val accent">${won(p.health)}</span></div>
    <div class="detail-row"><span class="detail-key">장기요양보험료 (건강 × 13.14%)</span><span class="detail-val accent">${won(p.ltc)}</span></div>
    <div class="detail-row"><span class="detail-key">★ 월 총 납부액</span><span class="detail-val total">${won(p.total)}</span></div>
    <div class="detail-row"><span class="detail-key">⚠ 재산·자동차 보험료 제외</span><span class="detail-val" style="color:#fbbf24; font-size:12px;">실제는 더 높을 수 있음</span></div>
  `;
}

function renderMixed(income) {
  const p = calcMixedPremium(income);

  document.getElementById('result-cards').innerHTML = `
    <div class="result-card">
      <div class="result-card-label">직장가입자 부담</div>
      <div class="result-card-amount blue">${won(p.totalEmployee)}</div>
      <div class="result-card-sub">건강+장기요양(본인)</div>
    </div>
    <div class="result-card">
      <div class="result-card-label">지역가입자 부담</div>
      <div class="result-card-amount purple">${won(p.totalLocal)}</div>
      <div class="result-card-sub">소득의 40% 기준 추정</div>
    </div>
    <div class="result-card">
      <div class="result-card-label">세대 합산 납부</div>
      <div class="result-card-amount rose">${won(p.grandTotal)}</div>
      <div class="result-card-sub">직장+지역 합산</div>
    </div>
  `;

  document.getElementById('detail-section').innerHTML = `
    <div class="detail-title">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
      혼합 가입자 상세 내역 (직장가입자 + 지역가입자 혼합 세대)
    </div>
    <div class="detail-row"><span class="detail-key">세대 기준 소득 (중위소득 ${currentRatio}%)</span><span class="detail-val">${won(income)}</span></div>
    <div class="detail-row section-a">
      <span class="detail-key" style="padding-left:8px">[ 직장가입자 ]</span><span class="detail-val"></span>
    </div>
    <div class="detail-row"><span class="detail-key">┣ 보수월액</span><span class="detail-val">${won(income)}</span></div>
    <div class="detail-row"><span class="detail-key">┣ 건강보험료(본인)</span><span class="detail-val accent">${won(p.employee.employeeHealth)}</span></div>
    <div class="detail-row"><span class="detail-key">┣ 장기요양(본인)</span><span class="detail-val accent">${won(p.employee.employeeLtc)}</span></div>
    <div class="detail-row"><span class="detail-key">┗ 소계</span><span class="detail-val">${won(p.totalEmployee)}</span></div>
    <div class="detail-row section-b">
      <span class="detail-key" style="padding-left:8px">[ 지역가입자 (소득의 40% 추정) ]</span><span class="detail-val"></span>
    </div>
    <div class="detail-row"><span class="detail-key">┣ 추정 지역 소득</span><span class="detail-val">${won(Math.round(income * 0.4))}</span></div>
    <div class="detail-row"><span class="detail-key">┣ 건강보험료</span><span class="detail-val accent">${won(p.local.health)}</span></div>
    <div class="detail-row"><span class="detail-key">┣ 장기요양</span><span class="detail-val accent">${won(p.local.ltc)}</span></div>
    <div class="detail-row"><span class="detail-key">┗ 소계</span><span class="detail-val">${won(p.totalLocal)}</span></div>
    <div class="detail-row"><span class="detail-key">★ 세대 월 총 납부</span><span class="detail-val total">${won(p.grandTotal)}</span></div>
  `;
}

function renderDual(income) {
  const p = calcDualPremium(income, currentDualRatio);
  const ratioA = Math.round((1 - currentDualRatio) * 100);
  const ratioB = Math.round(currentDualRatio * 100);

  document.getElementById('result-cards').innerHTML = `
    <div class="result-card">
      <div class="result-card-label">👤 본인 (소득 ${ratioA}%)</div>
      <div class="result-card-amount dual-a">${won(p.totalA)}</div>
      <div class="result-card-sub">건강+장기요양 합</div>
    </div>
    <div class="result-card">
      <div class="result-card-label">👤 배우자 (소득 ${ratioB}%)</div>
      <div class="result-card-amount dual-b">${won(p.totalB)}</div>
      <div class="result-card-sub">건강+장기요양 합</div>
    </div>
    <div class="result-card">
      <div class="result-card-label">💑 부부 합산 납부</div>
      <div class="result-card-amount dual-total">${won(p.grandTotal)}</div>
      <div class="result-card-sub">본인+배우자 합</div>
    </div>
    <div class="result-card">
      <div class="result-card-label">🏢 회사 부담 합계(참고)</div>
      <div class="result-card-amount amber">${won(p.employerA + p.employerB)}</div>
      <div class="result-card-sub">두 회사 사업주 합산</div>
    </div>
  `;

  document.getElementById('detail-section').innerHTML = `
    <div class="detail-title">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
      맞벌이 부부 상세 내역 (두 분 모두 직장가입자)
    </div>
    <div class="detail-row"><span class="detail-key">세대 기준 소득 (중위소득 ${currentRatio}%)</span><span class="detail-val">${won(income)}</span></div>
    <div class="detail-row section-a">
      <span class="detail-key" style="padding-left:8px">[ 👤 본인 — 소득 ${ratioA}% ]</span>
      <span class="detail-val" style="color:#60a5fa">${won(p.incomeA)}/월</span>
    </div>
    <div class="detail-row"><span class="detail-key">┣ 건강보험료(본인 부담)</span><span class="detail-val" style="color:#60a5fa">${won(p.a.employeeHealth)}</span></div>
    <div class="detail-row"><span class="detail-key">┣ 장기요양(본인 부담)</span><span class="detail-val" style="color:#60a5fa">${won(p.a.employeeLtc)}</span></div>
    <div class="detail-row"><span class="detail-key">┣ 사업주 부담(참고)</span><span class="detail-val">${won(p.employerA)}</span></div>
    <div class="detail-row"><span class="detail-key">┗ 본인 납부 소계</span><span class="detail-val">${won(p.totalA)}</span></div>
    <div class="detail-row section-b">
      <span class="detail-key" style="padding-left:8px">[ 👤 배우자 — 소득 ${ratioB}% ]</span>
      <span class="detail-val" style="color:#c084fc">${won(p.incomeB)}/월</span>
    </div>
    <div class="detail-row"><span class="detail-key">┣ 건강보험료(본인 부담)</span><span class="detail-val" style="color:#c084fc">${won(p.b.employeeHealth)}</span></div>
    <div class="detail-row"><span class="detail-key">┣ 장기요양(본인 부담)</span><span class="detail-val" style="color:#c084fc">${won(p.b.employeeLtc)}</span></div>
    <div class="detail-row"><span class="detail-key">┣ 사업주 부담(참고)</span><span class="detail-val">${won(p.employerB)}</span></div>
    <div class="detail-row"><span class="detail-key">┗ 배우자 납부 소계</span><span class="detail-val">${won(p.totalB)}</span></div>
    <div class="detail-row"><span class="detail-key">★ 부부 월 합산 납부</span><span class="detail-val total">${won(p.grandTotal)}</span></div>
  `;
}

// ======================================
// 전체 구간 테이블
// ======================================

function renderFullTable() {
  const ratios = getRatios();

  let headerCols = '<th>중위소득</th><th>월 소득</th>';
  if (currentType === 'employee') {
    headerCols += '<th>건강(본인)</th><th>장기요양(본인)</th><th>총 본인부담</th><th>사업주부담</th>';
  } else if (currentType === 'local') {
    headerCols += '<th>건강보험료</th><th>장기요양</th><th>월 납부 합계</th>';
  } else if (currentType === 'mixed') {
    headerCols += '<th>직장(본인)</th><th>지역가입자</th><th>세대 합산</th>';
  } else {
    const rA = Math.round((1 - currentDualRatio) * 100);
    const rB = Math.round(currentDualRatio * 100);
    headerCols += `<th>본인(${rA}%)</th><th>배우자(${rB}%)</th><th>부부 합산</th>`;
  }
  document.getElementById('table-header').innerHTML = headerCols;

  let bodyHtml = '';
  ratios.forEach(ratio => {
    const income = getMonthlyIncome(currentSize, ratio);
    const isCurrent = ratio === currentRatio;
    const rowClass = isCurrent ? 'current-row' : '';

    let cols = `<td>${ratio}%</td><td>${won(income)}</td>`;

    if (currentType === 'employee') {
      const p = calcEmployeePremium(income);
      cols += `<td>${won(p.employeeHealth)}</td><td>${won(p.employeeLtc)}</td><td>${won(p.employeeTotal)}</td><td>${won(p.employerTotal)}</td>`;
    } else if (currentType === 'local') {
      const p = calcLocalPremiumDetail(income);
      cols += `<td>${won(p.health)}</td><td>${won(p.ltc)}</td><td>${won(p.total)}</td>`;
    } else if (currentType === 'mixed') {
      const p = calcMixedPremium(income);
      cols += `<td>${won(p.totalEmployee)}</td><td>${won(p.totalLocal)}</td><td>${won(p.grandTotal)}</td>`;
    } else {
      const p = calcDualPremium(income, currentDualRatio);
      cols += `<td>${won(p.totalA)}</td><td>${won(p.totalB)}</td><td>${won(p.grandTotal)}</td>`;
    }

    bodyHtml += `<tr class="${rowClass}">${cols}</tr>`;
  });
  document.getElementById('table-body').innerHTML = bodyHtml;
}

// ======================================
// 앱 초기화
// ======================================

document.addEventListener('DOMContentLoaded', () => {
  initMedianList();
  initSizeBtns();
  initTypeCards();
  initSlider();
  initDualSlider();
});
