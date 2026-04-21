# Stuff - Panel de Gestión

Panel de administración interno construido con **Next.js 16**, **React 19**, **DynamoDB Local** y **TypeScript**.

## 📋 Módulos

| Módulo | Descripción |
|--------|-------------|
| **Dashboard** | Vista general del sistema |
| **Sistemas** | Gestión de sistemas/clientes |
| **Datos** | Grilla de datos generales |
| **Usuarios** | Administración de usuarios |
| **Bandeja DTC** | Movimientos y documentos tributarios |
| **Reportes** | Generación de reportes |
| **Herramientas** | Utilidades varias |
| **Claves** | Gestión de credenciales |
| **Chat** | Chat interno |
| **Reciclaje** | Papelera de elementos eliminados |

## 🛠️ Requisitos previos

Antes de comenzar, asegúrate de tener instalado:

1. **Node.js** v18 o superior → [Descargar](https://nodejs.org/)
2. **Java JDK 21** → [Descargar OpenJDK 21](https://adoptium.net/temurin/releases/?version=21)
3. **Git** → [Descargar](https://git-scm.com/)

## 🚀 Instalación paso a paso

### 1. Clonar el repositorio

```bash
git clone https://github.com/rolfalvarado/NewStuff.git
cd NewStuff
```

### 2. Instalar dependencias de Node.js

```bash
npm install
```

### 3. Configurar DynamoDB Local

DynamoDB Local no se incluye en el repositorio. Debes descargarlo:

```bash
# Crear la carpeta en la raíz del proyecto
mkdir dynamodb_local
```

Descarga DynamoDB Local desde:
👉 https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.DownloadingAndRunning.html

Extrae el contenido dentro de `dynamodb_local/` de modo que quede así:

```
dynamodb_local/
├── DynamoDBLocal.jar
├── DynamoDBLocal_lib/
│   └── (archivos .jar)
```

### 4. Configurar Java (Windows)

El script `start-db.js` busca Java en la siguiente ruta en Windows:

```
java_local/jdk-21.0.1+12/bin/java.exe
```

**Opción A** - Crear esa estructura:
```bash
mkdir java_local
# Extraer el JDK 21 dentro de java_local/
```

**Opción B** - Si tienes Java instalado globalmente, modifica `scripts/start-db.js` línea 16-17 y reemplaza con:
```javascript
javaExe = 'java';
```

### 5. Crear archivo de variables de entorno

Crea el archivo `.env.local` en la raíz del proyecto con las siguientes variables:

```env
NODE_ENV=development

# Llave de encriptación del servidor (solicitar al administrador)
SERVER_ENCRYPTION_KEY=

# Contraseñas seed para usuarios iniciales (solicitar al administrador)
SEED_PASS_ADMINISTRACION=
SEED_PASS_DESARROLLO=
SEED_PASS_SOPORTE=

# Google Drive API (solicitar al administrador)
GOOGLE_DRIVE_CLIENT_EMAIL=
GOOGLE_DRIVE_PRIVATE_KEY=
GOOGLE_DRIVE_ROOT_FOLDER_ID=
```

> ⚠️ **IMPORTANTE:** Los valores de estas variables son secretos. Solicítalos al administrador del proyecto por un canal seguro (NO por GitHub).

### 6. Inicializar la base de datos

```bash
npm run setup
```

Esto ejecuta:
1. `setup-db.js` → Configura DynamoDB Local
2. `init-tables.js` → Crea las tablas necesarias
3. `seed-users.js` → Crea los usuarios iniciales

### 7. Ejecutar el proyecto

**Modo desarrollo (recomendado):**
```bash
npm run start:all
```
Esto inicia DynamoDB Local + Next.js dev server simultáneamente.

**Solo Next.js (si DynamoDB ya está corriendo):**
```bash
npm run dev
```

La aplicación estará disponible en: **http://localhost:3000**

> 💡 El servidor escucha en `0.0.0.0`, por lo que es accesible desde otros dispositivos en la misma red local.

## 📜 Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Inicia Next.js en modo desarrollo |
| `npm run build` | Genera el build de producción |
| `npm run start` | Inicia Next.js en modo producción |
| `npm run start:db` | Inicia solo DynamoDB Local |
| `npm run start:all` | Inicia DynamoDB + Next.js (desarrollo) |
| `npm run start:prod` | Inicia DynamoDB + Next.js + Monitor (producción) |
| `npm run setup` | Inicializa la base de datos y crea usuarios |
| `npm run lint` | Ejecuta ESLint |

## 📁 Estructura del proyecto

```
stuff/
├── public/              # Archivos estáticos (logos, íconos, sonidos)
├── scripts/             # Scripts de utilidad y base de datos
├── src/
│   ├── app/
│   │   ├── (main)/      # Páginas principales (con layout compartido)
│   │   ├── actions/     # Server Actions (lógica backend)
│   │   ├── api/         # API Routes
│   │   └── login/       # Página de login
│   ├── components/      # Componentes React reutilizables
│   └── lib/             # Utilidades (DB, crypto, sesión, etc.)
├── dynamodb_local/      # DynamoDB Local (NO incluido en repo)
├── java_local/          # JDK local para Windows (NO incluido en repo)
├── .env.local           # Variables de entorno (NO incluido en repo)
├── package.json
└── tsconfig.json
```

## 🔄 Flujo de trabajo con Git

```bash
# Antes de empezar a trabajar, obtener los últimos cambios
git pull

# Después de hacer cambios
git add .
git commit -m "Descripción de los cambios"
git push
```

## ⚠️ Archivos NO incluidos en el repositorio

Los siguientes archivos/carpetas están en `.gitignore` y **no se suben** al repo:

- `node_modules/` → Se regenera con `npm install`
- `.next/` → Build cache de Next.js
- `.env.local` → Variables de entorno secretas
- `dynamodb_local/` → DynamoDB Local (descargar aparte)
- `java_local/` → JDK para Windows (descargar aparte)
- `deploy-package/` → Paquete de despliegue
- `*.zip` → Archivos comprimidos de deploy

## 🆘 Solución de problemas

### Error: "Failed to start DynamoDB"
- Verifica que Java 21 esté instalado y accesible
- Verifica que `DynamoDBLocal.jar` existe en `dynamodb_local/`

### Error: "Cannot connect to DynamoDB"
- Asegúrate de que DynamoDB esté corriendo en el puerto 8000
- Ejecuta `npm run start:db` por separado para ver errores

### Error: "Missing environment variables"
- Verifica que el archivo `.env.local` exista y tenga todos los valores
