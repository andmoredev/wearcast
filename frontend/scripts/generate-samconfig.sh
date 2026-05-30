#!/bin/bash

# Script to generate samconfig.yaml from template with environment variable substitution

set -e

# Check if template exists
if [ ! -f "samconfig.yaml.template" ]; then
    echo "Error: samconfig.yaml.template not found"
    exit 1
fi

# Check required environment variables
required_vars=("STACK_NAME" "AWS_REGION")
missing_vars=()

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        missing_vars+=("$var")
    fi
done

if [ ${#missing_vars[@]} -ne 0 ]; then
    echo "Error: Missing required environment variables:"
    printf '%s\n' "${missing_vars[@]}"
    echo ""
    echo "Please set the following variables:"
    echo "export STACK_NAME=\"wearcast-frontend\""
    echo "export AWS_REGION=\"us-east-1\""
    exit 1
fi

# Generate samconfig.yaml from template
echo "Generating samconfig.yaml with the following values:"
echo "  STACK_NAME: $STACK_NAME"
echo "  AWS_REGION: $AWS_REGION"

envsubst < samconfig.yaml.template > samconfig.yaml

echo "✅ samconfig.yaml generated successfully"