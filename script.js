// 全域變數
let vocabData = []; 
let currentMode = ''; 
let selectedUnits = [];
let ALL_UNITS = [];
let mistakeList = []; // 儲存錯題 ID

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
let ttsRate = 1.0; 

// 單字卡模式變數
let flashcardList = [];
let fcIndex = 0;

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQTxd32azbren8Y1VTFYqd_NhzKI7hyVEV2RLYYu8XHGsuipC-SbDgJDGU-6ayIRWZpEmIobLjuKCec/pub?output=csv'; 

window.onload = function() {
    if (typeof Papa === 'undefined') {
        alert("嚴重錯誤：網頁缺少 PapaParse 元件。");
        document.getElementById('loading-text').textContent = "程式庫載入失敗";
        return;
    }

    // 1. 載入設定
    loadUserSettings();

    // 2. 鍵盤監聽
    setupKeyboardShortcuts();

    // 3. 讀取資料
    const cachedData = localStorage.getItem('cachedVocabData');
    if (cachedData) {
        try {
            const parsedCache = JSON.parse(cachedData);
            if (parsedCache && parsedCache.length > 0) {
                processData(parsedCache);
                document.getElementById('update-status').textContent = "已載入快取資料，正在背景更新...";
            }
        } catch (e) { console.error("快取資料損毀", e); }
    }
    loadGoogleSheetData();
};

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // 如果目前是隱藏的，就不動作 (避免首頁誤觸)
        if (currentMode === '') return;

        // 1. 測驗模式 (Mixed)
        if (currentMode === 'mixed' && !document.getElementById('quiz-screen').classList.contains('hidden')) {
            // 數字鍵 1-4
            if (['1', '2', '3', '4'].includes(e.key) && !isProcessing) {
                const index = parseInt(e.key) - 1;
                const btns = document.querySelectorAll('.btn-option');
                if (btns[index]) btns[index].click();
            }
            // Enter/Space: 下一題 (僅在顯示回饋時有效)
            if ((e.key === 'Enter' || e.key === ' ') && isProcessing) {
                e.preventDefault(); // 防止 Space 捲動頁面
                // 模擬等待時間結束，直接下一題 (需要修改 checkAnswer 裡的 setTimeout 邏輯，這裡簡化處理)
                // 由於原始邏輯是用 setTimeout 自動跳，這裡可以不做動作，或者實作「按鍵加速跳轉」
                // 為了簡單，我們這裡不做強制跳轉，依賴 setTimeout，
                // 但如果是「拼字模式」，Enter 已經綁定在 input 上了。
            }
        }

        // 2. 單字卡模式
        if (currentMode === 'flashcard') {
            if (e.key === ' ' || e.key === 'Spacebar') { // 空白鍵翻面
                e.preventDefault();
                flipCard();
            } else if (e.key === 'ArrowLeft') { // 左鍵：不會
                handleFlashcardResult(false);
            } else if (e.key === 'ArrowRight') { // 右鍵：會了
                handleFlashcardResult(true);
            }
        }
    });
}

function loadUserSettings() {
    const savedMistakes = localStorage.getItem('mistakeList');
    if (savedMistakes) mistakeList = JSON.parse(savedMistakes);
    updateMistakeBtn();

    const isDarkMode = localStorage.getItem('darkMode') === 'true';
    if (isDarkMode) document.body.classList.add('dark-mode');
}

function updateMistakeBtn() {
    const btn = document.getElementById('btn-mistake');
    const countSpan = document.getElementById('mistake-count');
    if (mistakeList.length > 0) {
        btn.classList.remove('hidden');
        countSpan.textContent = mistakeList.length;
    } else {
        btn.classList.add('hidden');
    }
}

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
                if (vocabData.length === 0) document.getElementById('loading-text').textContent = "讀取失敗：資料庫為空";
                return;
            }

            localStorage.setItem('cachedVocabData', JSON.stringify(newData));

            if (vocabData.length === 0 || JSON.stringify(vocabData) !== JSON.stringify(newData)) {
                processData(newData);
                document.getElementById('update-status').textContent = "資料庫已更新至最新版本！";
                setTimeout(() => {
                    const statusEl = document.getElementById('update-status');
                    if(statusEl) statusEl.textContent = "";
                }, 3000);
            }
        },
        error: function(err) {
            console.error("下載失敗", err);
            if (vocabData.length === 0) document.getElementById('loading-text').textContent = "網路連線失敗";
        }
    });
}

function processData(data) {
    vocabData = data;
    const unitSet = new Set(vocabData.map(item => item.unit));
    ALL_UNITS = Array.from(unitSet).sort((a, b) => {
        return a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'});
    });

    if (selectedUnits.length === 0) selectedUnits = [...ALL_UNITS];
    else selectedUnits = selectedUnits.filter(u => ALL_UNITS.includes(u));

    generateRangeButtons();
    updateCheckmarks();
    updateRangeUI();
}

function generateRangeButtons() {
    const container = document.getElementById('range-container');
    if (!container) return;
    container.innerHTML = ''; 

    const books = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 'Other': [] };

    ALL_UNITS.forEach(unit => {
        let bookNum = 'Other';
        const matchB = unit.match(/^B(\d+)/i);
        if (matchB) bookNum = parseInt(matchB[1]);
        else if (unit.startsWith('U')) bookNum = 5;
        if (!books[bookNum]) books[bookNum] = [];
        books[bookNum].push(unit);
    });

    const order = [1, 2, 3, 4, 5, 6, 'Other'];

    order.forEach(bookNum => {
        const unitsInBook = books[bookNum];
        if (unitsInBook && unitsInBook.length > 0) {
            const section = document.createElement('div');
            section.className = 'book-section';
            const title = document.createElement('div');
            title.className = 'book-title';
            title.textContent = (bookNum === 'Other') ? '其他範圍' : `Book ${bookNum}`;
            section.appendChild(title);
            const grid = document.createElement('div');
            grid.className = 'unit-grid';

            unitsInBook.forEach(unit => {
                const div = document.createElement('div');
                div.className = 'range-card'; 
                div.id = 'btn-' + unit;
                div.onclick = function() { toggleUnit(unit); };
                let shortName = unit;
                if (unit.startsWith('B')) shortName = unit.replace(/^B\d+/, '').replace('U', 'Unit ');
                else if (unit.startsWith('U')) shortName = unit.replace('U', 'Unit ');

                div.innerHTML = `<span>${shortName}</span><span class="check-mark hidden" id="check-${unit}">✔</span>`;
                grid.appendChild(div);
            });
            section.appendChild(grid);
            container.appendChild(section);
        }
    });
}

function toggleUnit(unit) {
    const index = selectedUnits.indexOf(unit);
    if (index > -1) selectedUnits.splice(index, 1);
    else selectedUnits.push(unit);
    updateRangeUI();
}

function toggleAllUnits() {
    selectedUnits = (selectedUnits.length === ALL_UNITS.length) ? [] : [...ALL_UNITS];
    updateRangeUI();
}

function updateRangeUI() {
    ALL_UNITS.forEach(unit => {
        const btn = document.getElementById('btn-' + unit);
        if (btn) {
            if (selectedUnits.includes(unit)) btn.classList.add('selected');
            else btn.classList.remove('selected');
        }
    });
    const warningEl = document.getElementById('range-warning');
    warningEl.style.display = (selectedUnits.length === 0) ? 'block' : 'none';
}

function updateCheckmarks() {
    ALL_UNITS.forEach(r => {
        if (localStorage.getItem('pass_' + r) === 'true') {
            const check = document.getElementById('check-' + r);
            if(check) check.classList.remove('hidden');
        }
    });
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', isDark);
}

function setSpeechSpeed(val) { ttsRate = parseFloat(val); }

function speakText(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = ttsRate;
        window.speechSynthesis.speak(utterance);
    }
}

function goBackToHome() {
    clearInterval(timerInterval);
    window.speechSynthesis.cancel();
    document.getElementById('quiz-screen').classList.add('hidden');
    document.getElementById('flashcard-screen').classList.add('hidden');
    document.getElementById('result-screen').classList.add('hidden');
    document.getElementById('timer-container').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
    currentMode = ''; // 重置模式
    updateMistakeBtn();
}

function startQuiz(mode) {
    if (selectedUnits.length === 0 && mode !== 'mistake') {
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

    let filteredData = [];
    if (mode === 'mistake') {
        if (mistakeList.length === 0) { alert("目前沒有錯題紀錄！"); return; }
        filteredData = vocabData.filter(item => mistakeList.includes(item.id));
        if (filteredData.length === 0) {
             mistakeList = [];
             localStorage.setItem('mistakeList', JSON.stringify([]));
             alert("錯題資料已過期，請重新測驗。");
             updateMistakeBtn();
             return;
        }
    } else {
        filteredData = vocabData.filter(item => selectedUnits.includes(item.unit));
    }

    if (filteredData.length === 0) { alert("所選範圍沒有單字資料！"); return; }

    filteredData.sort(() => 0.5 - Math.random());
    questionList = (mode !== 'mistake') ? filteredData.slice(0, 20) : filteredData;
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
            qTextEl.innerHTML = `${currentQ.en} <button class="audio-btn" onclick="speakText('${currentQ.en.replace(/'/g, "\\'")}')">🔊</button><br><span class="phonetic">${currentQ.ph}</span>`;
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
    feedbackIcon.textContent = isCorrect ? '✔' : '✘'; 
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
    const currentQ = questionList[currentIndex];
    userAnswers.push({ question: currentQ, isCorrect: isCorrect });

    if (!isCorrect) {
        if (!mistakeList.includes(currentQ.id)) mistakeList.push(currentQ.id);
    } else {
        if (currentMode === 'mistake') {
            const idx = mistakeList.indexOf(currentQ.id);
            if (idx > -1) mistakeList.splice(idx, 1);
        }
    }
    localStorage.setItem('mistakeList', JSON.stringify(mistakeList));
}

function nextQuestion() {
    currentIndex++;
    if (currentIndex < questionList.length) renderQuestion();
    else finishQuiz();
}

function finishQuiz() {
    resetFeedback();
    document.getElementById('quiz-screen').classList.add('hidden');
    document.getElementById('timer-container').classList.add('hidden');
    document.getElementById('result-screen').classList.remove('hidden');
    document.getElementById('combo-box').classList.remove('combo-active');

    const percentage = Math.round((score / questionList.length) * 100);
    let rangeTitle = "";
    if (currentMode === 'mistake') rangeTitle = "錯題特訓";
    else rangeTitle = selectedUnits.length === ALL_UNITS.length ? "全範圍" : "自選範圍";
    
    document.getElementById('final-score-title').textContent = `${rangeTitle} 測驗結果`;
    document.getElementById('score-text').textContent = `得分：${percentage}% (${score} / ${questionList.length})`;
    document.getElementById('max-combo-text').textContent = `🔥 最高連擊 (Max Combo): ${maxCombo}`;

    const msgDiv = document.getElementById('pass-fail-msg');
    if (percentage >= 80) {
        msgDiv.innerHTML = '<span class="result-pass">恭喜通過！ (Pass)</span>';
        if (currentMode !== 'mistake' && selectedUnits.length === 1) {
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
            div.innerHTML = `<div><strong>${item.question.en}</strong><br>${item.question.zh}</div><div class="review-audio" onclick="speakText('${item.question.en.replace(/'/g, "\\'")}')">🔊</div>`;
            reviewList.appendChild(div);
        });
    }
}

// === 單字卡模式邏輯 (新增) ===
function startFlashcardMode() {
    if (selectedUnits.length === 0) {
        document.getElementById('range-warning').style.display = 'block';
        return;
    }
    
    if (vocabData.length === 0) {
        alert("資料庫尚未載入...");
        return;
    }

    currentMode = 'flashcard';
    
    // 過濾並隨機排序單字
    let filteredData = vocabData.filter(item => selectedUnits.includes(item.unit));
    if (filteredData.length === 0) {
        alert("所選範圍沒有單字資料！");
        return;
    }
    flashcardList = filteredData.sort(() => 0.5 - Math.random());
    fcIndex = 0;

    // 介面切換
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('flashcard-screen').classList.remove('hidden');
    
    renderFlashcard();
}

function renderFlashcard() {
    const card = document.getElementById('flashcard');
    card.classList.remove('flipped'); // 每次切換先翻回正面
    
    const currentWord = flashcardList[fcIndex];
    document.getElementById('fc-remaining').textContent = flashcardList.length - fcIndex;
    
    // 更新內容
    document.getElementById('fc-front-text').textContent = currentWord.en;
    document.getElementById('fc-back-zh').textContent = currentWord.zh;
    document.getElementById('fc-back-ph').textContent = currentWord.ph;
    
    // 自動播放發音 (可選)
    // speakText(currentWord.en); 
}

function flipCard() {
    document.getElementById('flashcard').classList.toggle('flipped');
    // 如果翻到背面，自動發音
    if (document.getElementById('flashcard').classList.contains('flipped')) {
        playCurrentWordAudio();
    }
}

function playCurrentWordAudio() {
    const word = flashcardList[fcIndex].en;
    speakText(word);
}

function handleFlashcardResult(known) {
    const currentWord = flashcardList[fcIndex];
    
    if (!known) {
        // 如果還不熟，把這張卡片移到最後面，稍後再測一次
        flashcardList.push(currentWord);
    }
    
    fcIndex++;
    
    if (fcIndex < flashcardList.length) {
        // 延遲一下讓翻轉動畫順暢
        setTimeout(renderFlashcard, 200);
    } else {
        alert("恭喜！所有單字都複習完囉！");
        goBackToHome();
    }
}
