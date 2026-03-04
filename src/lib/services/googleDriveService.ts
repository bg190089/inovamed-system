// ============================================================
// Google Drive Service - Backup de Prontuários
// Usa OAuth 2.0 com Refresh Token (conta pessoal do Roberto)
// ============================================================

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Cache de IDs de pastas para evitar chamadas repetidas
const folderCache = new Map<string, string>();

// Cache do access token (válido ~1h)
let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * Obtém access token via OAuth 2.0 Refresh Token
 * Scope: drive.file (acessa apenas arquivos criados pelo app)
 */
export async function getGoogleDriveToken(): Promise<string | null> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.warn('[GoogleDrive] Credenciais OAuth não configuradas. Backup ignorado.');
    return null;
  }

  // Retorna token em cache se ainda válido (margem de 5 min)
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 300000) {
    return cachedAccessToken;
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[GoogleDrive] Falha ao renovar token:', err);
    cachedAccessToken = null;
    return null;
  }

  const data = await res.json();
  cachedAccessToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;

  console.log('[GoogleDrive] Access token renovado com sucesso.');
  return cachedAccessToken;
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
  const searchUrl = `${DRIVE_API}?q=${encodeURIComponent(query)}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`;

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
  const createRes = await fetch(`${DRIVE_API}?supportsAllDrives=true`, {
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

  const res = await fetch(`${UPLOAD_API}?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true`, {
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
