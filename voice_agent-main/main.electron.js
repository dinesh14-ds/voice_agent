import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: "AU Voice Assistant",
    backgroundColor: "#050a14",
    autoHideMenuBar: true,
  });

  if (process.env.NODE_ENV === 'development') {
    // Retry mechanism to wait for the Vite dev server to stand up
    const loadDevServer = () => {
      mainWindow.loadURL('http://localhost:5173').catch((err) => {
        console.log('Vite server not ready, retrying in 1s...');
        setTimeout(loadDevServer, 1000);
      });
    };
    loadDevServer();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }
}

// ─── IPC Handlers for System Controls & Voice Security ───────────────────

ipcMain.handle('save-voice-profile', async (event, embedding) => {
  try {
    const profilePath = path.join(__dirname, 'voice_profile.json');
    await fs.promises.writeFile(profilePath, JSON.stringify({ embedding }));
    return { success: true };
  } catch (err) {
    console.error('Error saving voice profile:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('load-voice-profile', async (event) => {
  try {
    const profilePath = path.join(__dirname, 'voice_profile.json');
    if (fs.existsSync(profilePath)) {
      const data = await fs.promises.readFile(profilePath, 'utf-8');
      const parsed = JSON.parse(data);
      return parsed.embedding || null;
    }
    return null;
  } catch (err) {
    console.error('Error loading voice profile:', err);
    return null;
  }
});

ipcMain.handle('execute-action', async (event, { name, args }) => {
  console.log(`[IPC] Executing Action: ${name} with args:`, args);
  
  try {
    switch (name) {
      case 'open_application': {
        const appMap = {
          notepad: 'notepad.exe',
          calc: 'calc.exe',
          chrome: 'chrome.exe',
          explorer: 'explorer.exe',
          paint: 'mspaint.exe',
          cmd: 'cmd.exe',
        };
        const appNameClean = args.appName.toLowerCase();
        const execName = appMap[appNameClean] || args.appName;
        
        // On Windows, use 'start' shell command to resolve paths through App Paths registry
        const launchCmd = process.platform === 'win32' 
          ? `cmd.exe /c start "" "${execName}"` 
          : execName;

        return new Promise((resolve) => {
          exec(launchCmd, (err) => {
            if (err) {
              // Fallback: try raw execution if start failed
              exec(execName, (err2) => {
                if (err2) resolve({ success: false, error: err2.message });
                else resolve({ success: true });
              });
            } else {
              resolve({ success: true });
            }
          });
        });
      }

      case 'close_application': {
        const cleanName = args.appName.replace('.exe', '');
        return new Promise((resolve) => {
          exec(`taskkill /F /IM ${cleanName}.exe`, (err) => {
            // taskkill might return error if process not found, return success anyway
            resolve({ success: true });
          });
        });
      }

      case 'search_web': {
        await shell.openExternal(`https://www.google.com/search?q=${encodeURIComponent(args.query)}`);
        return { success: true };
      }

      case 'get_datetime': {
        return { success: true, value: new Date().toLocaleString() };
      }

      case 'play_media': {
        return new Promise((resolve) => {
          exec(`powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]179)"`, (err) => {
            if (err) resolve({ success: false, error: err.message });
            else resolve({ success: true });
          });
        });
      }

      case 'set_volume': {
        const volLevel = Math.max(0, Math.min(100, parseInt(args.level || 0)));
        const volUpCount = Math.round(volLevel / 2);
        return new Promise((resolve) => {
          exec(`powershell -Command "$wsh = New-Object -ComObject WScript.Shell; for($i=0; $i -lt 50; $i++) { $wsh.SendKeys([char]174) }; for($i=0; $i -lt ${volUpCount}; $i++) { $wsh.SendKeys([char]175) }"`, (err) => {
            if (err) resolve({ success: false, error: err.message });
            else resolve({ success: true });
          });
        });
      }

      case 'take_screenshot': {
        const workspaceDir = path.join(__dirname, 'workspace');
        if (!fs.existsSync(workspaceDir)) {
          fs.mkdirSync(workspaceDir);
        }
        const screenshotPath = path.join(workspaceDir, 'screenshot.png');
        // Capture screen via .NET inside PowerShell
        const psCommand = `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $image = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height); $graphics = [System.Drawing.Graphics]::FromImage($image); $graphics.CopyFromScreen(0, 0, 0, 0, $image.Size); $image.Save('${screenshotPath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png); $image.Dispose(); $graphics.Dispose();"`;
        
        return new Promise((resolve) => {
          exec(psCommand, (err) => {
            if (err) resolve({ success: false, error: err.message });
            else resolve({ success: true, path: screenshotPath });
          });
        });
      }

      case 'read_file': {
        const resolved = path.resolve(args.filePath);
        const workspacePath = path.resolve(__dirname, 'workspace');
        const logsPath = path.resolve(__dirname, 'logs');
        if (resolved.startsWith(workspacePath) || resolved.startsWith(logsPath)) {
          const content = await fs.promises.readFile(resolved, 'utf-8');
          return { success: true, content };
        } else {
          return { success: false, error: "Access Denied: Path not allowed" };
        }
      }

      case 'write_file': {
        const resolved = path.resolve(args.filePath);
        const workspacePath = path.resolve(__dirname, 'workspace');
        const logsPath = path.resolve(__dirname, 'logs');
        if (resolved.startsWith(workspacePath) || resolved.startsWith(logsPath)) {
          // Ensure parent directory exists
          const parentDir = path.dirname(resolved);
          if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
          }
          await fs.promises.writeFile(resolved, args.content, 'utf-8');
          return { success: true };
        } else {
          return { success: false, error: "Access Denied: Path not allowed" };
        }
      }

      default:
        return { success: false, error: `Unknown system action: ${name}` };
    }
  } catch (err) {
    console.error(`Error executing action ${name}:`, err);
    return { success: false, error: err.message };
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

