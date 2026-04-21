const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({
    region: "us-east-1",
    endpoint: "http://localhost:8000",
    credentials: {
        accessKeyId: "local",
        secretAccessKey: "local",
    },
});

const db = DynamoDBDocumentClient.from(client);

const seedParams = {
    TableName: "Systems",
    Item: {
        nombre_empresa: "Estudio Fe",
        url_sitio: "https://fe.unabase.com/4DACTION/wbienvenidos",
        disabled_state: false,
        usuarios_totales: 30,
        ultima_conexion: "27/12/2025",
        ip_sitio: "52.206.2.178",
        nombre_servidor: "Fe New",
        estado_sitio: "Online",
        ultimo_backup: "20/12/2025",
        version_sistema: "3.93",
        memoria_sistema: "3500mb",
        tipo_instancia: "T3Large",
        usuarios_contratados: 31,
        fecha_renovacion: "31/12/2025",
        nombre_contacto: "Jorge Jofre",
        cargo_contacto: "Ejecutive Producer",
        phone_contacto: "+1 786 779 9819",
        mail_contacto: "jorge@estudiofe.com",
        modulos_activos: ["Conciliacion"]
    }
};

const seed = async () => {
    try {
        await db.send(new PutCommand(seedParams));
        console.log("Systems table seeded successfully.");
    } catch (e) {
        console.error("Error seeding Systems table:", e);
    }
};

seed();
