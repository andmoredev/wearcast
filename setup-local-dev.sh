#!/bin/bash

# AgentCore Chatbot - Local Development Setup Script
# This script helps you set up local development environment quickly

set -e

echo "AgentCore Chatbot - Local Development Setup"
echo "============================================"
echo ""

# Default values
BACKEND_STACK_NAME="${BACKEND_STACK_NAME:-agentcore-chatbot-backend-dev}"
AWS_REGION="${AWS_REGION:-us-east-1}"
SKIP_BACKEND_DEPLOY="${SKIP_BACKEND_DEPLOY:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_step() {
    echo -e "${BLUE}$1${NC}"
}

print_success() {
    echo -e "${GREEN}$1${NC}"
}

print_warning() {
    echo -e "${YELLOW}$1${NC}"
}

print_error() {
    echo -e "${RED}$1${NC}"
}

# Check prerequisites
print_step "Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18+ and try again."
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_error "Node.js version $NODE_VERSION is too old. Please install Node.js 18+ and try again."
    exit 1
fi

print_success "Node.js $(node --version) found"

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI is not installed. Please install AWS CLI and configure it."
    exit 1
fi

print_success "AWS CLI found"

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS credentials not configured. Please run 'aws configure' or 'aws sso login'."
    exit 1
fi

AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
print_success "AWS credentials configured (Account: $AWS_ACCOUNT)"

# Check SAM CLI
if ! command -v sam &> /dev/null; then
    print_warning "SAM CLI not found. Backend local testing will not be available."
    print_warning "Install SAM CLI from: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html"
else
    print_success "SAM CLI found"
fi

echo ""

# Ask user about backend deployment
if [ "$SKIP_BACKEND_DEPLOY" = "false" ]; then
    echo "Do you want to deploy the backend stack to AWS?"
    echo "This will create AWS resources and may incur costs."
    read -p "Deploy backend stack? (y/N): " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        DEPLOY_BACKEND=true
    else
        DEPLOY_BACKEND=false
        print_warning "Skipping backend deployment."
        print_warning "You can deploy later by running: cd backend && sam build && sam deploy --guided"
    fi
else
    DEPLOY_BACKEND=false
    print_warning "Backend deployment skipped (SKIP_BACKEND_DEPLOY=true)"
fi

echo ""

# Deploy backend if requested
if [ "$DEPLOY_BACKEND" = "true" ]; then
    print_step "Deploying backend stack..."

    cd backend

    # Create samconfig.yaml from template
    print_step "Creating SAM configuration..."
    export STACK_NAME="$BACKEND_STACK_NAME"
    export AWS_REGION="$AWS_REGION"
    envsubst < samconfig.yaml.template > samconfig.yaml

    print_success "SAM configuration created"

    # Build and deploy
    print_step "Building SAM application..."
    if ! sam build; then
        print_error "SAM build failed. Please check the error messages above."
        exit 1
    fi

    print_success "SAM build completed"

    print_step "Deploying to AWS..."
    print_warning "This may take several minutes..."

    if ! sam deploy --no-confirm-changeset --no-fail-on-empty-changeset; then
        print_error "SAM deployment failed. Please check the error messages above."
        exit 1
    fi

    print_success "Backend stack deployed successfully!"

    cd ..
fi

# Set up frontend
print_step "Setting up frontend..."

cd frontend

# Install dependencies
print_step "Installing frontend dependencies..."
if ! npm install; then
    print_error "npm install failed. Please check the error messages above."
    exit 1
fi

print_success "Frontend dependencies installed"

# Fetch API and Cognito configuration if backend is deployed
if [ "$DEPLOY_BACKEND" = "true" ] || aws cloudformation describe-stacks --stack-name "$BACKEND_STACK_NAME" &> /dev/null; then
    print_step "Fetching configuration from backend stack..."

    BACKEND_API_URL=$(aws cloudformation describe-stacks \
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

    if [ -n "$BACKEND_API_URL" ] && [ "$BACKEND_API_URL" != "None" ] && \
       [ -n "$USER_POOL_ID" ] && [ "$USER_POOL_ID" != "None" ] && \
       [ -n "$USER_POOL_CLIENT_ID" ] && [ "$USER_POOL_CLIENT_ID" != "None" ]; then

        # Create .env.local file with all configuration
        cat > .env.local << EOF
# Auto-generated configuration from backend stack
# Generated at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Backend Stack: $BACKEND_STACK_NAME
# Region: $AWS_REGION

# Backend API Configuration
VITE_API_BASE_URL=$BACKEND_API_URL

# AWS Cognito Configuration
VITE_USER_POOL_ID=$USER_POOL_ID
VITE_USER_POOL_CLIENT_ID=$USER_POOL_CLIENT_ID
VITE_AWS_REGION=$AWS_REGION
EOF

        print_success "Environment configuration saved to .env.local"

        # Also update API config for reference
        mkdir -p src/config
        cat > src/config/api.ts << EOF
// Auto-generated API configuration from backend stack
// Generated at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
// Backend Stack: $BACKEND_STACK_NAME
// Region: $AWS_REGION

export const API_CONFIG = {
  baseUrl: '$BACKEND_API_URL',
  endpoints: {
    query: 'query'
  }
} as const;

export default API_CONFIG;
EOF

        print_success "API configuration saved to src/config/api.ts"
    else
        print_warning "Backend configuration not found in stack outputs"
        print_warning "You'll need to manually create .env.local with your backend configuration"
        print_warning "See .env.example for the required variables"
    fi
else
    print_warning "Backend stack not found or not deployed"
    print_warning "Create .env.local based on .env.example when backend is ready"
fi

cd ..

# Final setup complete
echo ""
echo "Setup Complete!"
echo "==============="
echo ""

if [ "$DEPLOY_BACKEND" = "true" ] || aws cloudformation describe-stacks --stack-name "$BACKEND_STACK_NAME" &> /dev/null; then
    BACKEND_API_URL=$(aws cloudformation describe-stacks \
        --stack-name "$BACKEND_STACK_NAME" \
        --region "$AWS_REGION" \
        --query "Stacks[0].Outputs[?OutputKey=='BackendApiUrl'].OutputValue" \
        --output text 2>/dev/null || echo "Not available")

    USER_POOL_ID=$(aws cloudformation describe-stacks \
        --stack-name "$BACKEND_STACK_NAME" \
        --region "$AWS_REGION" \
        --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" \
        --output text 2>/dev/null || echo "Not available")

    echo "Configuration Summary:"
    echo "   Backend Stack: $BACKEND_STACK_NAME"
    echo "   AWS Region: $AWS_REGION"
    echo "   Backend API: $BACKEND_API_URL"
    echo "   User Pool ID: $USER_POOL_ID"
    echo "   Environment: frontend/.env.local"
else
    echo "Configuration Summary:"
    echo "   Backend Stack: Not deployed"
fi

echo ""
echo "Next Steps:"
echo ""
echo "1. Start the frontend development server:"
echo "   cd frontend && npm run dev"
echo ""
echo "2. Open your browser to: http://localhost:5173"
echo ""

if command -v sam &> /dev/null; then
    echo "Optional - Backend Local Development:"
    echo "   cd backend && sam local start-api --port 3001"
    echo ""
fi
