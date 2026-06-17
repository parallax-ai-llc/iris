import { ipcMain, app, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';

interface AuthStore {
  accessToken?: string;
  refreshToken?: string;
  user?: {
    id: string;
    email: string;
    name?: string;
    profileImageThumbnail?: string;
  };
}

/**
 * 토큰을 safeStorage로 암호화하여 저장/복호화하여 읽기
 * safeStorage 미지원 시 평문 fallback (개발 환경 등)
 */
function encryptValue(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString('base64');
  }
  return value;
}

function decryptValue(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(value, 'base64'));
    } catch {
      // 암호화되지 않은 기존 값 (마이그레이션 호환)
      return value;
    }
  }
  return value;
}

function getStorePath(): string {
  return path.join(app.getPath('userData'), 'auth.json');
}

function readStore(): AuthStore {
  try {
    const raw = fs.readFileSync(getStorePath(), 'utf-8');
    const data = JSON.parse(raw);

    // 토큰 복호화
    return {
      ...data,
      accessToken: data.accessToken ? decryptValue(data.accessToken) : undefined,
      refreshToken: data.refreshToken ? decryptValue(data.refreshToken) : undefined,
    };
  } catch {
    return {};
  }
}

function writeStore(data: AuthStore): void {
  const dir = path.dirname(getStorePath());
  fs.mkdirSync(dir, { recursive: true });

  // 토큰 암호화 후 저장
  const encrypted = {
    ...data,
    accessToken: data.accessToken ? encryptValue(data.accessToken) : undefined,
    refreshToken: data.refreshToken ? encryptValue(data.refreshToken) : undefined,
  };

  fs.writeFileSync(getStorePath(), JSON.stringify(encrypted, null, 2), { encoding: 'utf-8', mode: 0o600 });
}

export function setupAuthHandlers() {
  ipcMain.handle('auth:getToken', () => {
    return readStore().accessToken ?? null;
  });

  ipcMain.handle('auth:setToken', (_, token: string) => {
    const store = readStore();
    store.accessToken = token;
    writeStore(store);
  });

  ipcMain.handle('auth:getRefreshToken', () => {
    return readStore().refreshToken ?? null;
  });

  ipcMain.handle('auth:setRefreshToken', (_, token: string) => {
    const store = readStore();
    store.refreshToken = token;
    writeStore(store);
  });

  ipcMain.handle('auth:clearTokens', () => {
    writeStore({});
  });

  ipcMain.handle('auth:getUser', () => {
    return readStore().user ?? null;
  });

  ipcMain.handle('auth:setUser', (_, user: AuthStore['user']) => {
    const store = readStore();
    store.user = user;
    writeStore(store);
  });
}
