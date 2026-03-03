# 🏥 Inovamed - Sistema de Escleroterapia
## Guia de Deploy e Configuração

---

## 📋 Resumo do Sistema

Sistema completo para gestão de atendimentos de escleroterapia, com:
- **Recepção**: Cadastro rápido de pacientes + fila de atendimento
- **Consultório**: Prontuário (Doppler, Anamnese, Procedimento) + Histórico
- **Relatórios**: BPA-I para faturamento SUS + Produtividade médica e por município
- **Administração**: Gestão de profissionais, unidades/CNES, municípios
- **Assinatura Digital**: Termo de consentimento com assinatura touch no tablet
- **Segurança**: RLS (Row Level Security), Audit Log, LGPD

---

## 🚀 PASSO 1: Configurar Supabase

### 1.1 Executar o SQL
1. Acesse seu projeto em **app.supabase.com**
2. Vá em **SQL Editor** (menu lateral)
3. Clique em **New Query**
4. Copie todo o conteúdo do arquivo `supabase/001_initial_schema.sql`
5. Cole no editor e clique **Run** (Ctrl+Enter)
6. Aguarde a confirmação ✅

### 1.2 Configurar Auth
1. Vá em **Authentication > Providers**
2. Certifique-se que **Email** está habilitado
3. Em **Authentication > URL Configuration**:
   - Site URL: `https://seu-dominio.vercel.app`
   - Redirect URLs: `https://seu-dominio.vercel.app/**`

### 1.3 Copiar as Chaves
1. Vá em **Settings > API**
2. Copie:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ NUNCA expor no frontend)

---

## 🚀 PASSO 2: Deploy na Vercel

### 2.1 Subir para GitHub
```bash
# Na pasta do projeto
git init
git add .
git commit -m "Initial commit - Inovamed Escleroterapia"
git remote add origin https://github.com/SEU_USER/inovamed-system.git
git push -u origin main
```

### 2.2 Importar na Vercel
1. Acesse **vercel.com/new**
2. Importe o repositório do GitHub
3. Configure as **Environment Variables**:
   ```
   NEXT_PUBLIC_SUPABASE_URL = https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJhbGc...
   SUPABASE_SERVICE_ROLE_KEY = eyJhbGc...
   ```
4. Clique **Deploy**

### 2.3 Configurar Domínio (Opcional)
- Em **Settings > Domains**, adicione seu domínio customizado

---

## 🚀 PASSO 3: Criar o Usuário Administrador

Após o deploy, faça uma chamada POST para criar o admin:

```bash
curl -X POST https://seu-dominio.vercel.app/api/setup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "roberto@inovamed.com.br",
    "password": "SuaSenhaSegura123!",
    "nome_completo": "ROBERTO MARGOTTI",
    "cns": "SEU_CNS_AQUI",
    "crm": "CRM-BA 26929",
    "setup_key": "INOVAMED_SETUP_2026"
  }'
```

Ou use o Postman/Insomnia para fazer esta requisição.

⚠️ **Após criar o admin, é recomendável desabilitar esta rota** removendo o arquivo ou adicionando uma verificação.

---

## 🚀 PASSO 4: Primeiro Acesso

1. Acesse `https://seu-dominio.vercel.app/login`
2. Entre com o email/senha do admin criado
3. Selecione a **Empresa** (Inovamed ou M&J)
4. Selecione a **Unidade/Município**
5. Pronto! O sistema está funcional.

### Criar outros usuários:
1. Vá em **Administração**
2. Clique em **+ Novo Cadastro**
3. Preencha os dados (email, senha, nome, CNS, CRM, CBO, perfil)
4. Cada perfil tem acesso específico:
   - **Admin**: Tudo
   - **Gestor**: Dashboard + Relatórios + Recepção
   - **Médico**: Consultório apenas
   - **Recepcionista**: Recepção apenas

---

## 📱 Assinatura Digital no Tablet

A assinatura funciona via URL pública:
```
https://seu-dominio.vercel.app/assinatura?id=ID_DO_ATENDIMENTO
```

### Fluxo:
1. Recepcionista registra o paciente e cria o atendimento
2. Abre a URL da assinatura no tablet (pode usar QR Code)
3. Paciente lê o termo de consentimento
4. Assina com o dedo na tela
5. Clica em "Confirmar e Assinar"
6. A assinatura fica vinculada ao atendimento

---

## 📊 Exportação BPA-I para Faturista

1. Vá em **Relatórios > BPA Individualizado**
2. Selecione a **Competência** (mês/ano)
3. Selecione a **Unidade**
4. Clique em **Gerar BPA**
5. Clique em **Exportar CSV**
6. Envie o CSV para o faturista

O CSV contém todos os campos do BPA-I:
- CNES, CNS Profissional, CBO, Data, Folha, Sequencial
- Código do Procedimento, Paciente, CPF/CNS, Sexo, Nascimento
- CID (I839), Caráter (01-Eletivo), Quantidade

---

## 🔒 Segurança (LGPD)

O sistema implementa:
- **RLS (Row Level Security)**: Médicos só veem seus próprios atendimentos
- **Audit Log**: Todas as ações em pacientes e atendimentos são registradas
- **Auth via Supabase**: Senhas hasheadas, tokens JWT
- **Middleware de proteção**: Rotas protegidas por autenticação
- **Perfis de acesso**: Controle granular por papel

---

## 📊 Google Sheets (Opcional)

Para exportar automaticamente para Google Sheets:

1. Crie uma conta de serviço no Google Cloud Console
2. Habilite a Google Sheets API
3. Crie uma planilha e compartilhe com o email da conta de serviço
4. Configure as variáveis:
   ```
   GOOGLE_SERVICE_ACCOUNT_EMAIL = sa@projeto.iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY = -----BEGIN PRIVATE KEY-----...
   GOOGLE_SPREADSHEET_ID = 1abc123...
   ```

---

## 🔧 CNES Pendentes

Cadastre via Admin os CNES que faltam:
- ✅ Conceição do Coité: 3900037
- ✅ Santo Estevão: 2520338
- ✅ Conceição da Feira: 2660024
- ✅ Serra Preta: 2997614
- ⏳ Serrinha: **pendente**
- ⏳ Barrocas: **pendente**

---

## 📁 Estrutura do Projeto

```
inovamed-system/
├── supabase/
│   └── 001_initial_schema.sql    # Banco de dados completo
├── src/
│   ├── app/
│   │   ├── login/page.tsx        # Tela de login
│   │   ├── assinatura/page.tsx   # Assinatura digital (público)
│   │   ├── (app)/                # Rotas protegidas
│   │   │   ├── layout.tsx        # Layout com sidebar
│   │   │   ├── dashboard/        # Dashboard
│   │   │   ├── recepcao/         # Recepção
│   │   │   ├── consultorio/      # Consultório médico
│   │   │   ├── relatorios/       # Relatórios BPA + Produtividade
│   │   │   └── admin/            # Administração
│   │   └── api/
│   │       ├── setup/            # Criar admin (usar 1x)
│   │       └── export-sheets/    # Exportar para Google Sheets
│   ├── components/
│   │   └── layout/
│   │       ├── Sidebar.tsx       # Menu lateral
│   │       └── ContextSelector.tsx # Seletor empresa/unidade
│   ├── hooks/
│   │   └── useAuth.tsx           # Context de autenticação
│   ├── lib/
│   │   ├── utils.ts              # Utilitários (masks, formatação)
│   │   └── supabase/             # Clients Supabase
│   └── types/
│       └── index.ts              # TypeScript types
├── .env.local.example            # Template de variáveis
├── package.json
├── tailwind.config.js
└── next.config.js
```

---

## ⚡ Comandos Rápidos

```bash
# Instalar dependências
npm install

# Rodar em desenvolvimento
npm run dev

# Build para produção
npm run build

# Iniciar em produção
npm start
```
