# Configuración de Entorno

## Base de Datos (DynamoDB Local)

Este proyecto está configurado para conectarse a una instancia local de DynamoDB en el puerto `8000`.

### Requisitos
Como no estamos usando Docker, necesitarás ejecutar DynamoDB Local manualmente usando Java.

1.  **Instalar Java (JRE)**: Asegúrate de tener Java instalado.
    *   *Nota: Se detectó que `java` no está en tu PATH. Por favor instala OpenJDK o similar.*
2.  **Descargar DynamoDB Local**:
    *   Descarga el archivo `.zip` desde: [AWS DynamoDB Local](https://d1ni2b6xgwl0sp.cloudfront.net/dynamodb_local_latest.zip)
    *   Descomprímelo en una carpeta, por ejemplo: `C:\dynamodb_local`
3.  **Ejecutar**:
    *   Abre una terminal en esa carpeta y ejecuta:
        ```ps1
        java -Djava.library.path=./DynamoDBLocal_lib -jar DynamoDBLocal.jar -sharedDb
        ```
    *   Esto iniciará la base de datos en `http://localhost:8000`.

### Tablas
El sistema espera las siguientes tablas (se crearán automáticamente mediante scripts de inicialización en pasos futuros):
- `Monitors` (PK: id)
- `MonitorLogs` (PK: monitorId, SK: timestamp)

## Variables de Entorno (.env.local)
Crea un archivo `.env.local` si necesitas sobreescribir los valores por defecto:

```env
DYNAMODB_ENDPOINT=http://localhost:8000
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=local
AWS_SECRET_ACCESS_KEY=local
```
