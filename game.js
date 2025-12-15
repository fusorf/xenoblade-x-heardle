const DURATIONS = [1, 3, 7, 14, 16];
const MAX_ATTEMPTS = 5;

let locale = {};
let currentLanguage = 'en';

function detectLanguage() {
    const browserLang = navigator.language || navigator.userLanguage;
    return browserLang.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function loadLocale() {
    currentLanguage = detectLanguage();
    try {
        const response = await fetch(`locales/${currentLanguage}.json`);
        locale = await response.json();
    } catch (error) {
        console.error('Failed to load locale, falling back to English');
        const response = await fetch('locales/en.json');
        locale = await response.json();
    }
    
    document.getElementById('pageTitle').textContent = locale.title;
}

let currentAttempt = 0;
let guesses = [];
let gameOver = false;
let isPlaying = false;
let player = null;
let currentTime = 0;
let animationFrame = null;
let dailySong = null;
let playerReady = false;

function checkSpecialDate() {
    const today = new Date();
    const m = today.getUTCMonth();
    const d = today.getUTCDate();
    return m === 11 && d === 25;
}

function getDailySong() {
    const today = new Date();
    const utcDate = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const baseDate = Date.UTC(2025, 11, 10);
    const daysSinceBase = Math.floor((utcDate - baseDate) / (1000 * 60 * 60 * 24)) + 1;
    
    const cycleNumber = Math.floor((daysSinceBase - 1) / 20);
    const dayInCycle = (daysSinceBase - 1) % 20;
    
    const shuffledSongs = [...SONGS];
    
    let seed = cycleNumber + 12345;
    for (let i = shuffledSongs.length - 1; i > 0; i--) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const j = seed % (i + 1);
        [shuffledSongs[i], shuffledSongs[j]] = [shuffledSongs[j], shuffledSongs[i]];
    }
    
    const songIndex = dayInCycle % shuffledSongs.length;
    
    return {
        ...shuffledSongs[songIndex],
        dayNumber: daysSinceBase
    };
}

function setCookie(name, value, days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = "expires=" + date.toUTCString();
    document.cookie = name + "=" + JSON.stringify(value) + ";" + expires + ";path=/";
}

function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) {
            try {
                return JSON.parse(c.substring(nameEQ.length, c.length));
            } catch (e) {
                return null;
            }
        }
    }
    return null;
}

function loadGameState() {
    const savedState = getCookie('xenobladeXHeardleState');
    if (savedState && savedState.dayNumber === dailySong.dayNumber) {
        return savedState;
    }
    return null;
}

function saveGameState(state) {
    setCookie('xenobladeXHeardleState', state, 1);
}

function loadYouTubeAPI() {
    return new Promise((resolve) => {
        if (window.YT && window.YT.Player) {
            resolve();
            return;
        }
        
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        
        window.onYouTubeIframeAPIReady = () => {
            resolve();
        };
    });
}

async function initGame() {
    await loadLocale();
    
    dailySong = getDailySong();
    
    if (checkSpecialDate()) {
        addVisualEffect();
    }
    
    await loadYouTubeAPI();
    
    const savedState = loadGameState();
    if (savedState) {
        currentAttempt = savedState.currentAttempt;
        guesses = savedState.guesses;
        gameOver = savedState.gameOver;
        
        if (gameOver) {
            showResults(savedState.won);
        } else {
            renderGame();
        }
    } else {
        renderGame();
    }
}

function addVisualEffect() {
    const container = document.createElement('div');
    container.className = 'snow-container';
    document.body.appendChild(container);
    
    for (let i = 0; i < 100; i++) {
        const element = document.createElement('div');
        element.className = 'snowflake';
        element.textContent = '❄';
        
        const left = Math.random() * 100;
        const duration = 5 + Math.random() * 10;
        const delay = Math.random() * 5;
        const size = 10 + Math.random() * 20;
        const opacity = 0.3 + Math.random() * 0.7;
        
        element.style.left = `${left}%`;
        element.style.animationDuration = `${duration}s`;
        element.style.animationDelay = `${delay}s`;
        element.style.fontSize = `${size}px`;
        element.style.opacity = opacity;
        
        container.appendChild(element);
    }
}

function renderGame() {
    const container = document.getElementById('gameContainer');
    
    let html = '<div class="guess-boxes">';
    
    if (checkSpecialDate()) {
        html += '<img src="patate.png" class="special-img" alt="Special" />';
    }
    
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        let className = 'guess-box';
        let content = '';
        
        if (guesses[i]) {
            if (guesses[i] === 'skip') {
                className += ' skipped';
                content = locale.skipped;
            } else if (guesses[i].toLowerCase() === dailySong.title.toLowerCase()) {
                className += ' correct';
                content = guesses[i];
            } else {
                className += ' wrong';
                content = guesses[i];
            }
        }
        
        html += `<div class="${className}">${content}</div>`;
    }
    html += '</div>';
    
    html += `
        <div class="audio-player">
            <div class="progress-bar">
                <div class="progress-fill" id="progressFill"></div>
            </div>
            <div class="time-labels">
                <span id="currentTimeLabel">0s</span>
                <span id="maxTimeLabel">${DURATIONS[currentAttempt]}s</span>
            </div>
            <div class="play-button" id="playButton"></div>
            <div id="ytPlayer" style="display: none;"></div>
        </div>
    `;
    
    html += `
        <div class="search-container">
            <span class="search-icon">🔍</span>
            <input type="text" class="search-input" id="searchInput" placeholder="${locale.search}" autocomplete="off">
            <div class="autocomplete-list" id="autocompleteList"></div>
        </div>
    `;
    
    if (currentAttempt >= MAX_ATTEMPTS - 1) {
        html += `
        <div class="button-container">
            <button class="give-up-button" id="giveUpButton">${locale.giveUp}</button>
            <button class="submit-button" id="submitButton" disabled>${locale.submit}</button>
        </div>
        `;
    } else {
        html += `
        <div class="button-container">
            <button class="skip-button" id="skipButton">${locale.skip} +${DURATIONS[Math.min(currentAttempt + 1, MAX_ATTEMPTS - 1)] - DURATIONS[currentAttempt]}s</button>
            <button class="submit-button" id="submitButton" disabled>${locale.submit}</button>
        </div>
        `;
    }
    
    container.innerHTML = html;
    
    setupEventListeners();
}

function setupEventListeners() {
    const playButton = document.getElementById('playButton');
    const skipButton = document.getElementById('skipButton');
    const submitButton = document.getElementById('submitButton');
    const searchInput = document.getElementById('searchInput');
    const giveUpButton = document.getElementById('giveUpButton');
    
    playButton.addEventListener('click', togglePlay);
    if (skipButton) {
        skipButton.addEventListener('click', skipAttempt);
    }
    submitButton.addEventListener('click', submitGuess);
    searchInput.addEventListener('input', handleSearchInput);
    searchInput.addEventListener('keydown', handleSearchKeydown);
    
    if (giveUpButton) {
        giveUpButton.addEventListener('click', giveUp);
    }
}

function togglePlay() {
    if (isPlaying) {
        pauseAudio();
    } else {
        playAudio();
    }
}

function initPlayer() {
    return new Promise((resolve) => {
        if (player) {
            resolve();
            return;
        }
        
        const videoId = dailySong.url.split('v=')[1].split('&')[0];
        
        player = new YT.Player('ytPlayer', {
            height: '0',
            width: '0',
            videoId: videoId,
            playerVars: {
                'controls': 0,
                'disablekb': 1,
                'modestbranding': 1,
                'playsinline': 1,
                'rel': 0,
                'showinfo': 0,
                'fs': 0,
                'autoplay': 0
            },
            events: {
                'onReady': () => {
                    playerReady = true;
                    player.setVolume(100);
                    resolve();
                },
                'onStateChange': (event) => {
                    if (event.data === YT.PlayerState.PLAYING && isPlaying) {
                        checkPlaybackTime();
                    }
                }
            }
        });
    });
}

async function playAudio() {
    if (!playerReady) {
        await initPlayer();
    }
    
    if (isPlaying) {
        pauseAudio();
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    isPlaying = true;
    const playButton = document.getElementById('playButton');
    if (playButton) {
        playButton.classList.add('playing');
    }
    
    player.seekTo(0, true);
    player.playVideo();
    
    currentTime = 0;
    updateProgress();
}

function checkPlaybackTime() {
    if (!isPlaying) return;
    
    const playerTime = player.getCurrentTime();
    
    if (playerTime >= DURATIONS[currentAttempt]) {
        pauseAudio();
    } else {
        setTimeout(checkPlaybackTime, 50);
    }
}

function pauseAudio() {
    if (!isPlaying) return;
    
    isPlaying = false;
    const playButton = document.getElementById('playButton');
    if (playButton) {
        playButton.classList.remove('playing');
    }
    
    if (player && playerReady) {
        player.pauseVideo();
        player.seekTo(0, true);
    }
    
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
    }
    
    currentTime = 0;
    updateProgressBar();
}

function updateProgress() {
    if (!isPlaying) return;
    
    if (player && playerReady) {
        currentTime = player.getCurrentTime();
    }
    
    updateProgressBar();
    
    if (currentTime >= DURATIONS[currentAttempt]) {
        pauseAudio();
    } else {
        animationFrame = requestAnimationFrame(updateProgress);
    }
}

function updateProgressBar() {
    const percentage = (currentTime / DURATIONS[currentAttempt]) * 100;
    document.getElementById('progressFill').style.width = percentage + '%';
    document.getElementById('currentTimeLabel').textContent = Math.floor(currentTime) + 's';
}

let selectedSong = null;

function handleSearchInput(e) {
    const query = e.target.value.toLowerCase();
    const autocompleteList = document.getElementById('autocompleteList');
    const submitButton = document.getElementById('submitButton');
    
    if (query.length < 1) {
        autocompleteList.classList.remove('active');
        submitButton.disabled = true;
        selectedSong = null;
        return;
    }
    
    const matches = SONGS.filter(song => 
        song.title.toLowerCase().includes(query) || 
        song.localizedTitle.toLowerCase().includes(query)
    ).slice(0, 10);
    
    if (matches.length > 0) {
        autocompleteList.innerHTML = matches.map(song => 
            `<div class="autocomplete-item" data-title="${song.title}">${escapeHtml(song.title)}</div>`
        ).join('');
        
        autocompleteList.classList.add('active');
        
        autocompleteList.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('click', () => selectSong(item.dataset.title));
        });
    } else {
        autocompleteList.classList.remove('active');
    }
    
    const exactMatch = SONGS.find(song => 
        song.title.toLowerCase() === query || 
        song.localizedTitle.toLowerCase() === query
    );
    
    if (exactMatch) {
        selectedSong = exactMatch.title;
        submitButton.disabled = false;
    } else {
        selectedSong = null;
        submitButton.disabled = true;
    }
}

function handleSearchKeydown(e) {
    const autocompleteList = document.getElementById('autocompleteList');
    const items = autocompleteList.querySelectorAll('.autocomplete-item');
    
    if (e.key === 'Enter' && items.length > 0) {
        items[0].click();
    }
}

function selectSong(title) {
    document.getElementById('searchInput').value = title;
    document.getElementById('autocompleteList').classList.remove('active');
    selectedSong = title;
    document.getElementById('submitButton').disabled = false;
}

function skipAttempt() {
    pauseAudio();
    guesses.push('skip');
    currentAttempt++;
    
    if (player) {
        player.destroy();
        player = null;
        playerReady = false;
    }
    
    if (currentAttempt >= MAX_ATTEMPTS) {
        endGame(false);
    } else {
        saveGameState({
            dayNumber: dailySong.dayNumber,
            currentAttempt,
            guesses,
            gameOver: false
        });
        renderGame();
    }
}

function submitGuess() {
    if (!selectedSong) return;
    
    pauseAudio();
    guesses.push(selectedSong);
    
    const isCorrect = selectedSong.toLowerCase() === dailySong.title.toLowerCase();
    
    if (isCorrect) {
        endGame(true);
    } else {
        currentAttempt++;
        
        if (player) {
            player.destroy();
            player = null;
            playerReady = false;
        }
        
        if (currentAttempt >= MAX_ATTEMPTS) {
            endGame(false);
        } else {
            saveGameState({
                dayNumber: dailySong.dayNumber,
                currentAttempt,
                guesses,
                gameOver: false
            });
            renderGame();
        }
    }
}

function giveUp() {
    pauseAudio();
    while (guesses.length < MAX_ATTEMPTS) {
        guesses.push('skip');
    }
    endGame(false);
}

function endGame(won) {
    gameOver = true;
    
    saveGameState({
        dayNumber: dailySong.dayNumber,
        currentAttempt,
        guesses,
        gameOver: true,
        won
    });
    
    showResults(won);
}

function showResults(won) {
    const container = document.getElementById('gameContainer');
    
    const videoId = dailySong.url.split('v=')[1];
    
    let html = '<div class="result-message">';
    html += `<h2>${locale.todaySong} ${dailySong.title}</h2>`;
    
    if (won) {
        const correctGuesses = guesses.filter(g => g !== 'skip').length;
        const tryWord = correctGuesses === 1 ? locale.try : locale.tries;
        html += `<p>${locale.guessedIn} ${correctGuesses} ${tryWord} !</p>`;
    } else {
        html += `<p>${locale.youLost}</p>`;
    }
    
    html += '</div>';
    
    html += `<iframe class="youtube-embed" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    
    html += `<button class="copy-button" onclick="copyResults()">${locale.copyResults}</button>`;
    
    html += '<div class="countdown" id="countdown"></div>';
    
    container.innerHTML = html;
    
    updateCountdown();
    setInterval(updateCountdown, 1000);
}

function copyResults() {
    const emoji = [];
    let foundCorrect = false;
    
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        if (foundCorrect) {
            emoji.push('⬛');
        } else if (guesses[i]) {
            if (guesses[i] === 'skip') {
                emoji.push('⬜');
            } else if (guesses[i].toLowerCase() === dailySong.title.toLowerCase()) {
                emoji.push('🟩');
                foundCorrect = true;
            } else {
                emoji.push('🟥');
            }
        } else {
            emoji.push('⬛');
        }
    }
    
    const text = `Xenoblade X Heardle - #${dailySong.dayNumber} 🎧
${emoji.join('')}`;
    
    navigator.clipboard.writeText(text).then(() => {
        const button = document.querySelector('.copy-button');
        const originalText = button.textContent;
        button.textContent = locale.copied;
        setTimeout(() => {
            button.textContent = originalText;
        }, 2000);
    });
}

function updateCountdown() {
    const now = new Date();
    const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
    const diff = tomorrow - now;
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    const countdownElement = document.getElementById('countdown');
    if (countdownElement) {
        countdownElement.textContent = `${locale.comeBackIn} ${hours}h ${minutes}m ${seconds}s ${locale.forNextOne}`;
    }
}

window.addEventListener('load', initGame);
