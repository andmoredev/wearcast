import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } from '@aws-sdk/client-bedrock-agentcore';

const agentCoreClient = new BedrockAgentCoreClient({ region: process.env.AWS_REGION });

export const handler = async (event) => {
    try {
        console.log('Received AgentCore invocation event:', JSON.stringify(event, null, 2));

        const { sessionId, request, userId } = event;

        if (!sessionId || !request) {
            throw new Error('Missing required parameters: sessionId and request');
        }

        console.log('Invoking AgentCore Runtime for session:', sessionId);

        const payloadJson = JSON.stringify({
            request: request,
            session_id: sessionId,
            user_id: userId,
        });

        const invokeCommand = new InvokeAgentRuntimeCommand({
            agentRuntimeArn: process.env.AGENT_RUNTIME_ARN,
            runtimeSessionId: sessionId,
            payload: new TextEncoder().encode(payloadJson)
        });

        const response = await agentCoreClient.send(invokeCommand);
        console.log('AgentCore Runtime response received');

        const textResponse = await response.response.transformToString();
        console.log('Raw AgentCore response:', textResponse);

        let agentResponse;
        try {
            agentResponse = JSON.parse(textResponse);
        } catch (parseError) {
            console.warn('Could not parse AgentCore response as JSON, returning as text:', parseError);
            agentResponse = textResponse;
        }

        return {
            sessionId,
            request,
            response: typeof agentResponse === 'object' && agentResponse.response ? agentResponse.response : textResponse,
            status: 'completed'
        };

    } catch (error) {
        console.error('Error invoking AgentCore Runtime:', error);
        throw error;
    }
};
