const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json());

const LICENSE_FILE = path.join(__dirname, 'licenses.json');
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

function readLicenses() {
    try {
        if (!fs.existsSync(LICENSE_FILE)) {
            const initialData = {
                licenses: {},
                scriptVersion: "1.0.0",
                forceUpdate: false,
                updateMessage: "Update available"
            };
            fs.writeFileSync(LICENSE_FILE, JSON.stringify(initialData, null, 2));
            return initialData;
        }
        return JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf8'));
    } catch (error) {
        console.error('❌ Error reading licenses:', error);
        return { licenses: {}, scriptVersion: "1.0.0", forceUpdate: false };
    }
}

function writeLicenses(data) {
    try {
        fs.writeFileSync(LICENSE_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('❌ Error writing licenses:', error);
        return false;
    }
}

function generateLicenseKey() {
    const random1 = crypto.randomBytes(4).toString('hex').toUpperCase();
    const random2 = crypto.randomBytes(4).toString('hex').toUpperCase();
    const random3 = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `MUSIC-${random1}-${random2}-${random3}`;
}

function authenticateAdmin(username, password) {
    return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Roblox test endpoint
app.get('/api/test', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Roblox can reach this server',
        timestamp: new Date().toISOString() 
    });
});

app.post('/api/test', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'POST request received',
        body: req.body,
        timestamp: new Date().toISOString() 
    });
});

// ============================================
// ROBLOX LICENSE VERIFICATION
// ============================================

app.post('/api/license/verify', (req, res) => {
    console.log('📥 Verification request:', req.body);
    
    const { licenseKey, universeId, placeId } = req.body;
    
    if (!licenseKey || !universeId) {
        console.log('❌ Missing parameters');
        return res.status(400).json({ 
            valid: false, 
            error: 'Missing parameters',
            forceStop: true 
        });
    }
    
    const licensesData = readLicenses();
    const license = licensesData.licenses[licenseKey];
    
    if (!license) {
        console.log(`❌ Invalid license: ${licenseKey}`);
        return res.status(401).json({ 
            valid: false, 
            error: 'Invalid license key',
            forceStop: true 
        });
    }
    
    if (!license.active) {
        console.log(`⚠️ Disabled license: ${licenseKey}`);
        return res.status(401).json({ 
            valid: false, 
            error: 'License disabled',
            forceStop: true 
        });
    }
    
    if (license.expiryDate && new Date(license.expiryDate) < new Date()) {
        console.log(`⏰ Expired license: ${licenseKey}`);
        return res.status(401).json({ 
            valid: false, 
            error: 'License expired',
            forceStop: true 
        });
    }
    
    // HWID Lock
    if (!license.universeId) {
        license.universeId = universeId;
        license.firstActivation = new Date().toISOString();
        writeLicenses(licensesData);
        console.log(`🔒 License ${licenseKey} locked to ${universeId}`);
    }
    
    if (license.universeId !== universeId) {
        console.log(`🚫 HWID mismatch: ${licenseKey}`);
        return res.status(401).json({ 
            valid: false, 
            error: 'License used in another game',
            forceStop: true 
        });
    }
    
    license.lastVerified = new Date().toISOString();
    license.verificationCount = (license.verificationCount || 0) + 1;
    if (placeId) license.placeId = placeId;
    writeLicenses(licensesData);
    
    console.log(`✅ License verified: ${licenseKey} | ${license.owner}`);
    
    res.json({ 
        valid: true,
        owner: license.owner,
        expiryDate: license.expiryDate || null,
        scriptVersion: licensesData.scriptVersion,
        forceUpdate: licensesData.forceUpdate || false,
        message: 'License verified'
    });
});

app.get('/api/script/version', (req, res) => {
    const licensesData = readLicenses();
    res.json({
        version: licensesData.scriptVersion,
        forceUpdate: licensesData.forceUpdate || false,
        updateMessage: licensesData.updateMessage || 'Update available'
    });
});

// ============================================
// ADMIN PANEL
// ============================================

app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>License Admin Panel</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', system-ui, sans-serif;
            background: #0a0e27;
            min-height: 100vh;
            padding: 20px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 30px;
            border-radius: 16px;
            margin-bottom: 30px;
            text-align: center;
        }
        .header h1 { color: white; font-size: 32px; margin-bottom: 8px; }
        .header p { color: rgba(255,255,255,0.9); font-size: 14px; }
        
        .login-box, .main-panel {
            background: rgba(15, 23, 42, 0.8);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(139, 92, 246, 0.3);
            border-radius: 16px;
            padding: 30px;
        }
        
        .form-group { margin-bottom: 20px; }
        label { display: block; color: #cbd5e1; font-size: 14px; font-weight: 500; margin-bottom: 8px; }
        input, select {
            width: 100%;
            padding: 12px 16px;
            background: rgba(15, 23, 42, 0.6);
            border: 2px solid rgba(139, 92, 246, 0.2);
            border-radius: 10px;
            color: #ffffff;
            font-size: 15px;
            outline: none;
        }
        input:focus, select:focus { border-color: #8b5cf6; }
        
        button {
            padding: 12px 24px;
            background: linear-gradient(135deg, #8b5cf6, #3b82f6);
            border: none;
            border-radius: 10px;
            color: white;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
        }
        button:hover { transform: translateY(-2px); }
        button.secondary {
            background: rgba(139, 92, 246, 0.2);
            border: 1px solid rgba(139, 92, 246, 0.3);
        }
        button.danger { background: linear-gradient(135deg, #ef4444, #dc2626); }
        
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: rgba(139, 92, 246, 0.1);
            border: 1px solid rgba(139, 92, 246, 0.2);
            border-radius: 12px;
            padding: 20px;
        }
        .stat-value { color: #8b5cf6; font-size: 32px; font-weight: 700; }
        .stat-label { color: #94a3b8; font-size: 14px; margin-top: 4px; }
        
        .section {
            background: rgba(15, 23, 42, 0.4);
            border: 1px solid rgba(139, 92, 246, 0.2);
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 20px;
        }
        .section h2 { color: #ffffff; font-size: 20px; margin-bottom: 20px; }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid rgba(139, 92, 246, 0.1);
        }
        th { color: #8b5cf6; font-weight: 600; font-size: 14px; }
        td { color: #cbd5e1; font-size: 14px; }
        
        .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
        }
        .badge.active { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
        .badge.inactive { background: rgba(239, 68, 68, 0.2); color: #f87171; }
        .badge.locked { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
        
        .btn-group { display: flex; gap: 8px; }
        .btn-small {
            padding: 6px 12px;
            font-size: 13px;
            background: rgba(139, 92, 246, 0.2);
            border: 1px solid rgba(139, 92, 246, 0.3);
            color: #a78bfa;
        }
        
        .alert {
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: none;
        }
        .alert.success {
            background: rgba(34, 197, 94, 0.1);
            border: 1px solid rgba(34, 197, 94, 0.3);
            color: #4ade80;
        }
        .alert.error {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: #f87171;
        }
        
        .hidden { display: none; }
        
        .copy-btn {
            margin-left: 8px;
            padding: 4px 8px;
            font-size: 12px;
            background: rgba(139, 92, 246, 0.2);
            cursor: pointer;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎵 Music License System</h1>
            <p>Admin Control Panel</p>
        </div>
        
        <div id="loginBox" class="login-box">
            <form id="loginForm">
                <div class="form-group">
                    <label>Username</label>
                    <input type="text" id="username" required>
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" id="password" required>
                </div>
                <button type="submit">Login</button>
                <div class="alert error" id="loginError">Invalid credentials</div>
            </form>
        </div>
        
        <div id="mainPanel" class="hidden">
            <div class="alert success" id="successAlert"></div>
            <div class="alert error" id="errorAlert"></div>
            
            <div class="stats">
                <div class="stat-card">
                    <div class="stat-value" id="totalLicenses">0</div>
                    <div class="stat-label">Total Licenses</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="activeLicenses">0</div>
                    <div class="stat-label">Active</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="lockedLicenses">0</div>
                    <div class="stat-label">Locked</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="scriptVersion">1.0.0</div>
                    <div class="stat-label">Version</div>
                </div>
            </div>
            
            <div class="section">
                <h2>➕ Create New License</h2>
                <form id="createForm">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                        <div class="form-group">
                            <label>Owner Name</label>
                            <input type="text" id="owner" required>
                        </div>
                        <div class="form-group">
                            <label>Expiry (Days) - 0 = Lifetime</label>
                            <input type="number" id="expiryDays" value="0" min="0">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Notes (Optional)</label>
                        <input type="text" id="notes" placeholder="e.g., Discord: user#1234">
                    </div>
                    <button type="submit">Create License</button>
                </form>
            </div>
            
            <div class="section">
                <h2>📦 Script Version</h2>
                <form id="versionForm">
                    <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 16px; align-items: end;">
                        <div class="form-group">
                            <label>Version</label>
                            <input type="text" id="version" value="1.0.0" required>
                        </div>
                        <div class="form-group">
                            <label>Update Message</label>
                            <input type="text" id="updateMessage" value="New update available">
                        </div>
                        <div class="form-group">
                            <label style="display: flex; align-items: center; gap: 8px;">
                                <input type="checkbox" id="forceUpdate" style="width: auto;">
                                Force Update
                            </label>
                        </div>
                    </div>
                    <button type="submit">Update Version</button>
                </form>
            </div>
            
            <div class="section">
                <h2>📋 All Licenses</h2>
                <table>
                    <thead>
                        <tr>
                            <th>License Key</th>
                            <th>Owner</th>
                            <th>Status</th>
                            <th>Universe ID</th>
                            <th>Expiry</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="licensesTable">
                        <tr><td colspan="6" style="text-align: center; color: #64748b;">No licenses yet</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    
    <script>
        let token = null;
        
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            
            try {
                const response = await fetch('/api/admin/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    token = data.token;
                    document.getElementById('loginBox').classList.add('hidden');
                    document.getElementById('mainPanel').classList.remove('hidden');
                    loadLicenses();
                } else {
                    document.getElementById('loginError').style.display = 'block';
                }
            } catch (err) {
                document.getElementById('loginError').style.display = 'block';
            }
        });
        
        document.getElementById('createForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const owner = document.getElementById('owner').value;
            const expiryDays = parseInt(document.getElementById('expiryDays').value);
            const notes = document.getElementById('notes').value;
            
            try {
                const response = await fetch('/api/admin/licenses/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, owner, expiryDays, notes })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showSuccess('License created: ' + data.licenseKey);
                    document.getElementById('createForm').reset();
                    loadLicenses();
                    navigator.clipboard.writeText(data.licenseKey);
                } else {
                    showError(data.error || 'Failed to create');
                }
            } catch (err) {
                showError('Error creating license');
            }
        });
        
        document.getElementById('versionForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const version = document.getElementById('version').value;
            const updateMessage = document.getElementById('updateMessage').value;
            const forceUpdate = document.getElementById('forceUpdate').checked;
            
            try {
                const response = await fetch('/api/admin/version/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, version, forceUpdate, updateMessage })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showSuccess('Version updated!');
                    loadLicenses();
                } else {
                    showError(data.error || 'Failed to update');
                }
            } catch (err) {
                showError('Error updating version');
            }
        });
        
        async function loadLicenses() {
            try {
                const response = await fetch('/api/admin/licenses?token=' + encodeURIComponent(token));
                const data = await response.json();
                
                if (data.success) {
                    const licenses = data.licenses;
                    
                    document.getElementById('totalLicenses').textContent = licenses.length;
                    document.getElementById('activeLicenses').textContent = licenses.filter(l => l.active).length;
                    document.getElementById('lockedLicenses').textContent = licenses.filter(l => l.universeId).length;
                    document.getElementById('scriptVersion').textContent = data.scriptVersion;
                    
                    const tbody = document.getElementById('licensesTable');
                    if (licenses.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #64748b;">No licenses yet</td></tr>';
                    } else {
                        tbody.innerHTML = licenses.map(license => {
                            const expiry = license.expiryDate ? new Date(license.expiryDate).toLocaleDateString() : 'Lifetime';
                            const status = license.active ? '<span class="badge active">Active</span>' : '<span class="badge inactive">Inactive</span>';
                            const hwid = license.universeId ? '<span class="badge locked">' + license.universeId + '</span>' : '<span style="color: #64748b;">Not locked</span>';
                            
                            return \`
                                <tr>
                                    <td>
                                        <code style="background: rgba(139, 92, 246, 0.1); padding: 4px 8px; border-radius: 4px; color: #a78bfa; font-size: 12px;">\${license.licenseKey}</code>
                                        <button class="copy-btn" onclick="copyText('\${license.licenseKey}')">Copy</button>
                                    </td>
                                    <td>\${license.owner}</td>
                                    <td>\${status}</td>
                                    <td>\${hwid}</td>
                                    <td>\${expiry}</td>
                                    <td>
                                        <div class="btn-group">
                                            <button class="btn-small" onclick="toggleLicense('\${license.licenseKey}')">Toggle</button>
                                            \${license.universeId ? \`<button class="btn-small" onclick="resetHWID('\${license.licenseKey}')">Reset HWID</button>\` : ''}
                                            <button class="btn-small danger" onclick="deleteLicense('\${license.licenseKey}')">Delete</button>
                                        </div>
                                    </td>
                                </tr>
                            \`;
                        }).join('');
                    }
                }
            } catch (err) {
                console.error('Error loading licenses:', err);
            }
        }
        
        async function toggleLicense(licenseKey) {
            try {
                const response = await fetch('/api/admin/licenses/toggle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, licenseKey })
                });
                
                const data = await response.json();
                if (data.success) {
                    showSuccess('License toggled!');
                    loadLicenses();
                }
            } catch (err) {
                showError('Error toggling license');
            }
        }
        
        async function resetHWID(licenseKey) {
            if (!confirm('Reset HWID for this license?')) return;
            
            try {
                const response = await fetch('/api/admin/licenses/reset-hwid', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, licenseKey })
                });
                
                const data = await response.json();
                if (data.success) {
                    showSuccess('HWID reset!');
                    loadLicenses();
                }
            } catch (err) {
                showError('Error resetting HWID');
            }
        }
        
        async function deleteLicense(licenseKey) {
            if (!confirm('Delete license: ' + licenseKey + '?')) return;
            
            try {
                const response = await fetch('/api/admin/licenses/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, licenseKey })
                });
                
                const data = await response.json();
                if (data.success) {
                    showSuccess('License deleted!');
                    loadLicenses();
                }
            } catch (err) {
                showError('Error deleting license');
            }
        }
        
        function copyText(text) {
            navigator.clipboard.writeText(text);
            showSuccess('Copied: ' + text);
        }
        
        function showSuccess(msg) {
            const alert = document.getElementById('successAlert');
            alert.textContent = msg;
            alert.style.display = 'block';
            setTimeout(() => alert.style.display = 'none', 3000);
        }
        
        function showError(msg) {
            const alert = document.getElementById('errorAlert');
            alert.textContent = msg;
            alert.style.display = 'block';
            setTimeout(() => alert.style.display = 'none', 3000);
        }
    </script>
</body>
</html>`);
});

app.post('/api/admin/auth', (req, res) => {
    const { username, password } = req.body;
    
    if (authenticateAdmin(username, password)) {
        const token = Buffer.from(`${username}:${password}`).toString('base64');
        res.json({ success: true, token });
    } else {
        res.json({ success: false });
    }
});

app.get('/api/admin/licenses', (req, res) => {
    const token = req.query.token;
    if (!token) return res.status(401).json({ success: false });
    
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const [username, password] = decoded.split(':');
        
        if (!authenticateAdmin(username, password)) {
            return res.status(401).json({ success: false });
        }
        
        const licensesData = readLicenses();
        const licenses = Object.entries(licensesData.licenses).map(([key, data]) => ({
            licenseKey: key,
            ...data
        }));
        
        res.json({ 
            success: true, 
            licenses,
            scriptVersion: licensesData.scriptVersion,
            forceUpdate: licensesData.forceUpdate
        });
    } catch (error) {
        res.status(401).json({ success: false });
    }
});

app.post('/api/admin/licenses/create', (req, res) => {
    const { token, owner, expiryDays, notes } = req.body;
    if (!token) return res.status(401).json({ success: false });
    
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const [username, password] = decoded.split(':');
        
        if (!authenticateAdmin(username, password)) {
            return res.status(401).json({ success: false });
        }
        
        const licenseKey = generateLicenseKey();
        const licensesData = readLicenses();
        
        let expiryDate = null;
        if (expiryDays && expiryDays > 0) {
            expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + parseInt(expiryDays));
            expiryDate = expiryDate.toISOString();
        }
        
        licensesData.licenses[licenseKey] = {
            owner: owner || 'Unknown',
            active: true,
            createdAt: new Date().toISOString(),
            expiryDate: expiryDate,
            universeId: null,
            placeId: null,
            firstActivation: null,
            lastVerified: null,
            verificationCount: 0,
            notes: notes || ''
        };
        
        writeLicenses(licensesData);
        console.log(`✅ License created: ${licenseKey} for ${owner}`);
        
        res.json({ success: true, licenseKey });
    } catch (error) {
        res.status(401).json({ success: false });
    }
});

app.post('/api/admin/licenses/toggle', (req, res) => {
    const { token, licenseKey } = req.body;
    if (!token) return res.status(401).json({ success: false });
    
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const [username, password] = decoded.split(':');
        
        if (!authenticateAdmin(username, password)) {
            return res.status(401).json({ success: false });
        }
        
        const licensesData = readLicenses();
        
        if (!licensesData.licenses[licenseKey]) {
            return res.json({ success: false, error: 'License not found' });
        }
        
        licensesData.licenses[licenseKey].active = !licensesData.licenses[licenseKey].active;
        writeLicenses(licensesData);
        
        console.log(`🔄 License ${licenseKey} toggled`);
        res.json({ success: true, active: licensesData.licenses[licenseKey].active });
    } catch (error) {
        res.status(401).json({ success: false });
    }
});

app.post('/api/admin/licenses/delete', (req, res) => {
    const { token, licenseKey } = req.body;
    if (!token) return res.status(401).json({ success: false });
    
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const [username, password] = decoded.split(':');
        
        if (!authenticateAdmin(username, password)) {
            return res.status(401).json({ success: false });
        }
        
        const licensesData = readLicenses();
        
        if (!licensesData.licenses[licenseKey]) {
            return res.json({ success: false, error: 'License not found' });
        }
        
        delete licensesData.licenses[licenseKey];
        writeLicenses(licensesData);
        
        console.log(`🗑️ License deleted: ${licenseKey}`);
        res.json({ success: true });
    } catch (error) {
        res.status(401).json({ success: false });
    }
});

app.post('/api/admin/licenses/reset-hwid', (req, res) => {
    const { token, licenseKey } = req.body;
    if (!token) return res.status(401).json({ success: false });
    
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const [username, password] = decoded.split(':');
        
        if (!authenticateAdmin(username, password)) {
            return res.status(401).json({ success: false });
        }
        
        const licensesData = readLicenses();
        
        if (!licensesData.licenses[licenseKey]) {
            return res.json({ success: false, error: 'License not found' });
        }
        
        licensesData.licenses[licenseKey].universeId = null;
        licensesData.licenses[licenseKey].placeId = null;
        licensesData.licenses[licenseKey].firstActivation = null;
        writeLicenses(licensesData);
        
        console.log(`🔓 HWID reset: ${licenseKey}`);
        res.json({ success: true });
    } catch (error) {
        res.status(401).json({ success: false });
    }
});

app.post('/api/admin/version/update', (req, res) => {
    const { token, version, forceUpdate, updateMessage } = req.body;
    if (!token) return res.status(401).json({ success: false });
    
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const [username, password] = decoded.split(':');
        
        if (!authenticateAdmin(username, password)) {
            return res.status(401).json({ success: false });
        }
        
        const licensesData = readLicenses();
        licensesData.scriptVersion = version;
        licensesData.forceUpdate = forceUpdate || false;
        licensesData.updateMessage = updateMessage || 'Update available';
        writeLicenses(licensesData);
        
        console.log(`📦 Version updated: ${version}`);
        res.json({ success: true });
    } catch (error) {
        res.status(401).json({ success: false });
    }
});

app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

app.listen(port, () => {
    console.log(`✅ License Server running on port ${port}`);
    console.log(`👑 Admin: ${ADMIN_USERNAME}`);
});
