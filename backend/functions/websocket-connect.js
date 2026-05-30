/**
 * WebSocket Connect Function
 *
 * Generates a presigned WebSocket URL for browser clients using AWS SigV4.
 * Based on the official AWS sample:
 * https://github.com/awslabs/amazon-bedrock-agentcore-samples/tree/main/01-tutorials/01-AgentCore-runtime/06-bi-directional-streaming
 *
 * Authentication flow:
 * 1. User authenticates with Cognito (JWT validated by API Gateway)
 * 2. This function generates AWS SigV4 presigned WebSocket URL
 * 3. Browser connects with presigned URL (no custom headers needed)
 * 4. User identity passed via custom header query parameter
 *
 * The runtime must use SigV4 auth (default when AuthorizerConfiguration is not set).
 * From AWS docs: "Ensure your client uses the same authentication method (OAuth or SigV4)
 * that the agent was configured with"
 */

import { SignatureV4 } from '@aws-sdk/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { HttpRequest } from '@smithy/protocol-http';
import { defaultProvider } from '@aws-sdk/credential-provider-node';

/**
 * Encode a URI component using the AWS-compatible escapeUri behavior.
 * This is equivalent to encodeURIComponent but also encodes !'()* per RFC 3986.
 */
function escapeUri(value) {
    return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * Format a signed HttpRequest into a URL string.
 * Matches the behavior of the AWS SDK's formatUrl which uses escapeUri
 * on query parameter keys and values. SignatureV4.presign() stores raw
 * (unencoded) values in the query object, so we must encode them here.
 */
function formatSignedUrl(request) {
    const { protocol, hostname, path, query } = request;
    const proto = protocol?.endsWith(':') ? protocol : `${protocol}:`;

    let queryString = '';
    if (query) {
        const parts = [];
        for (const [key, value] of Object.entries(query)) {
            const encodedKey = escapeUri(key);
            if (Array.isArray(value)) {
                for (const v of value) {
                    parts.push(`${encodedKey}=${escapeUri(v)}`);
                }
            } else if (value != null) {
                parts.push(`${encodedKey}=${escapeUri(value)}`);
            } else {
                parts.push(encodedKey);
            }
        }
        queryString = parts.join('&');
    }

    return `${proto}//${hostname}${path}${queryString ? `?${queryString}` : ''}`;
}

export const handler = async (event) => {
    try {
        console.log('Presigned WebSocket URL request received');

        // Get authenticated user from Cognito authorizer
        const userClaims = event.requestContext?.authorizer?.claims;
        const userId = userClaims?.sub;
        const userEmail = userClaims?.email;

        console.log('Authenticated user:', { userId, email: userEmail });

        const region = process.env.AWS_REGION;
        const runtimeArn = process.env.AGENT_RUNTIME_ARN;

        if (!runtimeArn) {
            throw new Error('AGENT_RUNTIME_ARN environment variable not set');
        }

        // Parse session ID from request body
        const body = JSON.parse(event.body || '{}');
        const sessionId = body.sessionId || crypto.randomUUID();

        console.log('Session ID:', sessionId);

        // Construct WebSocket URL using the RAW ARN in the path
        // Per the official AWS sample (websocket_helpers.py) and docs:
        //   wss://bedrock-agentcore.<region>.amazonaws.com/runtimes/<agentRuntimeArn>/ws
        // The ARN is placed directly in the path without URL-encoding.
        // SigV4 signing handles canonical path encoding internally.
        const wsHost = `bedrock-agentcore.${region}.amazonaws.com`;
        const wsPath = `/runtimes/${runtimeArn}/ws`;

        console.log('WebSocket host:', wsHost);
        console.log('WebSocket path:', wsPath);

        // Get AWS credentials using the Lambda execution role
        const credentialsProvider = defaultProvider();
        const credentials = await credentialsProvider();

        // Build query parameters
        // qualifier=DEFAULT is included per the AWS sample
        const queryParams = {
            'qualifier': 'DEFAULT',
        };

        // Pass session ID as a query parameter
        if (sessionId) {
            queryParams['X-Amzn-Bedrock-AgentCore-Runtime-Session-Id'] = sessionId;
        }

        // Pass user ID via custom header query param
        // Received as header in agent: x-amzn-bedrock-agentcore-runtime-custom-user-id
        if (userId) {
            queryParams['X-Amzn-Bedrock-AgentCore-Runtime-Custom-User-Id'] = userId;
        }

        // Create HTTP request for presigning
        const request = new HttpRequest({
            method: 'GET',
            protocol: 'https:',
            hostname: wsHost,
            path: wsPath,
            headers: {
                'host': wsHost,
            },
            query: queryParams
        });

        // Sign the request with SigV4 using query auth (presigned URL style)
        const signer = new SignatureV4({
            service: 'bedrock-agentcore',
            region: region,
            credentials: credentials,
            sha256: Sha256
        });

        // Sign with expiration (5 minutes)
        const expiresIn = 300;
        const signedRequest = await signer.presign(request, {
            expiresIn: expiresIn,
            signingDate: new Date(),
        });

        // Convert signed request to URL, replacing https with wss for WebSocket
        const presignedHttpsUrl = formatSignedUrl(signedRequest);
        const presignedWsUrl = presignedHttpsUrl.replace('https://', 'wss://');

        console.log('Presigned WebSocket URL generated');
        console.log('   Session:', sessionId);
        console.log('   User:', userId);
        console.log('   Expires in:', expiresIn, 'seconds');

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            },
            body: JSON.stringify({
                wsUrl: presignedWsUrl,
                sessionId: sessionId,
                userId: userId,
                expiresIn: expiresIn,
                message: 'Presigned WebSocket URL with AWS SigV4 authentication'
            })
        };

    } catch (error) {
        console.error('Error generating presigned URL:', error);
        console.error('Error stack:', error.stack);

        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Internal Server Error',
                message: 'Failed to generate presigned WebSocket URL',
                details: error.message
            })
        };
    }
};
