// 全域變數
let vocabData = []; 
let currentMode = ''; 
let selectedUnits = [];
let ALL_UNITS = [];

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

// 你的 Google Sheet CSV 連結
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQTxd32azbren8Y1VTFYqd_NhzKI7hyVEV2RLYYu8XHGsuipC-SbDgJDGU-6ayIRWZpEmIobLjuKCec/pub?output=csv'; 

window.onload = function() {
    // 檢查 PapaParse 是否載入
    if (typeof Papa === 'undefined') {
        alert("嚴重錯誤：網頁缺少 PapaParse 元件。\n請檢查 index.html 是否有加入 <script src='...papaparse...'> 的程式碼。");
        document.getElementById('loading-text').textContent = "程式庫載入失敗";
        return;
    }

    // 1. 先嘗試讀取快取 (讓使用者不用等)
    const cachedData = localStorage.getItem('cachedVocabData');
    if (cachedData) {
        console.log("使用本機快取資料");
        try {
            const parsedCache = JSON.parse(cachedData);
            if (parsedCache && parsedCache.length > 0) {
                processData(parsedCache);
                document.getElementById('update-status').textContent = "已載入快取資料，正在背景更新...";
            }
        } catch (e) {
            console.error("快取資料損毀", e);
        }
    }

    // 2. 背景讀取最新資料 (Google Sheet)
    loadGoogleSheetData();
};

function loadGoogleSheetData() {
    Papa.parse(SHEET_URL, {
        download: true,
        header: true,
        complete: function(results) {
            // 資料轉換與清洗
            const newData = results.data
                .filter(item => item.en && item.zh) // 去除空行
                .map(item => ({
                    id: parseInt(item.id),
                    unit: item.unit ? item.unit.trim() : "Unknown",
                    en: item.en.trim(),
                    ph: item.ph ? item.ph.trim() : "",
                    zh: item.zh.trim()
                }));

            if (newData.length === 0) {
                console.warn("讀取到的資料為空，可能是權限問題或連結錯誤");
                if (vocabData.length === 0) {
                    document.getElementById('loading-text').textContent = "讀取失敗：資料庫為空";
                    alert("讀取失敗！請確認 Google 試算表已「發布到網路」。");
                }
                return;
            }

            console.log("雲端資料讀取成功，筆數：", newData.length);

            // 更新快取
            localStorage.setItem('cachedVocabData', JSON.stringify(newData));

            // 如果原本沒資料，或資料有變動，重新渲染
            if (vocabData.length === 0 || JSON.stringify(vocabData) !== JSON.stringify(newData)) {
                processData(newData);
                document.getElementById('update-status').textContent = "資料庫已更新至最新版本！";
                // 3秒後隱藏提示
                setTimeout(() => {
                    const statusEl = document.getElementById('update-status');
                    if(statusEl) statusEl.textContent = "";
                }, 3000);
            } else {
                document.getElementById('update-status').textContent = "目前已是最新版本";
            }
        },
        error: function(err) {
            console.error("下載失敗", err);
            if (vocabData.length === 0) {
                document.getElementById('loading-text').textContent = "網路連線失敗";
                alert("無法連線到 Google 試算表，請檢查網路。");
            }
        }
    });
}

// 處理資料並產生介面
function processData(data) {
    vocabData = data;
    
    // 自動抓取所有單元並排序
    const unitSet = new Set(vocabData.map(item => item.unit));
    
    ALL_UNITS = Array.from(unitSet).sort((a, b) => {
        // 排序邏輯：B6U1 排在 U1~U6 後面
        if (a.startsWith('B') && !b.startsWith('B')) return 1;
        if (!a.startsWith('B') && b.startsWith('B')) return -1;
        return a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'});
    });

    // 如果是第一次載入，預設全選
    if (selectedUnits.length === 0) {
        selectedUnits = [...ALL_UNITS];
    } else {
        // 過濾掉已經不存在的單元
        selectedUnits = selectedUnits.filter(u => ALL_UNITS.includes(u));
    }

    generateRangeButtons();
    updateCheckmarks();
    updateRangeUI();
}

function generateRangeButtons() {
    const container = document.getElementById('range-container');
    if (!container) return;
    
    container.innerHTML = ''; // 清空載入中文字

    // 分組顯示：先顯示 U 系列，再顯示 B 系列 (可選)
    ALL_UNITS.forEach(unit => {
        const div = document.createElement('div');
        div.className = 'range-card'; 
        div.id = 'btn-' + unit;
        div.onclick = function() { toggleUnit(unit); };
        
        // 名稱美化
        let displayName = unit;
        if (unit.startsWith('B')) displayName = unit.replace('B', 'Book ').replace('U', ' U');

        div.innerHTML = `
            <span class="range-name">${displayName}</span>
            <span class="check-mark hidden" id="check-${unit}">✅</span>
        `;
        container.appendChild(div);
    });
}

function toggleUnit(unit) {
    const index = selectedUnits.indexOf(unit);
    if (index > -1) {
        selectedUnits.splice(index, 1);
    } else {
        selectedUnits.push(unit);
    }
    updateRangeUI();
}

function toggleAllUnits() {
    if (selectedUnits.length === ALL_UNITS.length) {
        selectedUnits = [];
    } else {
        selectedUnits = [...ALL_UNITS];
    }
    updateRangeUI();
}

function updateRangeUI() {
    ALL_UNITS.forEach(unit => {
        const btn = document.getElementById('btn-' + unit);
        if (btn) {
            if (selectedUnits.includes(unit)) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        }
    });
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
    
    if (vocabData.length === 0) {
        alert("資料庫尚未載入，請稍候...");
        return;
    }

    // 1. 過濾資料
    let filteredData = vocabData.filter(item => selectedUnits.includes(item.unit));

    if (filteredData.length === 0) {
        alert("所選範圍沒有單字資料！");
        return;
    }

    // 2. 隨機打亂
    filteredData.sort(() => 0.5 - Math.random());

    // 3. 取前 20 題
    questionList = filteredData.slice(0, 20);

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
        let safetyCounter = 0;
        while (options.length < 4 && safetyCounter < 100) {
            const randomItem = vocabData[Math.floor(Math.random() * vocabData.length)];
            if (!options.some(o => o.id === randomItem.id)) {
                options.push(randomItem);
            }
            safetyCounter++;
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
    
    let rangeTitle = selectedUnits.join(" + ");
    if (selectedUnits.length === ALL_UNITS.length) rangeTitle = "全範圍";
    
    document.getElementById('final-score-title').textContent = `${rangeTitle} 測驗結果`;
    document.getElementById('score-text').textContent = `得分：${percentage}% (${score} / ${questionList.length})`;
    document.getElementById('max-combo-text').textContent = `🔥 最高連擊 (Max Combo): ${maxCombo}`;

    const msgDiv = document.getElementById('pass-fail-msg');
    
    if (percentage >= 80) {
        msgDiv.innerHTML = '<span class="result-pass">恭喜通過！ (Pass)</span>';
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
