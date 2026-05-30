#!/bin/bash

# Script to build frontend with API and Cognito configuration from backend stack outputs

set -e

# Default values
BACKEND_STACK_NAME="${BACKEND_STACK_NAME:-wearcast-backend-andmored}"
FRONTEND_STACK_NAME="${FRONTEND_STACK_NAME:-wearcast-frontend-andmored}"
AWS_REGION="${AWS_REGION:-us-east-1}"

echo "Fetching configuration from backend stack: $BACKEND_STACK_NAME"

# Get all required outputs from CloudFormation stack
API_URL=$(aws cloudformation describe-stacks \
    --stack-name "$BACKEND_STACK_NAME" \
    --region "$AWS_REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='BackendApiUrl'].OutputValue" \
    --output text 2>/dev/null || echo "")

USER_POOL_ID=$(aws cloudformation describe-stacks \
    --stack-name "$BACKEND_STACK_NAME" \
    --region "$AWS_REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" \
    --output text 2>/dev/null || echo "")

USER_POOL_CLIENT_ID=$(aws cloudformation describe-stacks \
    --stack-name "$BACKEND_STACK_NAME" \
    --region "$AWS_REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue" \
    --output text 2>/dev/null || echo "")

# Validation
if [ -z "$API_URL" ] || [ "$API_URL" = "None" ]; then
    echo "ERROR: Could not fetch API URL from stack $BACKEND_STACK_NAME"
    echo "   Make sure the backend stack is deployed and has BackendApiUrl output"
    exit 1
fi

if [ -z "$USER_POOL_ID" ] || [ "$USER_POOL_ID" = "None" ]; then
    echo "ERROR: Could not fetch User Pool ID from stack $BACKEND_STACK_NAME"
    echo "   Make sure the backend stack is deployed and has UserPoolId output"
    exit 1
fi

if [ -z "$USER_POOL_CLIENT_ID" ] || [ "$USER_POOL_CLIENT_ID" = "None" ]; then
    echo "ERROR: Could not fetch User Pool Client ID from stack $BACKEND_STACK_NAME"
    echo "   Make sure the backend stack is deployed and has UserPoolClientId output"
    exit 1
fi

echo "Found configuration:"
echo "   API URL: $API_URL"
echo "   User Pool ID: $USER_POOL_ID"
echo "   User Pool Client ID: $USER_POOL_CLIENT_ID"
echo "   AWS Region: $AWS_REGION"

# Export environment variables for Vite build
export VITE_API_BASE_URL="$API_URL"
export VITE_USER_POOL_ID="$USER_POOL_ID"
export VITE_USER_POOL_CLIENT_ID="$USER_POOL_CLIENT_ID"
export VITE_AWS_REGION="$AWS_REGION"

# Create config directory if it doesn't exist
mkdir -p src/config

# Create environment configuration file for reference
echo "Creating environment configuration..."
cat > src/config/api.ts << EOF
// Auto-generated API configuration from backend stack
// Generated at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
// Backend Stack: $BACKEND_STACK_NAME
// Region: $AWS_REGION

export const API_CONFIG = {
  baseUrl: '$API_URL',
  endpoints: {
    query: 'query'
  }
} as const;

export default API_CONFIG;
EOF

echo "Environment configuration created at src/config/api.ts"

# Build the frontend with environment variables injected
echo "Building frontend with configuration..."
npm run build

echo ""
echo "Frontend build completed successfully!"
echo "Configuration injected:"
echo "   VITE_API_BASE_URL=$API_URL"
echo "   VITE_USER_POOL_ID=$USER_POOL_ID"
echo "   VITE_USER_POOL_CLIENT_ID=$USER_POOL_CLIENT_ID"
echo "   VITE_AWS_REGION=$AWS_REGION"
echo ""
