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

    // 1. 先嘗試讀取快取
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

    // 2. 背景讀取最新資料
    loadGoogleSheetData();
};

function loadGoogleSheetData() {
    Papa.parse(SHEET_URL, {
        download: true,
        header: true,
        complete: function(results) {
            const newData = results.data
                .filter(item => item.en && item.zh)
                .map(item => ({
                    id: parseInt(item.id),
                    unit: item.unit ? item.unit.trim() : "Unknown",
                    en: item.en.trim(),
                    ph: item.ph ? item.ph.trim() : "",
                    zh: item.zh.trim()
                }));

            if (newData.length === 0) {
                if (vocabData.length === 0) {
                    document.getElementById('loading-text').textContent = "讀取失敗：資料庫為空";
                }
                return;
            }

            localStorage.setItem('cachedVocabData', JSON.stringify(newData));

            if (vocabData.length === 0 || JSON.stringify(vocabData) !== JSON.stringify(newData)) {
                processData(newData);
                document.getElementById('update-status').textContent = "資料庫已更新至最新版本！";
                setTimeout(() => document.getElementById('update-status').textContent = "", 3000);
            }
        },
        error: function(err) {
            console.error("下載失敗", err);
            if (vocabData.length === 0) {
                document.getElementById('loading-text').textContent = "網路連線失敗";
            }
        }
    });
}

function processData(data) {
    vocabData = data;
    
    // 取得所有單元
    const unitSet = new Set(vocabData.map(item => item.unit));
    ALL_UNITS = Array.from(unitSet).sort((a, b) => {
        // 自然排序 (讓 B3 排在 B6 前面，U1 排在 U2 前面)
        return a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'});
    });

    // 預設全選
    if (selectedUnits.length === 0) {
        selectedUnits = [...ALL_UNITS];
    } else {
        selectedUnits = selectedUnits.filter(u => ALL_UNITS.includes(u));
    }

    generateRangeButtons();
    updateCheckmarks();
    updateRangeUI();
}

// ★★★ 核心修改：依照冊次分類按鈕 ★★★
function generateRangeButtons() {
    const container = document.getElementById('range-container');
    if (!container) return;
    
    container.innerHTML = ''; 

    // 定義分組容器
    const books = {
        1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 'Other': []
    };

    // 將單元分配到對應的冊次
    ALL_UNITS.forEach(unit => {
        let bookNum = 'Other';
        
        // 判斷邏輯：
        // 1. 如果開頭是 'B' (例如 B3U5)，取 B 後面的數字
        // 2. 如果開頭是 'U' (例如 U1)，預設歸類為 Book 5 (依照舊資料慣例)
        
        const matchB = unit.match(/^B(\d+)/i); // 偵測 B3, B6...
        
        if (matchB) {
            bookNum = parseInt(matchB[1]);
        } else if (unit.startsWith('U')) {
            bookNum = 5; // 舊資料 U1~U6 視為第五冊
        }

        if (!books[bookNum]) books[bookNum] = [];
        books[bookNum].push(unit);
    });

    // 依序產生 HTML
    // 我們只顯示 1~6 冊和 Other
    const order = [1, 2, 3, 4, 5, 6, 'Other'];

    order.forEach(bookNum => {
        const unitsInBook = books[bookNum];
        if (unitsInBook && unitsInBook.length > 0) {
            
            // 1. 建立冊次區塊
            const section = document.createElement('div');
            section.className = 'book-section';

            // 2. 建立標題
            const title = document.createElement('div');
            title.className = 'book-title';
            title.textContent = (bookNum === 'Other') ? '其他範圍' : `Book ${bookNum}`;
            section.appendChild(title);

            // 3. 建立按鈕網格
            const grid = document.createElement('div');
            grid.className = 'unit-grid';

            unitsInBook.forEach(unit => {
                const div = document.createElement('div');
                div.className = 'range-card'; 
                div.id = 'btn-' + unit;
                div.onclick = function() { toggleUnit(unit); };
                
                // 簡化按鈕文字：只顯示 Unit 號碼
                // 例如 "B3U5" -> "Unit 5", "U1" -> "Unit 1"
                let shortName = unit;
                const matchU = unit.match(/U(\d+)/i);
                if (matchU) {
                    shortName = `Unit ${matchU[1]}`; // 變成 "Unit 1"
                } else if (unit.includes('&')) {
                     // 處理 B6U3&4 這種合併單元
                     shortName = unit.replace(/B\d+/, '').replace('U', 'Unit ');
                }

                div.innerHTML = `
                    <span>${shortName}</span>
                    <span class="check-mark hidden" id="check-${unit}">✔</span>
                `;
                grid.appendChild(div);
            });

            section.appendChild(grid);
            container.appendChild(section);
        }
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
    
    // 顯示或隱藏警告
    const warningEl = document.getElementById('range-warning');
    if (selectedUnits.length === 0) {
        warningEl.style.display = 'block';
    } else {
        warningEl.style.display = 'none';
    }
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

    let filteredData = vocabData.filter(item => selectedUnits.includes(item.unit));

    if (filteredData.length === 0) {
        alert("所選範圍沒有單字資料！");
        return;
    }

    filteredData.sort(() => 0.5 - Math.random());
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
            if (!options.some(o => o.id === randomItem.id)) options.push(randomItem);
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
        if (currentQuestionMode === 'zh-en') speakText(questionList[currentIndex].en);
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
    feedbackIcon.textContent = isCorrect ? '✔' : '✘'; // 使用 Unicode 符號更簡潔
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
    if(combo < 2) document.getElementById('combo-box').classList.remove('combo-active');
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
    
    let rangeTitle = selectedUnits.length === ALL_UNITS.length ? "全範圍" : "自選範圍";
    
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
