// ===== CONFIGURATION =====
// ⚠️ CHANGE CETTE URL AVEC TON BACKEND RENDER !
const API_URL = 'https://tik-dl1.onrender.com/api';  // ← À CHANGER
const ADSGRAM_BLOCK_ID = 'int-19937';  // ← À CHANGER

// ===== TELEGRAM WEB APP =====
let tg = window.Telegram?.WebApp;
let userId = null;

// Initialisation Telegram
if (tg) {
    tg.ready();
    tg.expand();
    userId = tg.initDataUnsafe?.user?.id;
    console.log('Telegram User ID:', userId);
} else {
    // Mode test sans Telegram
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
    btnText: document.getElementById('btnText'),
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

// ===== ÉTAT GLOBAL =====
let state = {
    hasFreeTime: false,
    freeTimeExpires: null,
    isLoading: false,
    currentPlatform: null,
    timerInterval: null
};

// ===== DÉTECTION PLATEFORME =====
const platforms = {
    tiktok: {
        regex: /(tiktok\.com|vm\.tiktok\.com)/i,
        name: 'TikTok',
        icon: '🎵'
    },
    instagram: {
        regex: /(instagram\.com|instagr\.am|ig\.me)/i,
        name: 'Instagram',
        icon: '📸'
    },
    pinterest: {
        regex: /(pinterest\.com|pinterest\.fr|pinterest\.ca|pin\.it)/i,
        name: 'Pinterest',
        icon: '📌'
    }
};

function detectPlatform(url) {
    for (let [key, platform] of Object.entries(platforms)) {
        if (platform.regex.test(url)) {
            return { key, ...platform };
        }
    }
    return null;
}

// ===== GESTION URL INPUT =====
elements.videoUrl.addEventListener('input', (e) => {
    const url = e.target.value.trim();
    
    // Afficher/masquer bouton clear
    elements.clearBtn.classList.toggle('hidden', !url);
    
    // Détecter plateforme
    if (url) {
        const platform = detectPlatform(url);
        if (platform) {
            state.currentPlatform = platform;
            elements.platformName.textContent = `${platform.icon} ${platform.name} détecté`;
            elements.platformDetected.classList.remove('hidden');
        } else {
            elements.platformDetected.classList.add('hidden');
            state.currentPlatform = null;
        }
    } else {
        elements.platformDetected.classList.add('hidden');
        state.currentPlatform = null;
    }
});

// Bouton clear
elements.clearBtn.addEventListener('click', () => {
    elements.videoUrl.value = '';
    elements.clearBtn.classList.add('hidden');
    elements.platformDetected.classList.add('hidden');
    state.currentPlatform = null;
});

// ===== VÉRIFICATION FREE TIME =====
async function checkFreeTime() {
    try {
        const response = await fetch(`${API_URL}/status/${userId}`);
        const data = await response.json();
        
        state.hasFreeTime = data.hasFreeTime;
        state.freeTimeExpires = data.expiresAt;
        
        if (state.hasFreeTime) {
            showFreeTimeCard(data.remainingMinutes);
            elements.adCard.classList.add('hidden');
        } else {
            elements.freeTimeCard.classList.add('hidden');
            elements.adCard.classList.remove('hidden');
        }
        
        return data;
    } catch (error) {
        console.error('Erreur check free time:', error);
        return { hasFreeTime: false };
    }
}

// ===== AFFICHAGE TIMER =====
function showFreeTimeCard(minutes) {
    elements.freeTimeCard.classList.remove('hidden');
    updateTimer(minutes);
    
    // Mettre à jour le timer chaque minute
    if (state.timerInterval) clearInterval(state.timerInterval);
    
    state.timerInterval = setInterval(async () => {
        const data = await checkFreeTime();
        if (!data.hasFreeTime) {
            clearInterval(state.timerInterval);
            elements.freeTimeCard.classList.add('hidden');
            elements.adCard.classList.remove('hidden');
        }
    }, 60000); // Chaque minute
}

function updateTimer(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    elements.timeRemaining.textContent = `${hours}h ${mins}min`;
}

// ===== TÉLÉCHARGEMENT =====
elements.downloadBtn.addEventListener('click', async () => {
    const url = elements.videoUrl.value.trim();
    
    // Validation
    if (!url) {
        showMessage('error', 'Veuillez entrer une URL valide');
        return;
    }
    
    if (!state.currentPlatform) {
        showMessage('error', 'Plateforme non supportée. Utilisez TikTok, Instagram ou Pinterest.');
        return;
    }
    
    // Vérifier free time
    const status = await checkFreeTime();
    
    if (!status.hasFreeTime) {
        showMessage('warning', 'Regardez une pub pour débloquer 2h de téléchargements gratuits 🎁');
        highlightAdCard();
        return;
    }
    
    // Lancer le téléchargement
    await downloadVideo(url);
});

async function downloadVideo(url) {
    if (state.isLoading) return;
    
    state.isLoading = true;
    setLoadingState(true, 'Préparation du téléchargement...');
    hideMessage();
    
    try {
        const response = await fetch(`${API_URL}/download`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: userId,
                url: url,
                platform: state.currentPlatform.key
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Erreur lors du téléchargement');
        }
        
        if (data.success) {
            setLoadingState(true, 'Téléchargement en cours...');
            
            // Simuler progression
            setTimeout(() => {
                setLoadingState(true, 'Envoi de la vidéo...');
            }, 1500);
            
            setTimeout(() => {
                setLoadingState(false);
                showMessage('success', '✅ Vidéo envoyée avec succès ! Vérifiez vos messages Telegram.');
                
                // Vibration si disponible
                if (tg?.HapticFeedback) {
                    tg.HapticFeedback.notificationOccurred('success');
                }
                
                // Reset après 3 secondes
                setTimeout(() => {
                    elements.videoUrl.value = '';
                    elements.clearBtn.classList.add('hidden');
                    elements.platformDetected.classList.add('hidden');
                    hideMessage();
                }, 3000);
            }, 3000);
        }
        
    } catch (error) {
        setLoadingState(false);
        showMessage('error', error.message || 'Une erreur est survenue');
        
        if (tg?.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred('error');
        }
    } finally {
        state.isLoading = false;
    }
}

// ===== ADSGRAM & MONETAG (Dual System) =====
elements.watchAdBtn.addEventListener('click', () => {
    showAd();
});

async function showAd() {
    // Désactiver le bouton pendant le chargement
    elements.watchAdBtn.disabled = true;
    elements.watchAdBtn.textContent = 'Chargement...';

    // 1. Essayer ADSGRAM en premier
    const adsgramSuccess = await tryAdsGram();
    
    // 2. Si AdsGram échoue (pas de pub), essayer Monetag
    if (!adsgramSuccess) {
        console.log('🔄 AdsGram épuisé, passage à Monetag...');
        await tryMonetag();
    }
    
    // Réactiver le bouton
    elements.watchAdBtn.disabled = false;
    elements.watchAdBtn.textContent = '▶️ Regarder une publicité (2h gratuites)';
}

// ===== ADSGRAM (inchangé) =====
async function tryAdsGram() {
    if (typeof window.Adsgram === 'undefined') {
        console.warn('AdsGram SDK non chargé');
        return false; // Passer à Monetag
    }
    
    try {
        const AdController = window.Adsgram.init({ 
            blockId: ADSGRAM_BLOCK_ID,
            debug: false
        });
        
        // Attendre le résultat
        const result = await AdController.show();
        
        console.log('✅ AdsGram réussi', result);
        
        if (tg?.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred('success');
        }
        
        // Succès -> enregistrer la vue
        await registerAdView();
        return true; // AdsGram a fonctionné
        
    } catch (error) {
        console.log('⚠️ AdsGram échoué:', error.message);
        
        // Si pas de pub disponible -> retourner false pour essayer Monetag
        if (error.message === 'No ads available') {
            showMessage('info', '🔄 Aucune pub AdsGram, tentative avec Monetag...');
            return false;
        }
        
        // Autres erreurs (fermé par user, etc.)
        if (error.message === 'Ad closed by user') {
            showMessage('warning', 'Vous devez regarder la pub jusqu\'au bout');
        } else {
            showMessage('error', 'Erreur AdsGram. Passage à l\'alternative...');
        }
        
        return false;
    }
}

// ===== MONETAG (nouveau) =====
async function tryMonetag() {
    // Vérifier si Monetag est chargé
    if (typeof window.show_10408630 === 'undefined') {
        console.error('Monetag SDK non chargé');
        showMessage('error', '❌ Aucune publicité disponible sur les deux réseaux');
        return;
    }
    
    try {
        // Afficher la pub Monetag
        await window.show_10408630();
        
        console.log('✅ Monetag réussi');
        
        if (tg?.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred('success');
        }
        
        // Même récompense que AdsGram
        await registerAdView();
        
    } catch (error) {
        console.error('❌ Monetag échoué:', error);
        showMessage('error', '❌ Aucune pub disponible. Réessayez plus tard.');
        
        if (tg?.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred('warning');
        }
    }
}

// ===== Fonction registerAdView (inchangée) =====
async function registerAdView() {
    try {
        const response = await fetch(`${API_URL}/watch-ad`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId: userId })
        });
        
        const data = await response.json();
        
        if (data.success) {
            state.hasFreeTime = true;
            state.freeTimeExpires = data.freeUntil;
            
            elements.adCard.classList.add('hidden');
            showFreeTimeCard(120); // 2h = 120 minutes
            
            showMessage('success', '🎉 Super ! Vous avez 2h de téléchargements gratuits !');
            
            setTimeout(() => {
                hideMessage();
            }, 3000);
        } else {
            showMessage('error', 'Erreur lors de l\'activation. Réessayez.');
        }
    } catch (error) {
        console.error('❌ Erreur enregistrement pub:', error);
        showMessage('error', 'Erreur lors de l\'activation. Vérifiez votre connexion.');
    }
}


// ===== UI HELPERS =====
function setLoadingState(loading, text = '') {
    elements.downloadBtn.disabled = loading;
    elements.loadingState.classList.toggle('hidden', !loading);
    
    if (text) {
        elements.loadingText.textContent = text;
    }
}

function showMessage(type, text) {
    elements.message.classList.remove('hidden', 'success', 'error', 'warning');
    elements.message.classList.add(type);
    elements.messageText.textContent = text;
    
    // Changer l'icône selon le type
    const iconPaths = {
        success: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
        error: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z',
        warning: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z'
    };
    
    elements.messageIcon.innerHTML = `<path d="${iconPaths[type]}" fill="currentColor"/>`;
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

// ===== INITIALISATION =====
async function init() {
    console.log('🚀 Initialisation de l\'app...');
    
    // Vérifier le statut free time
    await checkFreeTime();
    
    // Configuration Telegram
    if (tg) {
        // Configurer le thème
        document.documentElement.style.setProperty('--tg-theme-bg-color', tg.backgroundColor || '#0a0a0a');
        document.documentElement.style.setProperty('--tg-theme-text-color', tg.textColor || '#ffffff');
        
        // Bouton back
        tg.BackButton.onClick(() => {
            tg.close();
        });
    }
    
    console.log('✅ App prête !');
}

// Lancer l'app
init();