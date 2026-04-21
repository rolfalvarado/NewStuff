"use server";

import {
    EC2Client,
    DescribeInstancesCommand,
    StartInstancesCommand,
    StopInstancesCommand,
    RebootInstancesCommand,
    Instance
} from "@aws-sdk/client-ec2";
import { validateSession } from "@/lib/session";

export interface AWSCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
}

function getClient(creds: AWSCredentials) {
    return new EC2Client({
        region: creds.region,
        credentials: {
            accessKeyId: creds.accessKeyId,
            secretAccessKey: creds.secretAccessKey,
        },
    });
}

export async function getInstances(creds: AWSCredentials) {
    const session = await validateSession();
    if (!session) {
        return { success: false, error: "No autorizado. Inicia sesión en la aplicación." };
    }
    const client = getClient(creds);
    try {
        const command = new DescribeInstancesCommand({});
        const data = await client.send(command);

        const instances: Instance[] = [];
        data.Reservations?.forEach(reservation => {
            reservation.Instances?.forEach(instance => {
                instances.push(instance);
            });
        });

        // Serialization for client component if needed (removing undefineds or complex objects if Next complains)
        // But usually basic JSON objects pass fine. 
        // We'll return a simplified structure or the raw one if it works.
        // Let's return the raw one for now, ensuring dates are strings.
        return { success: true, instances: JSON.parse(JSON.stringify(instances)) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function startInstances(creds: AWSCredentials, instanceIds: string[]) {
    const session = await validateSession();
    if (!session) {
        return { success: false, error: "No autorizado. Inicia sesión en la aplicación." };
    }
    const client = getClient(creds);
    try {
        const command = new StartInstancesCommand({ InstanceIds: instanceIds });
        await client.send(command);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function stopInstances(creds: AWSCredentials, instanceIds: string[]) {
    const session = await validateSession();
    if (!session) {
        return { success: false, error: "No autorizado. Inicia sesión en la aplicación." };
    }
    const client = getClient(creds);
    try {
        const command = new StopInstancesCommand({ InstanceIds: instanceIds });
        await client.send(command);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function rebootInstances(creds: AWSCredentials, instanceIds: string[]) {
    const session = await validateSession();
    if (!session) {
        return { success: false, error: "No autorizado. Inicia sesión en la aplicación." };
    }
    const client = getClient(creds);
    try {
        const command = new RebootInstancesCommand({ InstanceIds: instanceIds });
        await client.send(command);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
