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
    qualitySelector: document.getElementById('qualitySelector'),
    qualitySelect: document.getElementById('qualitySelect'),
    formatSelector: document.getElementById('formatSelector'),
    formatSelect: document.getElementById('formatSelect'),
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
    selectedQuality: '720p',
    selectedFormat: 'mp4',
    timerInterval: null
};

// ===== DÉTECTION PLATEFORME =====
const platforms = {
    tiktok: {
        regex: /(tiktok\.com|vm\.tiktok\.com)/i,
        name: 'TikTok',
        icon: '🎵',
        qualities: ['HD'], // TikTok n'a qu'une qualité HD
        formats: ['mp4']
    },
    instagram: {
        regex: /(instagram\.com|instagr\.am|ig\.me)/i,
        name: 'Instagram',
        icon: '📸',
        qualities: ['Auto'], // Instagram détermine automatiquement
        formats: ['mp4']
    },
    pinterest: {
        regex: /(pinterest\.com|pinterest\.fr|pinterest\.ca|pin\.it)/i,
        name: 'Pinterest',
        icon: '📌',
        qualities: ['Auto'],
        formats: ['mp4']
    },
    youtube: {
        regex: /(youtube\.com|youtu\.be)/i,
        name: 'YouTube',
        icon: '🎥',
        qualities: ['360p', '480p', '720p', '1080p', '1440p', '2160p'],
        formats: ['mp4', 'mp3']
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
            
            // Afficher les options de qualité/format selon la plateforme
            updateQualityOptions(platform);
        } else {
            elements.platformDetected.classList.add('hidden');
            hideQualityOptions();
            state.currentPlatform = null;
        }
    } else {
        elements.platformDetected.classList.add('hidden');
        hideQualityOptions();
        state.currentPlatform = null;
    }
});

// Bouton clear
elements.clearBtn.addEventListener('click', () => {
    elements.videoUrl.value = '';
    elements.clearBtn.classList.add('hidden');
    elements.platformDetected.classList.add('hidden');
    hideQualityOptions();
    state.currentPlatform = null;
});

// ===== GESTION QUALITÉ/FORMAT =====
function updateQualityOptions(platform) {
    // Afficher les sélecteurs seulement pour YouTube
    if (platform.key === 'youtube') {
        // Remplir les options de qualité
        elements.qualitySelect.innerHTML = platform.qualities
            .map(q => `<option value="${q.toLowerCase()}" ${q === '720p' ? 'selected' : ''}>${q}</option>`)
            .join('');
        
        // Remplir les options de format
        elements.formatSelect.innerHTML = platform.formats
            .map(f => `<option value="${f}" ${f === 'mp4' ? 'selected' : ''}>${f.toUpperCase()}</option>`)
            .join('');
        
        elements.qualitySelector.classList.remove('hidden');
        elements.formatSelector.classList.remove('hidden');
        
        // Mettre à jour l'état
        state.selectedQuality = '720p';
        state.selectedFormat = 'mp4';
    } else {
        hideQualityOptions();
    }
}

function hideQualityOptions() {
    elements.qualitySelector.classList.add('hidden');
    elements.formatSelector.classList.add('hidden');
}

// Écouter les changements de qualité/format
elements.qualitySelect?.addEventListener('change', (e) => {
    state.selectedQuality = e.target.value;
    console.log('Qualité sélectionnée:', state.selectedQuality);
});

elements.formatSelect?.addEventListener('change', (e) => {
    state.selectedFormat = e.target.value;
    console.log('Format sélectionné:', state.selectedFormat);
    
    // Si MP3 est sélectionné, masquer les options de qualité
    if (e.target.value === 'mp3') {
        elements.qualitySelector.classList.add('hidden');
    } else {
        elements.qualitySelector.classList.remove('hidden');
    }
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
        showMessage('error', 'Plateforme non supportée. Utilisez TikTok, Instagram, Pinterest ou YouTube.');
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
    
    // Message de chargement adapté selon la plateforme et format
    let loadingMsg = 'Préparation du téléchargement...';
    if (state.currentPlatform.key === 'youtube') {
        if (state.selectedFormat === 'mp3') {
            loadingMsg = 'Extraction audio en cours...';
        } else {
            loadingMsg = `Téléchargement ${state.selectedQuality} en cours...`;
        }
    }
    
    setLoadingState(true, loadingMsg);
    hideMessage();
    
    try {
        const requestBody = {
            userId: userId,
            url: url,
            platform: state.currentPlatform.key
        };
        
        // Ajouter les options YouTube si applicable
        if (state.currentPlatform.key === 'youtube') {
            requestBody.quality = state.selectedQuality;
            requestBody.format = state.selectedFormat;
        }
        
        const response = await fetch(`${API_URL}/download`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Erreur lors du téléchargement');
        }
        
        if (data.success) {
            // Messages de progression selon le type
            if (state.currentPlatform.key === 'youtube' && state.selectedFormat === 'mp3') {
                setLoadingState(true, 'Conversion en MP3...');
                setTimeout(() => {
                    setLoadingState(true, 'Envoi du fichier audio...');
                }, 2000);
            } else {
                setLoadingState(true, 'Téléchargement en cours...');
                setTimeout(() => {
                    setLoadingState(true, 'Optimisation vidéo...');
                }, 1500);
                setTimeout(() => {
                    setLoadingState(true, 'Envoi vers Telegram...');
                }, 3000);
            }
            
            setTimeout(() => {
                setLoadingState(false);
                
                let successMsg = '✅ Vidéo envoyée avec succès !';
                if (state.currentPlatform.key === 'youtube' && state.selectedFormat === 'mp3') {
                    successMsg = '✅ Audio MP3 envoyé avec succès !';
                } else if (state.currentPlatform.key === 'youtube') {
                    successMsg = `✅ Vidéo ${state.selectedQuality} envoyée avec succès !`;
                }
                
                showMessage('success', successMsg + ' Vérifiez vos messages Telegram.');
                
                // Vibration si disponible
                if (tg?.HapticFeedback) {
                    tg.HapticFeedback.notificationOccurred('success');
                }
                
                // Reset après 3 secondes
                setTimeout(() => {
                    elements.videoUrl.value = '';
                    elements.clearBtn.classList.add('hidden');
                    elements.platformDetected.classList.add('hidden');
                    hideQualityOptions();
                    hideMessage();
                }, 3000);
            }, state.selectedFormat === 'mp3' ? 3000 : 4500);
        }
        
    } catch (error) {
        setLoadingState(false);
        
        let errorMsg = error.message || 'Une erreur est survenue';
        
        // Messages d'erreur personnalisés
        if (errorMsg.includes('yt-dlp')) {
            errorMsg = 'Erreur YouTube : Le serveur ne peut pas télécharger cette vidéo pour le moment.';
        } else if (errorMsg.includes('Pinterest')) {
            errorMsg = 'Cette vidéo Pinterest ne peut pas être téléchargée. Vérifiez que c\'est bien une vidéo.';
        } else if (errorMsg.includes('Instagram')) {
            errorMsg = 'Vidéo Instagram introuvable. Le compte est peut-être privé.';
        }
        
        showMessage('error', errorMsg);
        
        if (tg?.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred('error');
        }
    } finally {
        state.isLoading = false;
    }
}

// ===== ADSGRAM (Version 2024 mise à jour) =====
elements.watchAdBtn.addEventListener('click', () => {
    showAd();
});

function showAd() {
    // Vérifier si AdsGram est chargé
    if (typeof window.Adsgram === 'undefined') {
        console.error('AdsGram SDK non chargé');
        showMessage('error', 'Erreur de chargement de la publicité. Réessayez.');
        return;
    }
    
    try {
        // Nouvelle méthode AdsGram (2024)
        const AdController = window.Adsgram.init({ 
            blockId: ADSGRAM_BLOCK_ID,
            debug: false,
            debugBannerType: 'FullscreenMedia'
        });
        
        // Afficher la pub
        AdController.show().then((result) => {
            // Pub vue avec succès
            console.log('✅ Pub vue avec succès', result);
            
            if (tg?.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }
            
            // Enregistrer côté serveur
            registerAdView();
            
        }).catch((error) => {
            // Pub fermée prématurément ou erreur
            console.log('⚠️ Pub non terminée:', error);
            
            if (error.message === 'Ad closed by user') {
                showMessage('warning', 'Vous devez regarder la pub jusqu\'à la fin pour débloquer 2h gratuit');
            } else if (error.message === 'No ads available') {
                showMessage('error', 'Aucune pub disponible pour le moment. Réessayez dans quelques secondes.');
            } else {
                showMessage('error', 'Erreur lors du chargement de la pub. Réessayez.');
            }
            
            if (tg?.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('warning');
            }
        });
        
    } catch (error) {
        console.error('❌ Erreur AdsGram:', error);
        showMessage('error', 'Erreur lors de l\'initialisation de la publicité.');
    }
}

// Fonction pour enregistrer la vue de pub
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
    
    // Désactiver aussi les sélecteurs pendant le chargement
    if (elements.qualitySelect) elements.qualitySelect.disabled = loading;
    if (elements.formatSelect) elements.formatSelect.disabled = loading;
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

// ===== DÉTECTION CAPACITÉS SERVEUR =====
async function checkServerCapabilities() {
    try {
        const response = await fetch(`${API_URL}/capabilities`);
        const data = await response.json();
        
        console.log('📊 Capacités serveur:', data);
        
        // Afficher un badge si FFmpeg est disponible
        if (data.ffmpeg) {
            console.log('✅ FFmpeg disponible - Qualité optimale activée');
        }
        
        if (data.ytdlp) {
            console.log('✅ yt-dlp disponible - YouTube haute qualité activé');
        }
        
        return data;
    } catch (error) {
        console.warn('⚠️ Impossible de vérifier les capacités serveur');
        return { ffmpeg: false, ytdlp: false };
    }
}

// ===== INITIALISATION =====
async function init() {
    console.log('🚀 Initialisation de l\'app...');
    
    // Vérifier le statut free time
    await checkFreeTime();
    
    // Vérifier les capacités du serveur
    await checkServerCapabilities();
    
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