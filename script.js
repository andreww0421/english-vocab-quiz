// 全域變數
let currentMode = ''; 
// 定義所有單元
const ALL_UNITS = ['U2', 'U3', 'U4', 'U5', 'U6'];
// 預設全選
let selectedUnits = [...ALL_UNITS]; 

let questionList = [];
let currentIndex = 0;
let score = 0;
let userAnswers = [];
let currentQuestionMode = ''; 
let combo = 0;
let maxCombo = 0;
let timerInterval;
let timeLimit = 10;
let timeRemaining = 10;
let isProcessing = false;

// 初始化
window.onload = function() {
    updateCheckmarks();
    updateRangeUI(); // 根據 selectedUnits 更新畫面
};

// 切換單元選擇 (多選邏輯)
function toggleUnit(unit) {
    const index = selectedUnits.indexOf(unit);
    if (index > -1) {
        // 已經選了 -> 取消選擇
        selectedUnits.splice(index, 1);
    } else {
        // 還沒選 -> 加入選擇
        selectedUnits.push(unit);
    }
    updateRangeUI();
}

// 全選/取消全選
function toggleAllUnits() {
    if (selectedUnits.length === ALL_UNITS.length) {
        selectedUnits = []; // 清除
    } else {
        selectedUnits = [...ALL_UNITS]; // 全選
    }
    updateRangeUI();
}

// 更新畫面上的按鈕狀態
function updateRangeUI() {
    // 重置所有按鈕樣式
    ALL_UNITS.forEach(unit => {
        const btn = document.getElementById('btn-' + unit);
        if (selectedUnits.includes(unit)) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });
    
    // 隱藏警告訊息
    document.getElementById('range-warning').style.display = 'none';
}

function updateCheckmarks() {
    ALL_UNITS.forEach(r => {
        if (localStorage.getItem('pass_' + r) === 'true') {
            const check = document.getElementById('check-' + r);
            if(check) check.classList.remove('hidden');
        }
    });
}

function speakText(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
    }
}

function startQuiz(mode) {
    // 檢查是否有選擇至少一個單元
    if (selectedUnits.length === 0) {
        document.getElementById('range-warning').style.display = 'block';
        return;
    }

    currentMode = mode;
    score = 0;
    currentIndex = 0;
    userAnswers = [];
    combo = 0;
    maxCombo = 0;
    isProcessing = false;
    
    if (typeof vocabData === 'undefined' || vocabData.length === 0) {
        alert("錯誤：讀取不到單字資料");
        return;
    }

    // 1. 根據 selectedUnits 陣列過濾單字
    let filteredData = vocabData.filter(item => selectedUnits.includes(item.unit));

    if (filteredData.length === 0) {
        alert("錯誤：所選範圍沒有單字資料！");
        return;
    }

    // 2. 隨機打亂
    filteredData.sort(() => 0.5 - Math.random());

    // 3. 只取前 20 題 (不足則取全部)
    questionList = filteredData.slice(0, 20);

    // 設定時間
    timeLimit = (mode === 'spelling') ? 15 : 10;
    
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('quiz-screen').classList.remove('hidden');
    document.getElementById('timer-container').classList.remove('hidden');
    
    updateProgress();
    renderQuestion();
}

function updateProgress() {
    const percentage = ((currentIndex) / questionList.length) * 100;
    document.getElementById('total-progress').style.width = percentage + '%';
    document.getElementById('current-q').textContent = currentIndex + 1;
    document.getElementById('total-q').textContent = questionList.length;
}

function renderQuestion() {
    isProcessing = false;
    updateProgress();
    resetFeedback();

    const currentQ = questionList[currentIndex];
    const qTextEl = document.getElementById('question-text');
    const optionsEl = document.getElementById('options-container');
    const spellingEl = document.getElementById('spelling-container');

    startTimer();

    if (currentMode === 'spelling') {
        optionsEl.classList.add('hidden');
        spellingEl.classList.remove('hidden');
        qTextEl.textContent = currentQ.zh;
        
        const input = document.getElementById('spelling-input');
        input.value = '';
        input.className = 'spelling-input';
        input.disabled = false;
        input.focus();
        
        input.onkeydown = (e) => { 
            if(e.key === 'Enter' && !isProcessing) submitSpelling(); 
        };

    } else {
        currentQuestionMode = Math.random() < 0.5 ? 'en-zh' : 'zh-en';
        spellingEl.classList.add('hidden');
        optionsEl.classList.remove('hidden');
        
        if (currentQuestionMode === 'en-zh') {
            qTextEl.innerHTML = `
                ${currentQ.en} 
                <button class="audio-btn" onclick="speakText('${currentQ.en.replace(/'/g, "\\'")}')">🔊</button>
                <br><span class="phonetic">${currentQ.ph}</span>
            `;
            speakText(currentQ.en);
        } else {
            qTextEl.textContent = currentQ.zh;
        }

        let options = [currentQ];
        // 錯誤選項從「所有單字」中挑選，增加混淆度，也避免單選一個單元時選項太少
        while (options.length < 4) {
            const randomItem = vocabData[Math.floor(Math.random() * vocabData.length)];
            if (!options.some(o => o.id === randomItem.id)) {
                options.push(randomItem);
            }
        }
        options.sort(() => 0.5 - Math.random());

        optionsEl.innerHTML = '';
        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-option';
            btn.textContent = (currentQuestionMode === 'en-zh') ? opt.zh : opt.en;
            btn.dataset.id = opt.id;
            btn.onclick = () => { if(!isProcessing) checkAnswer(btn, opt.id, currentQ.id); };
            optionsEl.appendChild(btn);
        });
    }
}

function startTimer() {
    clearInterval(timerInterval);
    timeRemaining = timeLimit;
    updateTimerVisuals();

    timerInterval = setInterval(() => {
        timeRemaining -= 0.1;
        updateTimerVisuals();
        if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            handleTimeOut();
        }
    }, 100);
}

function updateTimerVisuals() {
    const percentage = (timeRemaining / timeLimit) * 100;
    document.getElementById('timer-bar').style.width = percentage + '%';
    document.getElementById('timer-text').textContent = Math.ceil(timeRemaining) + 's';
}

function handleTimeOut() {
    if(isProcessing) return;
    showFeedback(false);
    recordAnswer(false);
    setTimeout(nextQuestion, 1500);
}

function checkAnswer(btnElement, selectedId, correctId) {
    clearInterval(timerInterval);
    isProcessing = true;
    const isCorrect = selectedId === correctId;
    
    const allBtns = document.querySelectorAll('.btn-option');
    allBtns.forEach(b => b.disabled = true);

    if (isCorrect) {
        btnElement.classList.add('btn-correct');
        if (currentQuestionMode === 'zh-en') {
            speakText(questionList[currentIndex].en);
        }
    } else {
        btnElement.classList.add('btn-wrong');
        allBtns.forEach(b => {
            if(parseInt(b.dataset.id) === correctId) b.classList.add('btn-correct');
        });
    }

    showFeedback(isCorrect);
    recordAnswer(isCorrect);
    setTimeout(nextQuestion, 1200);
}

function submitSpelling() {
    if(isProcessing) return;
    clearInterval(timerInterval);
    isProcessing = true;

    const input = document.getElementById('spelling-input');
    const inputVal = input.value.trim();
    const correctVal = questionList[currentIndex].en;
    const isCorrect = inputVal.toLowerCase() === correctVal.toLowerCase();

    input.disabled = true;
    if(isCorrect) {
        input.classList.add('correct');
        speakText(correctVal);
    } else {
        input.classList.add('wrong');
        input.value += ` (正確: ${correctVal})`;
    }

    showFeedback(isCorrect);
    recordAnswer(isCorrect);
    setTimeout(nextQuestion, 1500);
}

function showFeedback(isCorrect) {
    const feedbackIcon = document.getElementById('feedback-icon');
    const comboBox = document.getElementById('combo-box');
    
    feedbackIcon.textContent = isCorrect ? '✅' : '❌';
    feedbackIcon.style.color = isCorrect ? 'var(--success)' : 'var(--fail)';
    feedbackIcon.classList.add('feedback-show');

    if (isCorrect) {
        combo++;
        if(combo > maxCombo) maxCombo = combo;
        if (combo >= 2) {
            document.getElementById('combo-count').textContent = combo;
            comboBox.classList.add('combo-active');
        }
    } else {
        combo = 0;
        comboBox.classList.remove('combo-active');
    }
}

function resetFeedback() {
    document.getElementById('feedback-icon').classList.remove('feedback-show');
    if(combo < 2) {
        document.getElementById('combo-box').classList.remove('combo-active');
    }
}

function recordAnswer(isCorrect) {
    if (isCorrect) score++;
    userAnswers.push({
        question: questionList[currentIndex],
        isCorrect: isCorrect
    });
}

function nextQuestion() {
    currentIndex++;
    if (currentIndex < questionList.length) {
        renderQuestion();
    } else {
        finishQuiz();
    }
}

function finishQuiz() {
    resetFeedback();
    document.getElementById('quiz-screen').classList.add('hidden');
    document.getElementById('timer-container').classList.add('hidden');
    document.getElementById('result-screen').classList.remove('hidden');
    document.getElementById('combo-box').classList.remove('combo-active');

    const percentage = Math.round((score / questionList.length) * 100);
    
    // 設定結果標題
    // 如果全選，顯示 "全範圍"，否則顯示 "U2 + U3..." 這樣的字串
    let rangeTitle = selectedUnits.join(" + ");
    if (selectedUnits.length === ALL_UNITS.length) rangeTitle = `全範圍 (${ALL_UNITS[0]}-${ALL_UNITS[ALL_UNITS.length-1]})`;
    
    document.getElementById('final-score-title').textContent = `${rangeTitle} 測驗結果`;

    document.getElementById('score-text').textContent = `得分：${percentage}% (${score} / ${questionList.length})`;
    document.getElementById('max-combo-text').textContent = `🔥 最高連擊 (Max Combo): ${maxCombo}`;

    const msgDiv = document.getElementById('pass-fail-msg');
    
    // 通過標準
    if (percentage >= 80) {
        msgDiv.innerHTML = '<span class="result-pass">恭喜通過！ (Pass)</span>';
        
        // 【重要】只有當使用者「只選擇了一個單元」來考，且通過時，才給予該單元的打勾勾
        if (selectedUnits.length === 1) {
            localStorage.setItem('pass_' + selectedUnits[0], 'true');
        }
    } else {
        msgDiv.innerHTML = '<span class="result-fail">再接再厲！ (Fail)</span>';
    }

    const reviewList = document.getElementById('review-list');
    reviewList.innerHTML = '<h3>答錯題目檢討 (點擊喇叭發音)：</h3>';
    
    const wrongAnswers = userAnswers.filter(a => !a.isCorrect);
    if (wrongAnswers.length === 0) {
        reviewList.innerHTML += '<p style="color:green">完美！全對！</p>';
    } else {
        wrongAnswers.forEach(item => {
            const div = document.createElement('div');
            div.className = 'review-item wrong';
            div.innerHTML = `
                <div>
                    <strong>${item.question.en}</strong> 
                    <br> ${item.question.zh}
                </div>
                <div class="review-audio" onclick="speakText('${item.question.en.replace(/'/g, "\\'")}')">🔊</div>
            `;
            reviewList.appendChild(div);
        });
    }
}
