# Proyecto Next.js con DynamoDB Local

## 🚀 Scripts Disponibles

### Configuración Inicial (solo la primera vez)
```bash
npm run setup
```
Este comando:
- Descarga e instala DynamoDB Local
- Descarga e instala OpenJDK 21
- Crea las tablas necesarias (Users, Monitors, MonitorLogs)
- Crea el usuario de prueba

### Iniciar Ambos Servidores (Recomendado)
```bash
npm run start:all
```
Este comando inicia simultáneamente:
- 🔵 **DynamoDB Local** en el puerto 8000
- 🟣 **Next.js** en http://localhost:3000

### Iniciar Servidores Individualmente

#### Solo DynamoDB
```bash
npm run start:db
```

#### Solo Next.js
```bash
npm run dev
```

## 🔐 Credenciales de Prueba

- **Email:** `rolf@unabase.con`
- **Password:** `tea2025`
- **Rol:** admin

## 📝 Otros Comandos

- `npm run build` - Construir para producción
- `npm run start` - Iniciar servidor de producción
- `npm run lint` - Ejecutar linter

## 🗄️ Base de Datos

La base de datos DynamoDB Local se ejecuta en:
- **Endpoint:** http://localhost:8000
- **Modo:** SharedDb (base de datos compartida)
- **Persistencia:** Los datos se guardan en `c:\stuff\dynamodb_local`

## 📚 Documentación Adicional

Para más información sobre la configuración de la base de datos, consulta:
- `src/README_DB.md` - Documentación de la base de datos
- `scripts/` - Scripts de configuración y utilidades
