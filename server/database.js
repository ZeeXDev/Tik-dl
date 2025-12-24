// ===== IMPORTS =====
const fs = require('fs');
const path = require('path');

// ===== CONFIGURATION =====
const DB_FILE = path.join(__dirname, 'users.json');

// ===== INITIALISATION =====
function initDatabase() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({}, null, 2));
        console.log('📦 Base de données créée: users.json');
    }
}

initDatabase();

// ===== LECTURE BASE =====
function readDatabase() {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Erreur lecture DB:', error);
        return {};
    }
}

// ===== ÉCRITURE BASE =====
function writeDatabase(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Erreur écriture DB:', error);
        return false;
    }
}

// ===== GET USER =====
async function getUser(userId) {
    const db = readDatabase();
    return db[userId] || null;
}

// ===== CREATE/UPDATE USER =====
async function createOrUpdateUser(userId, userData) {
    const db = readDatabase();
    
    if (!db[userId]) {
        // Créer nouvel utilisateur
        db[userId] = {
            userId: userId,
            createdAt: new Date().toISOString(),
            freeUntil: null,
            totalDownloads: 0,
            adsWatched: 0,
            ...userData
        };
    } else {
        // Mettre à jour
        db[userId] = {
            ...db[userId],
            ...userData,
            updatedAt: new Date().toISOString()
        };
    }
    
    writeDatabase(db);
    return db[userId];
}

// ===== UPDATE FREE TIME =====
async function updateUserFreeTime(userId, freeUntil) {
    const db = readDatabase();
    
    if (!db[userId]) {
        db[userId] = {
            userId: userId,
            createdAt: new Date().toISOString(),
            freeUntil: freeUntil.toISOString(),
            totalDownloads: 0,
            adsWatched: 1
        };
    } else {
        db[userId].freeUntil = freeUntil.toISOString();
        db[userId].adsWatched = (db[userId].adsWatched || 0) + 1;
        db[userId].updatedAt = new Date().toISOString();
    }
    
    writeDatabase(db);
    console.log(`💾 User ${userId} - Free until: ${freeUntil.toISOString()}`);
    
    return db[userId];
}

// ===== CHECK FREE TIME =====
async function checkFreeTime(userId) {
    const user = await getUser(userId);
    
    if (!user || !user.freeUntil) {
        return false;
    }
    
    const now = new Date();
    const expiresAt = new Date(user.freeUntil);
    
    return expiresAt > now;
}

// ===== INCREMENT DOWNLOADS =====
async function incrementDownloads(userId) {
    const db = readDatabase();
    
    if (db[userId]) {
        db[userId].totalDownloads = (db[userId].totalDownloads || 0) + 1;
        db[userId].lastDownload = new Date().toISOString();
        writeDatabase(db);
    }
}

// ===== GET STATS =====
async function getStats() {
    const db = readDatabase();
    const users = Object.values(db);
    
    return {
        totalUsers: users.length,
        totalDownloads: users.reduce((sum, u) => sum + (u.totalDownloads || 0), 0),
        totalAdsWatched: users.reduce((sum, u) => sum + (u.adsWatched || 0), 0),
        activeUsers: users.filter(u => {
            if (!u.freeUntil) return false;
            const expiresAt = new Date(u.freeUntil);
            return expiresAt > new Date();
        }).length
    };
}

// ===== GET ALL USERS =====
async function getAllUsers() {
    const db = readDatabase();
    return Object.values(db);
}

// ===== DELETE USER =====
async function deleteUser(userId) {
    const db = readDatabase();
    
    if (db[userId]) {
        delete db[userId];
        writeDatabase(db);
        return true;
    }
    
    return false;
}

// ===== CLEAN EXPIRED USERS =====
async function cleanExpiredUsers(daysOld = 30) {
    const db = readDatabase();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    let cleaned = 0;
    
    for (let userId in db) {
        const user = db[userId];
        const lastActivity = user.updatedAt || user.createdAt;
        
        if (new Date(lastActivity) < cutoffDate) {
            delete db[userId];
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        writeDatabase(db);
        console.log(`🧹 ${cleaned} utilisateurs inactifs supprimés`);
    }
    
    return cleaned;
}

// ===== BACKUP DATABASE =====
function backupDatabase() {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(__dirname, `users_backup_${timestamp}.json`);
        
        fs.copyFileSync(DB_FILE, backupFile);
        console.log(`💾 Backup créé: ${backupFile}`);
        
        return backupFile;
    } catch (error) {
        console.error('Erreur backup:', error);
        return null;
    }
}

// ===== AUTO BACKUP (chaque jour) =====
setInterval(() => {
    backupDatabase();
}, 24 * 60 * 60 * 1000); // 24h

// ===== AUTO CLEAN (chaque semaine) =====
setInterval(() => {
    cleanExpiredUsers(30);
}, 7 * 24 * 60 * 60 * 1000); // 7 jours

// ===== EXPORTS =====
module.exports = {
    getUser,
    createOrUpdateUser,
    updateUserFreeTime,
    checkFreeTime,
    incrementDownloads,
    getStats,
    getAllUsers,
    deleteUser,
    cleanExpiredUsers,
    backupDatabase
};