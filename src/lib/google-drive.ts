import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.readonly'];

export async function getGoogleDriveAuth() {
    const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!clientEmail || !privateKey) {
        throw new Error('Google Drive credentials not found in environment variables');
    }

    const auth = new google.auth.JWT({
        email: clientEmail,
        key: privateKey,
        scopes: SCOPES,
    });

    return auth;
}

export const drive = google.drive({ version: 'v3' });
