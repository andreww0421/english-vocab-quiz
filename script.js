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
let isSoundOn = true; // 音效開關

// 單字卡變數
let flashcardList = [];
let fcIndex = 0;

// Chart 實例
let scoreChartInstance = null;
let masteryChartInstance = null;

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQTxd32azbren8Y1VTFYqd_NhzKI7hyVEV2RLYYu8XHGsuipC-SbDgJDGU-6ayIRWZpEmIobLjuKCec/pub?output=csv'; 

window.onload = function() {
    if (typeof Papa === 'undefined') {
        alert("嚴重錯誤：網頁缺少 PapaParse 元件。");
        document.getElementById('loading-text').textContent = "程式庫載入失敗";
        return;
    }

    loadUserSettings();
    setupKeyboardShortcuts();

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
        if (currentMode === '') return;
        if (currentMode === 'mixed' && !document.getElementById('quiz-screen').classList.contains('hidden')) {
            if (['1', '2', '3', '4'].includes(e.key) && !isProcessing) {
                const index = parseInt(e.key) - 1;
                const btns = document.querySelectorAll('.btn-option');
                if (btns[index]) btns[index].click();
            }
            if ((e.key === 'Enter' || e.key === ' ') && isProcessing) {
                e.preventDefault();
            }
        }
        if (currentMode === 'flashcard') {
            if (e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                flipCard();
            } else if (e.key === 'ArrowLeft') handleFlashcardResult(false);
            else if (e.key === 'ArrowRight') handleFlashcardResult(true);
        }
    });
}

function loadUserSettings() {
    const savedMistakes = localStorage.getItem('mistakeList');
    if (savedMistakes) mistakeList = JSON.parse(savedMistakes);
    updateMistakeBtn();

    const isDarkMode = localStorage.getItem('darkMode') === 'true';
    if (isDarkMode) document.body.classList.add('dark-mode');

    const soundSetting = localStorage.getItem('soundOn');
    if (soundSetting !== null) {
        isSoundOn = (soundSetting === 'true');
    }
    updateSoundBtn();
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
            if (newData.length === 0) return;
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
        error: function(err) { console.error("下載失敗", err); }
    });
}

function processData(data) {
    vocabData = data;
    const unitSet = new Set(vocabData.map(item => item.unit));
    ALL_UNITS = Array.from(unitSet).sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}));
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
    [1, 2, 3, 4, 5, 6, 'Other'].forEach(bookNum => {
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
    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
}

function toggleSound() {
    isSoundOn = !isSoundOn;
    localStorage.setItem('soundOn', isSoundOn);
    updateSoundBtn();
}

function updateSoundBtn() {
    const btn = document.getElementById('btn-sound');
    btn.textContent = isSoundOn ? '🔊' : '🔇';
    btn.style.opacity = isSoundOn ? '1' : '0.5';
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

// === ★★★ 音效系統核心更新 ★★★ ===
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (!isSoundOn) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const now = audioCtx.currentTime;

    if (type === 'correct') {
        // --- Combo 音效邏輯 ---
        // 預測這次答對後的 combo數 (因為 playSound 在 combo++ 之前執行，所以要 +1)
        let currentLevel = combo + 1;
        if (currentLevel > 10) currentLevel = 10; // 上限鎖定在 10

        // 定義一個 C 大調五聲音階 (聽起來比較和諧)
        // C5, D5, E5, G5, A5, C6, D6, E6, G6, C7
        const frequencies = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66, 1318.51, 1567.98, 2093.00];
        
        const freq = frequencies[currentLevel - 1];

        if (currentLevel < 10) {
            // Combo 1~9: 單音，音色隨 Combo 變亮
            const oscType = currentLevel < 5 ? 'sine' : 'triangle'; // 前4下溫柔，後5下清脆
            playNote(freq, now, 0.15, oscType);
        } else {
            // Combo 10 (Max): 激昂的和弦 (C Major Chord)
            // 根音 + 大三度 + 純五度
            playNote(freq, now, 0.4, 'triangle');       // C7
            playNote(freq * 1.25, now, 0.4, 'triangle'); // E7
            playNote(freq * 1.5, now, 0.4, 'triangle');  // G7
        }

    } else if (type === 'wrong') {
        // 錯誤音效：鋸齒波，音調下降
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.3);
        
        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.linearRampToValueAtTime(0.01, now + 0.3);
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.3);

    } else if (type === 'pass') {
        // 通過：勝利琶音
        playNote(523.25, now, 0.1, 'sine'); // C5
        playNote(659.25, now + 0.1, 0.1, 'sine'); // E5
        playNote(783.99, now + 0.2, 0.3, 'sine'); // G5
    } else if (type === 'fail') {
        // 失敗：低沉雙音
        playNote(400, now, 0.2, 'triangle'); 
        playNote(300, now + 0.2, 0.4, 'triangle'); 
    }
}

// 播放單個音符的輔助函式
function playNote(freq, time, duration, type='sine') {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    // 音量包絡線 (Fade out)
    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + duration);
    
    osc.start(time);
    osc.stop(time + duration);
}

// ==============================

function goBackToHome() {
    clearInterval(timerInterval);
    window.speechSynthesis.cancel();
    document.getElementById('quiz-screen').classList.add('hidden');
    document.getElementById('flashcard-screen').classList.add('hidden');
    document.getElementById('stats-screen').classList.add('hidden'); 
    document.getElementById('result-screen').classList.add('hidden');
    document.getElementById('timer-container').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
    currentMode = ''; 
    updateMistakeBtn();
}

function startQuiz(mode) {
    if (selectedUnits.length === 0 && mode !== 'mistake') {
        document.getElementById('range-warning').style.display = 'block';
        return;
    }
    // 啟動 AudioContext (需要使用者互動)
    if (audioCtx.state === 'suspended') audioCtx.resume();

    currentMode = mode;
    score = 0;
    currentIndex = 0;
    userAnswers = [];
    combo = 0;
    maxCombo = 0;
    isProcessing = false;
    
    if (vocabData.length === 0) { alert("資料庫尚未載入..."); return; }

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
    playSound('wrong'); // 音效
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
        playSound('correct'); // 音效
        if (currentQuestionMode === 'zh-en') speakText(questionList[currentIndex].en);
    } else {
        btnElement.classList.add('btn-wrong');
        playSound('wrong'); // 音效
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
        playSound('correct');
        speakText(correctVal);
    } else {
        input.classList.add('wrong');
        playSound('wrong');
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
    
    // 儲存成績紀錄
    saveQuizResult(percentage);

    let rangeTitle = "";
    if (currentMode === 'mistake') rangeTitle = "錯題特訓";
    else rangeTitle = selectedUnits.length === ALL_UNITS.length ? "全範圍" : "自選範圍";
    
    document.getElementById('final-score-title').textContent = `${rangeTitle} 測驗結果`;
    document.getElementById('score-text').textContent = `得分：${percentage}% (${score} / ${questionList.length})`;
    document.getElementById('max-combo-text').textContent = `🔥 最高連擊 (Max Combo): ${maxCombo}`;

    const msgDiv = document.getElementById('pass-fail-msg');
    if (percentage >= 80) {
        playSound('pass'); // 音效
        msgDiv.innerHTML = '<span class="result-pass">恭喜通過！ (Pass)</span>';
        if (currentMode !== 'mistake' && selectedUnits.length === 1) {
            localStorage.setItem('pass_' + selectedUnits[0], 'true');
        }
    } else {
        playSound('fail'); // 音效
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

// === 單字卡模式 ===
function startFlashcardMode() {
    if (selectedUnits.length === 0) { document.getElementById('range-warning').style.display = 'block'; return; }
    if (vocabData.length === 0) { alert("資料庫尚未載入..."); return; }
    currentMode = 'flashcard';
    let filteredData = vocabData.filter(item => selectedUnits.includes(item.unit));
    if (filteredData.length === 0) { alert("所選範圍沒有單字資料！"); return; }
    flashcardList = filteredData.sort(() => 0.5 - Math.random());
    fcIndex = 0;
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('flashcard-screen').classList.remove('hidden');
    renderFlashcard();
}

function renderFlashcard() {
    const card = document.getElementById('flashcard');
    card.classList.remove('flipped'); 
    const currentWord = flashcardList[fcIndex];
    document.getElementById('fc-remaining').textContent = flashcardList.length - fcIndex;
    document.getElementById('fc-front-text').textContent = currentWord.en;
    document.getElementById('fc-back-zh').textContent = currentWord.zh;
    document.getElementById('fc-back-ph').textContent = currentWord.ph;
}

function flipCard() {
    document.getElementById('flashcard').classList.toggle('flipped');
    if (document.getElementById('flashcard').classList.contains('flipped')) playCurrentWordAudio();
}

function playCurrentWordAudio() {
    const word = flashcardList[fcIndex].en;
    speakText(word);
}

function handleFlashcardResult(known) {
    const currentWord = flashcardList[fcIndex];
    if (!known) flashcardList.push(currentWord);
    fcIndex++;
    if (fcIndex < flashcardList.length) setTimeout(renderFlashcard, 200);
    else { alert("恭喜！所有單字都複習完囉！"); goBackToHome(); }
}

// === 統計功能 ===
function saveQuizResult(percentage) {
    if (currentMode === 'mistake' || questionList.length < 5) return;
    
    let history = JSON.parse(localStorage.getItem('quizHistory') || '[]');
    const now = new Date();
    history.push({
        date: `${now.getMonth()+1}/${now.getDate()} ${now.getHours()}:${now.getMinutes() < 10 ? '0'+now.getMinutes() : now.getMinutes()}`,
        score: percentage
    });
    
    if (history.length > 50) history = history.slice(history.length - 50);
    localStorage.setItem('quizHistory', JSON.stringify(history));
}

function showStats() {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('stats-screen').classList.remove('hidden');
    renderCharts();
}

function renderCharts() {
    const history = JSON.parse(localStorage.getItem('quizHistory') || '[]');
    const recentHistory = history.slice(-10);
    
    const ctxScore = document.getElementById('scoreChart').getContext('2d');
    if (scoreChartInstance) scoreChartInstance.destroy();
    
    scoreChartInstance = new Chart(ctxScore, {
        type: 'line',
        data: {
            labels: recentHistory.map(h => h.date),
            datasets: [{
                label: '測驗分數',
                data: recentHistory.map(h => h.score),
                borderColor: '#4a90e2',
                backgroundColor: 'rgba(74, 144, 226, 0.1)',
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true, max: 100 } }
        }
    });

    let passedCount = 0;
    ALL_UNITS.forEach(u => {
        if (localStorage.getItem('pass_' + u) === 'true') passedCount++;
    });
    const totalCount = ALL_UNITS.length;
    const notPassed = totalCount - passedCount;

    document.getElementById('mastery-text').textContent = `已精通 ${passedCount} / ${totalCount} 個單元 (${Math.round(passedCount/totalCount*100 || 0)}%)`;

    const ctxMastery = document.getElementById('masteryChart').getContext('2d');
    if (masteryChartInstance) masteryChartInstance.destroy();

    masteryChartInstance = new Chart(ctxMastery, {
        type: 'doughnut',
        data: {
            labels: ['已通過', '未完成'],
            datasets: [{
                data: [passedCount, notPassed],
                backgroundColor: ['#2ecc71', '#ecf0f1']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}
