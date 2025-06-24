import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { Handler } from 'aws-lambda';

// Using cognito default URL.  Review docs for implementation
const jwtVerifier = CognitoJwtVerifier.create({
    userPoolId: `${process.env.USER_POOL_ID}`,
    tokenUse: 'access',
    clientId: `${process.env.CLIENT_ID}`,
    scope: `${process.env.SCOPE}`,
});

export const handler: Handler = async (event, context) => {
    try {
        const authHeader = event.headers?.Authorization || event.headers?.authorization;

        if (!authHeader) {
            return { statusCode: 401, body: 'Missing Authorization header'};
        }

        const payload = await jwtVerifier.verify(authHeader.slice(7));

        return { statusCode: 200, body: 'Request Valid.  Welcome to my API.' };

    } catch {
        return { statusCode: 401, body: 'Invalid Token'};
    }
}