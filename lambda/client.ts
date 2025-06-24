import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { Handler } from 'aws-lambda';

const clientSecretManager = new SecretsManagerClient({ region: process.env.AWS_REGION});

export const handler: Handler = async (event, context) => {

    try {
        const client_secret = await clientSecretManager.send(
            new GetSecretValueCommand({ SecretId: process.env.CLIENT_SECRET_NAME! })
        );

        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${process.env.CLIENT_ID}:${client_secret.SecretString}`).toString('base64')}`
        };

        const requestParam = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: `${process.env.CLIENT_ID}`, //should hide it in secrets
            scope: `${process.env.SCOPE}`
        });

        const tokenRequest = await fetch(`https://${process.env.DOMAIN_NAME}.auth.${process.env.AWS_REGION}.amazoncognito.com/oauth2/token`, {
            method: 'POST',
            headers,
            body: requestParam        
        });

        const token = await tokenRequest.json();

        const callApi = await fetch(`${process.env.API_URL}`, {
            headers: { Authorization: `Bearer ${token.access_token}` }
        });
        const body = await callApi.text();

        return { statusCode: 200, body: JSON.stringify(body) };
    } catch (error) {
        return { statusCode: 400, body: JSON.stringify(error) };
    }
}