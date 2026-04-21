"use server";

import { getGoogleDriveAuth, drive } from "@/lib/google-drive";
import { validateSession } from "@/lib/session";
import { Readable } from "stream";

const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

async function getOrCreateFolder(auth: any, folderName: string) {
    const res = await drive.files.list({
        auth,
        q: `name = '${folderName}' and '${ROOT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
    });

    if (res.data.files && res.data.files.length > 0) {
        return res.data.files[0].id;
    }

    const folderMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [ROOT_FOLDER_ID!],
    };

    const folder = await drive.files.create({
        auth,
        requestBody: folderMetadata,
        fields: 'id',
        supportsAllDrives: true,
    });

    return folder.data.id;
}

export async function uploadFileToDrive(formData: FormData) {
    try {
        const session = await validateSession();
        if (!session) throw new Error("No autorizado");

        const file = formData.get("file") as File;
        const systemName = formData.get("systemName") as string;

        if (!file || !systemName) throw new Error("Faltan datos");

        const auth = await getGoogleDriveAuth();
        const folderId = await getOrCreateFolder(auth, systemName);

        const buffer = Buffer.from(await file.arrayBuffer());
        const stream = new Readable();
        stream.push(buffer);
        stream.push(null);

        const fileMetadata = {
            name: file.name,
            parents: [folderId!],
        };

        const media = {
            mimeType: file.type,
            body: stream,
        };

        await drive.files.create({
            auth,
            requestBody: fileMetadata,
            media: media,
            fields: 'id',
            supportsAllDrives: true,
        });

        return { success: true };
    } catch (error: any) {
        console.error("Error uploading to Drive:", error);
        return { success: false, error: error.message };
    }
}

export async function listFilesFromDrive(systemName: string) {
    try {
        const session = await validateSession();
        if (!session) throw new Error("No autorizado");

        const auth = await getGoogleDriveAuth();

        // 1. Get folder ID for the system
        const folderRes = await drive.files.list({
            auth,
            q: `name = '${systemName}' and '${ROOT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id)',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
        });

        if (!folderRes.data.files || folderRes.data.files.length === 0) {
            return { success: true, files: [] };
        }

        const folderId = folderRes.data.files[0].id;

        // 2. List files in that folder
        const filesRes = await drive.files.list({
            auth,
            q: `'${folderId}' in parents and trashed = false`,
            fields: 'files(id, name, createdTime, size, webViewLink, webContentLink)',
            orderBy: 'createdTime desc',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
        });

        return { success: true, files: filesRes.data.files || [] };
    } catch (error: any) {
        console.error("Error listing from Drive:", error);
        return { success: false, error: error.message };
    }
}

export async function getDownloadLink(fileId: string) {
    try {
        const session = await validateSession();
        if (!session) throw new Error("No autorizado");

        const auth = await getGoogleDriveAuth();

        // We ensure the file is accessible. Service account usually can't "share" easily to any public link without domain permissions,
        // but it can fetch the webContentLink which works for anyone with the link if we were to make it public, 
        // OR we can proxy the download. For simplicity, we'll try to get the link.

        const res = await drive.files.get({
            auth,
            fileId: fileId,
            fields: 'webContentLink',
            supportsAllDrives: true,
        });

        return { success: true, downloadUrl: res.data.webContentLink };
    } catch (error: any) {
        console.error("Error getting download link:", error);
        return { success: false, error: error.message };
    }
}
