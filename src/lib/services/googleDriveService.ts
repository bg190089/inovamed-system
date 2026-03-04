// ============================================================
// Google Drive Service - Backup de Prontuários
// Usa Service Account (mesmo padrão do export-sheets)
// ============================================================

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Cache de IDs de pastas para evitar chamadas repetidas
const folderCache = new Map<string, string>();

/**
 * Gera access token via JWT (Service Account)
 * Scope: drive.file (acessa apenas arquivos criados pelo app)
 */
export async function getGoogleDriveToken(): Promise<string | null> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!email || !privateKey) {
    console.warn('[GoogleDrive] Credenciais não configuradas. Backup ignorado.');
    return null;
  }

  const crypto = require('crypto');
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };

  const b64 = (obj: any) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

  const encodedHeader = b64(header);
  const encodedClaims = b64(claims);
  const signInput = `${encodedHeader}.${encodedClaims}`;

  const sign = crypto.createSign('SHA256');
  sign.update(signInput);
  const signature = sign
    .sign(privateKey, 'base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  const jwt = `${signInput}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[GoogleDrive] Falha no token:', err);
    return null;
  }

  const data = await res.json();
  return data.access_token;
}

/**
 * Busca pasta por nome dentro de um parent. Se não encontrar, cria.
 */
export async function findOrCreateFolder(
  token: string,
  name: string,
  parentId: string
): Promise<string> {
  const cacheKey = `${parentId}/${name}`;
  if (folderCache.has(cacheKey)) {
    return folderCache.get(cacheKey)!;
  }

  // Buscar pasta existente
  const query = `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchUrl = `${DRIVE_API}?q=${encodeURIComponent(query)}&fields=files(id,name)`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (searchRes.ok) {
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      const folderId = searchData.files[0].id;
      folderCache.set(cacheKey, folderId);
      return folderId;
    }
  }

  // Criar pasta
  const createRes = await fetch(DRIVE_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Falha ao criar pasta "${name}": ${err}`);
  }

  const createData = await createRes.json();
  folderCache.set(cacheKey, createData.id);
  return createData.id;
}

/**
 * Cria estrutura de pastas: Inovamed > Prontuarios > 2026-03 > Municipio
 * Retorna o ID da pasta final (município)
 */
export async function ensureFolderPath(
  token: string,
  paths: string[]
): Promise<string> {
  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || 'root';
  let currentId = rootId;

  for (const folder of paths) {
    currentId = await findOrCreateFolder(token, folder, currentId);
  }

  return currentId;
}

/**
 * Upload de arquivo PDF para o Google Drive via multipart
 * Retorna { fileId, webViewLink }
 */
export async function uploadFileToDrive(
  token: string,
  folderId: string,
  filename: string,
  fileBuffer: Buffer,
  mimeType = 'application/pdf'
): Promise<{ fileId: string; webViewLink: string }> {
  const boundary = '===inovamed_boundary===';

  const metadata = JSON.stringify({
    name: filename,
    parents: [folderId],
    mimeType,
  });

  // Construir body multipart manualmente
  const bodyParts = [
    `--${boundary}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    metadata,
    `\r\n--${boundary}\r\n`,
    `Content-Type: ${mimeType}\r\n`,
    'Content-Transfer-Encoding: base64\r\n\r\n',
    fileBuffer.toString('base64'),
    `\r\n--${boundary}--`,
  ];

  const body = bodyParts.join('');

  const res = await fetch(`${UPLOAD_API}?uploadType=multipart&fields=id,webViewLink`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Upload falhou: ${err}`);
  }

  const data = await res.json();
  return {
    fileId: data.id,
    webViewLink: data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`,
  };
}
