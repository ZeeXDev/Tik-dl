// ===== IMPORTS =====
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const { downloadVideo } = require('./downloader');
const { getUser, updateUserFreeTime, checkFreeTime } = require('./database');

// ===== CONFIGURATION =====
const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://tik-dl1.vercel.app/';

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== BOT TELEGRAM =====
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('🤖 Bot Telegram démarré...');

// Commande /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name || 'utilisateur';
    
    const keyboard = {
        inline_keyboard: [
            [
                {
                    text: '🚀 Ouvrir Video Downloader',
                    web_app: { url: WEBAPP_URL }
                }
            ]
        ]
    };
    
    bot.sendMessage(
        chatId,
        `👋 Salut ${firstName} !\n\n` +
        `Bienvenue sur **Video Downloader** 🎥\n\n` +
        `Je peux télécharger des vidéos depuis :\n` +
        `🎵 TikTok\n` +
        `📸 Instagram\n` +
        `📌 Pinterest\n\n` +
        `Clique sur le bouton ci-dessous pour commencer !`,
        {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        }
    );
});

// Commande /help
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    
    bot.sendMessage(
        chatId,
        `📖 **Aide Video Downloader**\n\n` +
        `**Comment ça marche ?**\n` +
        `1️⃣ Ouvre l'application\n` +
        `2️⃣ Regarde une pub pour 2h gratuit\n` +
        `3️⃣ Colle le lien de ta vidéo\n` +
        `4️⃣ Clique sur Télécharger\n` +
        `5️⃣ Je t'envoie la vidéo ici !\n\n` +
        `**Plateformes supportées :**\n` +
        `✅ TikTok\n` +
        `✅ Instagram\n` +
        `✅ Pinterest\n\n` +
        `**Besoin d'aide ?** Contacte @kingcey`,
        { parse_mode: 'Markdown' }
    );
});

// ===== API ROUTES =====

// GET /api/status/:userId - Vérifier le statut free time
app.get('/api/status/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await getUser(userId);
        
        if (!user || !user.freeUntil) {
            return res.json({
                hasFreeTime: false,
                remainingMinutes: 0
            });
        }
        
        const now = new Date();
        const expiresAt = new Date(user.freeUntil);
        
        if (expiresAt > now) {
            const remainingMs = expiresAt - now;
            const remainingMinutes = Math.floor(remainingMs / 60000);
            
            return res.json({
                hasFreeTime: true,
                expiresAt: user.freeUntil,
                remainingMinutes: remainingMinutes
            });
        } else {
            return res.json({
                hasFreeTime: false,
                remainingMinutes: 0
            });
        }
        
    } catch (error) {
        console.error('Erreur status:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
});

// POST /api/watch-ad - Enregistrer qu'une pub a été vue
app.post('/api/watch-ad', async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID manquant'
            });
        }
        
        // Donner 2h de free time
        const freeUntil = new Date(Date.now() + 2 * 60 * 60 * 1000); // +2h
        
        await updateUserFreeTime(userId, freeUntil);
        
        console.log(`✅ User ${userId} a regardé une pub - Free until: ${freeUntil}`);
        
        res.json({
            success: true,
            freeUntil: freeUntil.toISOString(),
            message: '2h de téléchargements activés'
        });
        
    } catch (error) {
        console.error('Erreur watch-ad:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
});

// POST /api/download - Télécharger une vidéo
app.post('/api/download', async (req, res) => {
    try {
        const { userId, url, platform } = req.body;
        
        // Validation
        if (!userId || !url || !platform) {
            return res.status(400).json({
                success: false,
                message: 'Données manquantes'
            });
        }
        
        // Vérifier free time
        const hasFreeTime = await checkFreeTime(userId);
        
        if (!hasFreeTime) {
            return res.status(403).json({
                success: false,
                needsAd: true,
                message: 'Regardez une pub pour continuer'
            });
        }
        
        console.log(`📥 Téléchargement demandé - User: ${userId}, Platform: ${platform}`);
        
        // Répondre immédiatement
        res.json({
            success: true,
            message: 'Téléchargement en cours...'
        });
        
        // Télécharger et envoyer (asynchrone)
        downloadAndSend(userId, url, platform);
        
    } catch (error) {
        console.error('Erreur download:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
});

// ===== FONCTION TÉLÉCHARGEMENT + ENVOI =====
async function downloadAndSend(userId, url, platform) {
    try {
        console.log(`⬇️ Téléchargement ${platform} pour user ${userId}...`);
        
        // Télécharger la vidéo
        const videoPath = await downloadVideo(url, platform);
        
        if (!videoPath) {
            throw new Error('Échec du téléchargement');
        }
        
        console.log(`✅ Vidéo téléchargée: ${videoPath}`);
        
        // Envoyer via bot
        await bot.sendVideo(userId, videoPath, {
            caption: `✅ Voici votre vidéo ${platform.toUpperCase()} !\n\n🎥 Téléchargé avec Video Downloader`,
            supports_streaming: true
        });
        
        console.log(`📤 Vidéo envoyée à ${userId}`);
        
        // Supprimer le fichier temporaire
        const fs = require('fs');
        if (fs.existsSync(videoPath)) {
            fs.unlinkSync(videoPath);
            console.log(`🗑️ Fichier temporaire supprimé`);
        }
        
    } catch (error) {
        console.error('Erreur downloadAndSend:', error);
        
        // Envoyer message d'erreur à l'utilisateur
        bot.sendMessage(
            userId,
            `❌ Désolé, une erreur est survenue lors du téléchargement.\n\n` +
            `Raison possible :\n` +
            `• Vidéo privée ou supprimée\n` +
            `• Lien invalide\n` +
            `• Problème de connexion\n\n` +
            `Réessayez avec un autre lien.`
        );
    }
}

// ===== HEALTH CHECK =====
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        bot: 'running'
    });
});

// ===== ROOT =====
app.get('/', (req, res) => {
    res.json({
        name: 'Video Downloader API',
        version: '1.0.0',
        endpoints: {
            status: 'GET /api/status/:userId',
            watchAd: 'POST /api/watch-ad',
            download: 'POST /api/download'
        }
    });
});

// ===== ERROR HANDLER =====
app.use((error, req, res, next) => {
    console.error('Erreur:', error);
    res.status(500).json({
        success: false,
        message: 'Erreur serveur interne'
    });
});

// ===== DÉMARRAGE SERVEUR =====
app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
    console.log(`📱 WebApp URL: ${WEBAPP_URL}`);
    console.log(`🤖 Bot Token: ${BOT_TOKEN ? '✅' : '❌'}`);
});

// ===== GESTION ERREURS BOT =====
bot.on('polling_error', (error) => {
    console.error('Erreur polling:', error);
});

bot.on('error', (error) => {
    console.error('Erreur bot:', error);
});

// ===== GRACEFUL SHUTDOWN =====
process.on('SIGINT', () => {
    console.log('\n👋 Arrêt du serveur...');
    bot.stopPolling();
    process.exit(0);
});