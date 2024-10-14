const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ejs = require('ejs');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const ejse = require('ejs-electron')
const log = require('electron-log');

let mainWindow;

// cria client do wttp
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    }
});

log.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs/main.log');
log.transports.file.level = 'info';

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1080,
        height: 1040,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    // Renderiza o arquivo EJS com os dados
    const filePath = path.join(__dirname, 'views', 'index.ejs');
    mainWindow.loadFile(filePath);

    log.info('Aplicativo iniciado');

    mainWindow.setAlwaysOnTop(true);
    mainWindow.focus();

    initializeClient();

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Start
app.whenReady().then(createWindow);

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

function initializeClient() {
    // starta client do wttp
    log.info('Entrou na criacao do qr code');

    client.initialize()
        .then(() => log.info('Client do WhatsApp inicializado com sucesso'))
        .catch((err) => log.error('Erro ao inicializar o client do WhatsApp:', err));

    // monta qr code e manda para o front
    client.on('qr', (qr) => {

        log.info('Gerando QR code...');

        qrcode.toDataURL(qr, (err, url) => {
            if (err) {
                log.error('Erro gerar qr code', err);
                return;
            }

            log.info('Mostrando qr code', qr);
            mainWindow.webContents.send('qr', url);
        });
    });

    client.on('error', (err) => {
        log.error('Erro no client:', err);
    });

    // coleta dos contatos
    client.on('ready', async () => {
        log.info('WhatsApp pronto!', qr);
        qrCode = null;

        mainWindow.webContents.send('searchContacts', qrCode);
        // get contatos
        const chats = await client.getChats();
        const contacts = await Promise.all(chats.map(async (chat) => {
            return {
                name: chat.name || chat.id.user,
                id: chat.id._serialized,
                number: chat.id.user,
            };
        }));

        log.info('Finalizado a consulta de contatos!');

        if (mainWindow) {
            mainWindow.webContents.send('contacts', contacts); // manda os contatos para visualização
        }
    });

}

ipcMain.on('logout', async (event) => {
    try {
        await client.logout();
        log.info('Logout do WhatsApp realizado com sucesso.');

        initializeClient();
    } catch (error) {
        log.error('Erro ao fazer logout:', error);
    }
});

// recebe mensagem e manda para os numeros
ipcMain.on('send-message', (event, { contacts, message }) => {
    let messageInfo = {
        errors: [],
        sended: []
    };

    contacts.forEach(contact => {
        client.sendMessage(contact, message)
            .then(() => {
                messageInfo.sended.push(contact)
                console.log(`Mensagem enviada para ${contact}`);
            })
            .catch(err => {
                messageInfo.errors.push(contact)
                console.error(`Erro ao enviar para ${contact}:`, err);
            });
    });

    mainWindow.webContents.send('alert', messageInfo);

});
