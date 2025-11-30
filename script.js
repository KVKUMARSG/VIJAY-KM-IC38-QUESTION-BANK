console.log("Script starting...");

// Immediate visual feedback
const qText = document.getElementById('question-text');
if (qText) qText.textContent = "Initializing...";

window.onerror = function (msg, url, line, col, error) {
    console.error("Global Error:", msg, url, line, col, error);
    alert("Global Error: " + msg);
    return false;
};

// State Management
const state = {
    allQuestions: [], // Store all loaded questions
    questions: [], // Current set questions
    currentQuestionIndex: 0,
    currentSetIndex: 0,
    userAnswers: {}, // { questionId: { selectedIndex, isCorrect, timestamp } }
    stats: {
        totalAttempted: 0,
        correctCount: 0,
        wrongCount: 0,
        setStats: {} // { setIndex: { attempted, correct, wrong } }
    }
};

// DOM Elements
const elements = {
    views: {
        quiz: document.getElementById('quiz-view'),
        dashboard: document.getElementById('dashboard-view'),
        history: document.getElementById('history-view')
    },
    nav: {
        quiz: document.getElementById('btn-quiz'),
        dashboard: document.getElementById('btn-dashboard'),
        history: document.getElementById('btn-history')
    },
    quiz: {
        progress: document.getElementById('quiz-progress'),
        currentNum: document.getElementById('q-current'),
        totalNum: document.getElementById('q-total'),
        questionText: document.getElementById('question-text'),
        optionsContainer: document.getElementById('options-container'),
        explanationContainer: document.getElementById('explanation-container'),
        explanationText: document.getElementById('explanation-text'),
        visualAid: document.getElementById('visual-aid-container'),
        nextBtn: document.getElementById('btn-next'),
        prevBtn: document.getElementById('btn-prev')
    },
    dashboard: {
        total: document.getElementById('stat-total'),
        accuracy: document.getElementById('stat-accuracy'),
        correct: document.getElementById('stat-correct'),
        resetBtn: document.getElementById('btn-reset'),
        chartCanvas: document.getElementById('performance-chart'),
        setsGrid: document.getElementById('sets-grid')
    },
    history: {
        list: document.getElementById('history-list')
    }
};

// Charts
let explanationChart = null;
let performanceChart = null;

// Initialization
async function init() {
    console.log("Init called");
    try {
        loadProgress();
        await loadQuestions();
        setupEventListeners();
        updateDashboard();
        renderHistory();
        renderSetsGrid();

        // Start with Set 1 if available
        if (state.allQuestions.length > 0) {
            // Validate currentSetIndex against available sets
            const maxSets = Math.ceil(state.allQuestions.length / 50);
            if (state.currentSetIndex >= maxSets) {
                console.warn(`Resetting invalid set index ${state.currentSetIndex} to 0`);
                state.currentSetIndex = 0;
            }

            selectSet(state.currentSetIndex);

            // Force display of first question if not already done by selectSet
            if (state.questions.length > 0) {
                displayQuestion();
            } else {
                // Fallback if somehow empty
                console.error("Selected set is empty, resetting to Set 1");
                selectSet(0);
                displayQuestion();
            }
        }
    } catch (criticalError) {
        console.error("Critical Initialization Error:", criticalError);
        document.body.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; background:#0f172a; color:white; font-family:sans-serif; text-align:center; padding:20px;">
                <h2 style="color:#ef4444; margin-bottom:10px;">Something went wrong</h2>
                <p style="color:#94a3b8; margin-bottom:20px;">The application failed to start. This might be due to corrupted saved data.</p>
                <button onclick="localStorage.clear(); location.reload();" style="padding:12px 24px; background:#3b82f6; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:600;">
                    Factory Reset & Reload
                </button>
                <pre style="margin-top:20px; color:#64748b; font-size:0.8rem; text-align:left; background:#1e293b; padding:10px; border-radius:6px; max-width:800px; overflow:auto;">${criticalError.stack}</pre>
            </div>
        `;
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Load Data
async function loadQuestions() {
    try {
        elements.quiz.questionText.textContent = "Fetching question bank...";
        // Add timestamp to prevent caching
        const response = await fetch(`data/questions.json?v=${new Date().getTime()}`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        state.allQuestions = await response.json();
        console.log(`Loaded ${state.allQuestions.length} questions.`);

        if (state.allQuestions.length === 0) {
            elements.quiz.questionText.textContent = "No questions found in the database.";
            return;
        }
    } catch (error) {
        console.error('Failed to load questions:', error);
        elements.quiz.questionText.innerHTML = `Error loading questions.<br><small>${error.message}</small><br><button onclick="location.reload()" class="secondary-btn" style="margin-top:10px">Retry</button>`;
        throw error;
    }
}

// Sets Logic
function renderSetsGrid() {
    const totalSets = Math.ceil(state.allQuestions.length / 50);
    elements.dashboard.setsGrid.innerHTML = '';

    for (let i = 0; i < totalSets; i++) {
        // Calculate stats for this set
        const setStat = state.stats.setStats[i] || { attempted: 0, correct: 0 };
        const totalInSet = Math.min((i + 1) * 50, state.allQuestions.length) - (i * 50);
        const progressPercent = totalInSet > 0 ? (setStat.attempted / totalInSet) * 100 : 0;

        const btn = document.createElement('div');
        // Use set-stat-card style instead of simple button
        btn.className = `set-stat-card ${i === state.currentSetIndex ? 'active' : ''}`;
        btn.style.cursor = 'pointer';
        if (i === state.currentSetIndex) btn.style.border = '2px solid var(--primary)';

        btn.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <strong>Set ${i + 1}</strong>
                <span class="badge ${progressPercent === 100 ? 'success' : 'neutral'}">${Math.round(progressPercent)}% Done</span>
            </div>
            <div class="progress-bar-container" style="height:6px; margin-bottom:8px;">
                <div class="progress-bar" style="width:${progressPercent}%"></div>
            </div>
            <div style="font-size:0.8rem; color:var(--text-secondary);">
                ${setStat.correct}/${totalInSet} Correct
            </div>
        `;

        btn.onclick = () => {
            selectSet(i);
            // Switch to quiz view
            document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            elements.views.quiz.classList.remove('hidden');
            elements.nav.quiz.classList.add('active');
        };
        elements.dashboard.setsGrid.appendChild(btn);
    }
}

function selectSet(index) {
    state.currentSetIndex = index;
    const start = index * 50;
    const end = start + 50;
    state.questions = state.allQuestions.slice(start, end);

    // Restore progress for this set
    const setProgress = JSON.parse(localStorage.getItem('ir38_set_progress') || '{}');
    state.currentQuestionIndex = setProgress[index] || 0;

    console.log(`Selected Set ${index + 1}. Questions: ${state.questions.length}. Resuming at Q${state.currentQuestionIndex + 1}`);

    // Update UI for sets
    renderSetsGrid(); // Re-render to update active state

    // Save progress (global current set)
    saveProgress();

    // Update Quiz View
    displayQuestion();
}

// Persistence
function loadProgress() {
    const savedProgress = localStorage.getItem('ir38_progress');
    const savedAnswers = localStorage.getItem('ir38_answers');
    const savedSet = localStorage.getItem('ir38_current_set');

    if (savedProgress) {
        state.stats = JSON.parse(savedProgress);
        if (!state.stats.setStats) state.stats.setStats = {}; // Ensure structure
    }

    if (savedAnswers) {
        state.userAnswers = JSON.parse(savedAnswers);
    }

    if (savedSet) {
        state.currentSetIndex = parseInt(savedSet, 10);
    }
}

function saveProgress() {
    localStorage.setItem('ir38_progress', JSON.stringify(state.stats));
    localStorage.setItem('ir38_answers', JSON.stringify(state.userAnswers));
    localStorage.setItem('ir38_current_set', state.currentSetIndex);

    // Save current question index for the current set
    const setProgress = JSON.parse(localStorage.getItem('ir38_set_progress') || '{}');
    setProgress[state.currentSetIndex] = state.currentQuestionIndex;
    localStorage.setItem('ir38_set_progress', JSON.stringify(setProgress));
}

// Navigation
function switchView(viewName) {
    // Hide all views
    Object.values(elements.views).forEach(el => el.classList.remove('active', 'hidden'));
    Object.values(elements.views).forEach(el => el.classList.add('hidden'));

    // Show selected
    elements.views[viewName].classList.remove('hidden');
    elements.views[viewName].classList.add('active');

    // Update Nav
    Object.values(elements.nav).forEach(el => el.classList.remove('active'));
    elements.nav[viewName].classList.add('active');

    if (viewName === 'dashboard') {
        updateDashboard();
        renderPerformanceChart();
        renderSetsGrid();
    } else if (viewName === 'history') {
        renderHistory();
    }
}

function setupEventListeners() {
    elements.nav.quiz.addEventListener('click', () => switchView('quiz'));
    elements.nav.dashboard.addEventListener('click', () => switchView('dashboard'));
    elements.nav.history.addEventListener('click', () => switchView('history'));

    elements.quiz.nextBtn.addEventListener('click', nextQuestion);
    elements.quiz.prevBtn.addEventListener('click', prevQuestion);
    elements.dashboard.resetBtn.addEventListener('click', resetProgress);
}

// Quiz Logic
function displayQuestion() {
    // Alias for loadQuestion(currentQuestionIndex)
    loadQuestion(state.currentQuestionIndex);
}

function loadQuestion(index) {
    if (state.questions.length === 0) return;

    // Bounds check
    if (index < 0) index = 0;
    if (index >= state.questions.length) {
        alert("You have reached the end of this set.");
        return;
    }

    state.currentQuestionIndex = index;
    const question = state.questions[index];

    // Update UI
    elements.quiz.currentNum.textContent = index + 1;
    elements.quiz.totalNum.textContent = state.questions.length;
    elements.quiz.questionText.textContent = question.question;
    elements.quiz.progress.style.width = `${((index + 1) / state.questions.length) * 100}%`;

    // Navigation Buttons State
    elements.quiz.prevBtn.disabled = index === 0;
    elements.quiz.nextBtn.disabled = index === state.questions.length - 1;

    // Reset state for new question
    elements.quiz.explanationContainer.classList.add('hidden');
    elements.quiz.optionsContainer.innerHTML = '';

    // Check if already answered
    const previousAnswer = state.userAnswers[question.id];

    question.options.forEach((opt, i) => {
        const btn = document.createElement('div');
        btn.className = 'option-btn';
        btn.innerHTML = `
            <div class="option-marker">${String.fromCharCode(65 + i)}</div>
            <span>${opt}</span>
        `;

        if (previousAnswer) {
            if (i === question.correctIndex) btn.classList.add('correct');
            if (i === previousAnswer.selectedIndex && i !== question.correctIndex) btn.classList.add('wrong');
            btn.classList.add('disabled');
        } else {
            btn.addEventListener('click', () => handleAnswer(i, question));
        }

        elements.quiz.optionsContainer.appendChild(btn);
    });

    if (previousAnswer) {
        showExplanation(question);
    }
}

function handleAnswer(selectedIndex, question) {
    // Prevent multiple answers
    if (state.userAnswers[question.id]) return;

    const isCorrect = selectedIndex === question.correctIndex;

    // Update Global Stats
    state.stats.totalAttempted++;
    if (isCorrect) state.stats.correctCount++;
    else state.stats.wrongCount++;

    // Update Set Stats
    if (!state.stats.setStats[state.currentSetIndex]) {
        state.stats.setStats[state.currentSetIndex] = { attempted: 0, correct: 0, wrong: 0 };
    }
    const setStat = state.stats.setStats[state.currentSetIndex];
    setStat.attempted++;
    if (isCorrect) setStat.correct++;
    else setStat.wrong++;

    // Save Answer
    state.userAnswers[question.id] = {
        selectedIndex,
        isCorrect,
        timestamp: new Date().toISOString()
    };

    saveProgress();

    // Update UI
    const buttons = elements.quiz.optionsContainer.children;
    for (let i = 0; i < buttons.length; i++) {
        buttons[i].classList.add('disabled');
        if (i === question.correctIndex) buttons[i].classList.add('correct');
        if (i === selectedIndex && !isCorrect) buttons[i].classList.add('wrong');
    }

    showExplanation(question);
}

function showExplanation(question) {
    elements.quiz.explanationContainer.classList.remove('hidden');
    elements.quiz.explanationText.textContent = question.explanation || "No explanation available.";

    // Destroy previous chart if exists
    if (explanationChart) {
        explanationChart.destroy();
        explanationChart = null;
    }

    const canvas = document.getElementById('explanation-chart');

    if (question.chartData) {
        canvas.style.display = 'block';
        const ctx = canvas.getContext('2d');
        explanationChart = new Chart(ctx, {
            type: question.chartData.type || 'bar',
            data: {
                labels: question.chartData.labels,
                datasets: [{
                    label: question.chartData.label,
                    data: question.chartData.data,
                    backgroundColor: ['rgba(99, 102, 241, 0.5)', 'rgba(236, 72, 153, 0.5)'],
                    borderColor: ['#6366f1', '#ec4899'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { labels: { color: '#fff' } }
                },
                scales: {
                    y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.1)' } },
                    x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.1)' } }
                }
            }
        });
    } else {
        canvas.style.display = 'none';
    }

    // Update Google Search Link
    const searchBtn = document.getElementById('btn-google-search');
    if (searchBtn) {
        const query = encodeURIComponent(`IRDA IC38 exam ${question.question}`);
        searchBtn.href = `https://www.google.com/search?q=${query}`;
    }
}

function nextQuestion() {
    loadQuestion(state.currentQuestionIndex + 1);
}

function prevQuestion() {
    loadQuestion(state.currentQuestionIndex - 1);
}

// Dashboard Logic
function updateDashboard() {
    const { totalAttempted, correctCount } = state.stats;
    const accuracy = totalAttempted > 0 ? Math.round((correctCount / totalAttempted) * 100) : 0;

    elements.dashboard.total.textContent = totalAttempted;
    elements.dashboard.accuracy.textContent = `${accuracy}%`;
    elements.dashboard.correct.textContent = correctCount;
}

function renderPerformanceChart() {
    if (performanceChart) performanceChart.destroy();

    const ctx = elements.dashboard.chartCanvas.getContext('2d');
    performanceChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Correct', 'Wrong'],
            datasets: [{
                data: [state.stats.correctCount, state.stats.wrongCount],
                backgroundColor: ['#22c55e', '#ef4444'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#fff' } }
            }
        }
    });
}

function resetProgress() {
    if (confirm('Are you sure you want to reset all progress?')) {
        localStorage.removeItem('ir38_progress');
        localStorage.removeItem('ir38_answers');
        localStorage.removeItem('ir38_current_set');
        localStorage.removeItem('ir38_set_progress');
        state.stats = {
            totalAttempted: 0,
            correctCount: 0,
            wrongCount: 0,
            setStats: {}
        };
        state.userAnswers = {};
        state.currentQuestionIndex = 0;
        state.currentSetIndex = 0;
        updateDashboard();
        renderPerformanceChart();
        selectSet(0);
        alert('Progress reset.');
    }
}
