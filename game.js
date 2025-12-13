// Game configuration
const DURATIONS = [1, 3, 7, 14, 16]; // Duration for each attempt in seconds
const MAX_ATTEMPTS = 5;

// Localization
let locale = {};
let currentLanguage = 'en';

// Detect user language
function detectLanguage() {
    const browserLang = navigator.language || navigator.userLanguage;
    return browserLang.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Load localization
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
    
    // Update page title
    document.getElementById('pageTitle').textContent = locale.title;
}

// Game state
let currentAttempt = 0;
let guesses = [];
let gameOver = false;
let isPlaying = false;
let player = null;
let currentTime = 0;
let animationFrame = null;
let dailySong = null;
let playerReady = false;

// Check if it's Christmas (December 25th)
function isChristmas() {
    const today = new Date();
    const month = today.getUTCMonth(); // 0-indexed, so 11 = December
    const day = today.getUTCDate();
    return month === 11 && day === 25;
}

// Get today's song using a deterministic daily seed
function getDailySong() {
    const today = new Date();
    // Use UTC midnight for consistency across timezones
    const utcDate = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    
    // Base date: December 10, 2025
    const baseDate = Date.UTC(2025, 11, 10); // Month is 0-indexed, so 11 = December
    
    // Calculate days since December 10, 2025 (Day 1)
    const daysSinceBase = Math.floor((utcDate - baseDate) / (1000 * 60 * 60 * 24)) + 1;
    
    // Use a proper hash function for better distribution
    // Simple hash based on the FNV-1a algorithm
    let hash = 2166136261; // FNV offset basis
    const seed = daysSinceBase;
    
    // Hash the seed
    for (let i = 0; i < 4; i++) {
        hash ^= (seed >> (i * 8)) & 0xFF;
        hash = Math.imul(hash, 16777619); // FNV prime
    }
    
    // Ensure positive and get index
    hash = Math.abs(hash);
    const index = hash % SONGS.length;
    
    return {
        ...SONGS[index],
        dayNumber: daysSinceBase
    };
}

// Cookie management
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

// Load saved game state
function loadGameState() {
    const savedState = getCookie('xenobladeXHeardleState');
    if (savedState && savedState.dayNumber === dailySong.dayNumber) {
        return savedState;
    }
    return null;
}

// Save game state
function saveGameState(state) {
    setCookie('xenobladeXHeardleState', state, 1);
}

// Load YouTube IFrame API
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

// Initialize the game
async function initGame() {
    // Load localization first
    await loadLocale();
    
    dailySong = getDailySong();
    
    // Add snow effect if it's Christmas
    if (isChristmas()) {
        createSnowEffect();
    }
    
    // Load YouTube API
    await loadYouTubeAPI();
    
    // Check if already played today
    const savedState = loadGameState();
    if (savedState) {
        // Load saved state
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

// Create snow effect
function createSnowEffect() {
    const snowContainer = document.createElement('div');
    snowContainer.className = 'snow-container';
    document.body.appendChild(snowContainer);
    
    // Create 100 snowflakes for a dense effect
    for (let i = 0; i < 100; i++) {
        const snowflake = document.createElement('div');
        snowflake.className = 'snowflake';
        snowflake.textContent = '❄';
        
        // Random properties for each snowflake
        const left = Math.random() * 100;
        const animationDuration = 5 + Math.random() * 10; // 5-15 seconds
        const animationDelay = Math.random() * 5; // 0-5 seconds delay
        const fontSize = 10 + Math.random() * 20; // 10-30px
        const opacity = 0.3 + Math.random() * 0.7; // 0.3-1.0
        
        snowflake.style.left = `${left}%`;
        snowflake.style.animationDuration = `${animationDuration}s`;
        snowflake.style.animationDelay = `${animationDelay}s`;
        snowflake.style.fontSize = `${fontSize}px`;
        snowflake.style.opacity = opacity;
        
        snowContainer.appendChild(snowflake);
    }
}

// Render the game UI
function renderGame() {
    const container = document.getElementById('gameContainer');
    
    let html = '<div class="guess-boxes">';
    
    // Add Christmas easter egg if it's December 25th
    if (isChristmas()) {
        html += '<img src="patate.png" class="christmas-easter-egg" alt="Christmas" />';
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
    
    // Audio player
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
    
    // Search input
    html += `
        <div class="search-container">
            <span class="search-icon">🔍</span>
            <input type="text" class="search-input" id="searchInput" placeholder="${locale.search}" autocomplete="off">
            <div class="autocomplete-list" id="autocompleteList"></div>
        </div>
    `;
    
    // Buttons
    if (currentAttempt >= MAX_ATTEMPTS - 1) {
        // Last attempt - show Give Up instead of Skip
        html += `
        <div class="button-container">
            <button class="give-up-button" id="giveUpButton">${locale.giveUp}</button>
            <button class="submit-button" id="submitButton" disabled>${locale.submit}</button>
        </div>
        `;
    } else {
        // Normal attempts - show Skip button
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

// Setup event listeners
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

// Toggle play/pause
function togglePlay() {
    if (isPlaying) {
        pauseAudio();
    } else {
        playAudio();
    }
}

// Initialize YouTube player
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

// Play audio
async function playAudio() {
    if (!playerReady) {
        await initPlayer();
    }
    
    // If already playing, stop first
    if (isPlaying) {
        pauseAudio();
        // Small delay to ensure state is properly reset
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    isPlaying = true;
    const playButton = document.getElementById('playButton');
    if (playButton) {
        playButton.classList.add('playing');
    }
    
    // Seek to start and play
    player.seekTo(0, true);
    player.playVideo();
    
    // Start progress animation
    currentTime = 0;
    updateProgress();
}

// Check playback time and stop when needed
function checkPlaybackTime() {
    if (!isPlaying) return;
    
    const playerTime = player.getCurrentTime();
    
    if (playerTime >= DURATIONS[currentAttempt]) {
        pauseAudio();
    } else {
        setTimeout(checkPlaybackTime, 50);
    }
}

// Pause audio
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

// Update progress
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

// Update progress bar
function updateProgressBar() {
    const percentage = (currentTime / DURATIONS[currentAttempt]) * 100;
    document.getElementById('progressFill').style.width = percentage + '%';
    document.getElementById('currentTimeLabel').textContent = Math.floor(currentTime) + 's';
}

// Handle search input
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
    
    // Filter songs - search in both title and localizedTitle
    const matches = SONGS.filter(song => 
        song.title.toLowerCase().includes(query) || 
        song.localizedTitle.toLowerCase().includes(query)
    ).slice(0, 10);
    
    if (matches.length > 0) {
        autocompleteList.innerHTML = matches.map(song => 
            `<div class="autocomplete-item" data-title="${song.title}">${escapeHtml(song.title)}</div>`
        ).join('');
        
        autocompleteList.classList.add('active');
        
        // Add click listeners
        autocompleteList.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('click', () => selectSong(item.dataset.title));
        });
    } else {
        autocompleteList.classList.remove('active');
    }
    
    // Check if exact match in either title or localizedTitle
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

// Handle keyboard navigation in search
function handleSearchKeydown(e) {
    const autocompleteList = document.getElementById('autocompleteList');
    const items = autocompleteList.querySelectorAll('.autocomplete-item');
    
    if (e.key === 'Enter' && items.length > 0) {
        items[0].click();
    }
}

// Select a song from autocomplete
function selectSong(title) {
    document.getElementById('searchInput').value = title;
    document.getElementById('autocompleteList').classList.remove('active');
    selectedSong = title;
    document.getElementById('submitButton').disabled = false;
}

// Skip attempt
function skipAttempt() {
    pauseAudio();
    guesses.push('skip');
    currentAttempt++;
    
    // Destroy the player to reinitialize it with new duration
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

// Submit guess
function submitGuess() {
    if (!selectedSong) return;
    
    pauseAudio();
    guesses.push(selectedSong);
    
    const isCorrect = selectedSong.toLowerCase() === dailySong.title.toLowerCase();
    
    if (isCorrect) {
        endGame(true);
    } else {
        currentAttempt++;
        
        // Destroy the player to reinitialize it with new duration
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

// Give up
function giveUp() {
    pauseAudio();
    // Fill remaining attempts with skips
    while (guesses.length < MAX_ATTEMPTS) {
        guesses.push('skip');
    }
    endGame(false);
}

// End game
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

// Show results
function showResults(won) {
    const container = document.getElementById('gameContainer');
    
    // Get YouTube video ID
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
    
    // YouTube embed
    html += `<iframe class="youtube-embed" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    
    // Copy button
    html += `<button class="copy-button" onclick="copyResults()">${locale.copyResults}</button>`;
    
    // Countdown to next song
    html += '<div class="countdown" id="countdown"></div>';
    
    container.innerHTML = html;
    
    updateCountdown();
    setInterval(updateCountdown, 1000);
}

// Copy results to clipboard
function copyResults() {
    const emoji = [];
    let foundCorrect = false;
    
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        if (foundCorrect) {
            // After finding the correct answer, fill with black squares
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
            // Empty slots (shouldn't happen but just in case)
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

// Update countdown
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

// Initialize game on load
window.addEventListener('load', initGame);
