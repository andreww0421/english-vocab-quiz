// 全域變數
let currentMode = ''; 
let currentRange = 'U5'; // 預設選擇 U5
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

// 初始化：檢查 LocalStorage 並顯示打勾
window.onload = function() {
    updateCheckmarks();
    // 預設選中 U5 (已在 HTML class 設定，但這裡確保邏輯同步)
    selectRange('U5', document.querySelector('.range-card.selected'));
};

function selectRange(range, element) {
    currentRange = range;
    // UI 更新
    document.querySelectorAll('.range-card').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');
}

function updateCheckmarks() {
    const ranges = ['U5', 'U6', 'ALL'];
    ranges.forEach(r => {
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
    currentMode = mode;
    score = 0;
    currentIndex = 0;
    userAnswers = [];
    combo = 0;
    maxCombo = 0;
    isProcessing = false;
    
    if (typeof vocabData === 'undefined' || vocabData.length === 0) {
        alert("錯誤：讀取不到單字資料，請檢查 vocab.js");
        return;
    }

    // 1. 根據範圍過濾單字
    let filteredData = [];
    if (currentRange === 'ALL') {
        filteredData = [...vocabData];
    } else {
        filteredData = vocabData.filter(item => item.unit === currentRange);
    }

    // 2. 隨機打亂
    filteredData.sort(() => 0.5 - Math.random());

    // 3. 只取前 20 題 (如果單字少於 20 則全取)
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

        // 產生選項：1個正確 + 3個錯誤 (錯誤選項也要從目前的範圍池子裡挑，或者全域挑皆可，這裡從全域挑比較難)
        // 為了增加難度，我們從全域 vocabData 挑錯誤選項，以免範圍太小選項太好猜
        let options = [currentQ];
        while (options.length < 4) {
            const randomItem = vocabData[Math.floor(Math.random() * vocabData.length)];
            // 避免重複且 id 不同
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
    let rangeTitle = "";
    if (currentRange === 'ALL') rangeTitle = "全範圍";
    else rangeTitle = currentRange;
    document.getElementById('final-score-title').textContent = `${rangeTitle} 測驗結果`;

    document.getElementById('score-text').textContent = `得分：${percentage}% (${score} / ${questionList.length})`;
    document.getElementById('max-combo-text').textContent = `🔥 最高連擊 (Max Combo): ${maxCombo}`;

    const msgDiv = document.getElementById('pass-fail-msg');
    
    // 通過標準：80%
    if (percentage >= 80) {
        msgDiv.innerHTML = '<span class="result-pass">恭喜通過！ (Pass)</span>';
        // 儲存通過紀錄到 LocalStorage
        localStorage.setItem('pass_' + currentRange, 'true');
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
