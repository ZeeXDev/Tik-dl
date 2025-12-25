// ===== CONFIGURATION =====
const API_URL = 'https://tik-dl1.onrender.com/api'; // ← TON BACKEND
const ADSGRAM_BLOCK_ID = 'int-19937';               // ← TON BLOCK ID

// ===== TELEGRAM WEB APP =====
let tg = window.Telegram?.WebApp;
let userId = null;

if (tg) {
    tg.ready();
    tg.expand();
    userId = tg.initDataUnsafe?.user?.id;
    console.log('Telegram User ID:', userId);
} else {
    userId = 123456789;
    console.warn('Mode test - Telegram WebApp non disponible');
}

// ===== ÉLÉMENTS DOM =====
const elements = {
    videoUrl: document.getElementById('videoUrl'),
    clearBtn: document.getElementById('clearBtn'),
    platformDetected: document.getElementById('platformDetected'),
    platformName: document.getElementById('platformName'),
    downloadBtn: document.getElementById('downloadBtn'),
    loadingState: document.getElementById('loadingState'),
    loadingText: document.getElementById('loadingText'),
    message: document.getElementById('message'),
    messageIcon: document.getElementById('messageIcon'),
    messageText: document.getElementById('messageText'),
    freeTimeCard: document.getElementById('freeTimeCard'),
    timeRemaining: document.getElementById('timeRemaining'),
    adCard: document.getElementById('adCard'),
    watchAdBtn: document.getElementById('watchAdBtn')
};

// ===== ÉTAT =====
let state = {
    hasFreeTime: false,
    freeTimeExpires: null,
    isLoading: false,
    currentPlatform: null,
    timerInterval: null
};

// ===== PLATEFORMES =====
const platforms = {
    tiktok: { regex: /(tiktok\.com|vm\.tiktok\.com)/i, name: 'TikTok', icon: '🎵' },
    instagram: { regex: /(instagram\.com|instagr\.am|ig\.me)/i, name: 'Instagram', icon: '📸' },
    pinterest: { regex: /(pinterest\.com|pin\.it)/i, name: 'Pinterest', icon: '📌' }
};

function detectPlatform(url) {
    for (let [key, p] of Object.entries(platforms)) {
        if (p.regex.test(url)) return { key, ...p };
    }
    return null;
}

// ===== INPUT URL =====
elements.videoUrl.addEventListener('input', e => {
    const url = e.target.value.trim();
    elements.clearBtn.classList.toggle('hidden', !url);

    if (!url) {
        elements.platformDetected.classList.add('hidden');
        state.currentPlatform = null;
        return;
    }

    const platform = detectPlatform(url);
    if (platform) {
        state.currentPlatform = platform;
        elements.platformName.textContent = `${platform.icon} ${platform.name} détecté`;
        elements.platformDetected.classList.remove('hidden');
    } else {
        elements.platformDetected.classList.add('hidden');
        state.currentPlatform = null;
    }
});

elements.clearBtn.addEventListener('click', () => {
    elements.videoUrl.value = '';
    elements.clearBtn.classList.add('hidden');
    elements.platformDetected.classList.add('hidden');
    state.currentPlatform = null;
});

// ===== FREE TIME =====
async function checkFreeTime() {
    try {
        const res = await fetch(`${API_URL}/status/${userId}`);
        const data = await res.json();

        state.hasFreeTime = data.hasFreeTime;

        if (data.hasFreeTime) {
            showFreeTimeCard(data.remainingMinutes);
            elements.adCard.classList.add('hidden');
        } else {
            elements.freeTimeCard.classList.add('hidden');
            elements.adCard.classList.remove('hidden');
        }

        return data;
    } catch {
        return { hasFreeTime: false };
    }
}

function showFreeTimeCard(minutes) {
    elements.freeTimeCard.classList.remove('hidden');
    updateTimer(minutes);

    clearInterval(state.timerInterval);
    state.timerInterval = setInterval(checkFreeTime, 60000);
}

function updateTimer(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    elements.timeRemaining.textContent = `${h}h ${m}min`;
}

// ===== DOWNLOAD =====
elements.downloadBtn.addEventListener('click', async () => {
    const url = elements.videoUrl.value.trim();

    if (!url) return showMessage('error', 'Veuillez entrer une URL valide');
    if (!state.currentPlatform) return showMessage('error', 'Plateforme non supportée');

    const status = await checkFreeTime();
    if (!status.hasFreeTime) {
        showMessage('warning', 'Regardez une pub pour débloquer 2h 🎁');
        highlightAdCard();
        return;
    }

    downloadVideo(url);
});

async function downloadVideo(url) {
    if (state.isLoading) return;

    state.isLoading = true;
    setLoadingState(true, 'Préparation...');
    hideMessage();

    try {
        const res = await fetch(`${API_URL}/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, url, platform: state.currentPlatform.key })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message);

        setTimeout(() => {
            setLoadingState(false);
            showMessage('success', '✅ Vidéo envoyée sur Telegram !');
            tg?.HapticFeedback?.notificationOccurred('success');
        }, 3000);

    } catch (e) {
        setLoadingState(false);
        showMessage('error', e.message || 'Erreur');
        tg?.HapticFeedback?.notificationOccurred('error');
    } finally {
        state.isLoading = false;
    }
}

// ===================================================================
// ======================= ADSGRAM (VERSION MODERNE) ==================
// ===================================================================

elements.watchAdBtn.addEventListener('click', showAd);

function showAd() {
    if (!window.Adsgram?.showAd) {
        showMessage('error', 'AdsGram non chargé');
        return;
    }

    window.Adsgram.showAd({
        blockId: ADSGRAM_BLOCK_ID,

        onReward: async () => {
            tg?.HapticFeedback?.notificationOccurred('success');

            try {
                const res = await fetch(`${API_URL}/watch-ad`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId })
                });

                const data = await res.json();
                if (!data.success) throw new Error();

                elements.adCard.classList.add('hidden');
                showFreeTimeCard(120);
                showMessage('success', '🎉 2h de téléchargements débloquées !');

            } catch {
                showMessage('error', 'Erreur activation récompense');
            }
        },

        onClose: () => {
            showMessage('warning', 'Vous devez regarder la pub jusqu’à la fin');
        },

        onError: (err) => {
            console.error(err);
            showMessage('error', 'Erreur publicité');
        }
    });
}

// ===== UI =====
function setLoadingState(loading, text = '') {
    elements.downloadBtn.disabled = loading;
    elements.loadingState.classList.toggle('hidden', !loading);
    if (text) elements.loadingText.textContent = text;
}

function showMessage(type, text) {
    elements.message.className = `message ${type}`;
    elements.messageText.textContent = text;
    elements.message.classList.remove('hidden');
}

function hideMessage() {
    elements.message.classList.add('hidden');
}

function highlightAdCard() {
    elements.adCard.style.animation = 'none';
    setTimeout(() => {
        elements.adCard.style.animation = 'pulse 1s ease-in-out 3';
    }, 10);
}

// ===== INIT =====
(async function init() {
    await checkFreeTime();
    tg?.BackButton?.onClick(() => tg.close());
})();