---
title: Amazon Bedrock Provider Setup
date: 2026-07-24
status: current
type: guide
tags:
  - aws
  - bedrock
  - provider
  - setup
  - iam
aliases:
  - Bedrock Setup
  - AWS Bedrock Configuration
  - Claude on Bedrock
---

# Amazon Bedrock Provider Setup

Amazon Bedrock provides access to Claude, Llama, Mistral, and other models through AWS — ideal for enterprise compliance and existing AWS infrastructure.

## Quick Start

```sh
# 1. Ensure Bedrock access in your AWS account
#    https://console.aws.amazon.com/bedrock/home

# 2. Enable desired models in Bedrock Model Access
#    https://console.aws.amazon.com/bedrock/home/modelaccess

# 3. Set AWS credentials (choose one method)
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...
export AWS_REGION=us-east-1

# 4. Verify detection
arcana doctor

# 5. Run a session
arcana run "hello"
```

## Authentication Methods

Bedrock supports multiple authentication approaches:

### Method 1: IAM Credentials (Recommended)

```sh
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...
export AWS_REGION=us-east-1
```

### Method 2: AWS Profile

```sh
export AWS_PROFILE=my-profile
export AWS_REGION=us-east-1
```

### Method 3: Bearer Token (Temporary)

```sh
export AWS_BEARER_TOKEN_BEDROCK=...
```

### Method 4: Web Identity (EKS/Kubernetes)

```sh
export AWS_WEB_IDENTITY_TOKEN_FILE=/var/run/secrets/eks.amazonaws.com/serviceaccount/token
export AWS_ROLE_ARN=arn:aws:iam::...
```

### Method 5: Interactive Connect

```sh
arcana connect amazon-bedrock
```

This opens a device-flow login to your AWS account.

## Config File

```json
{
  "provider": "amazon-bedrock",
  "model": "anthropic.claude-sonnet-4-20250514-v1:0",
  "region": "us-east-1"
}
```

With explicit credentials:

```json
{
  "provider": "amazon-bedrock",
  "model": "anthropic.claude-sonnet-4-20250514-v1:0",
  "region": "us-east-1",
  "credentials": {
    "accessKeyId": "AKIA...",
    "secretAccessKey": "...",
    "region": "us-east-1"
  }
}
```

## Supported Models

Bedrock uses **full model IDs** (not short names). Common models:

| Model ID | Short Name | Best For | Cost Tier |
|----------|-----------|----------|-----------|
| `anthropic.claude-sonnet-4-20250514-v1:0` | Claude Sonnet 4 | Coding, writing (recommended) | $$$ |
| `anthropic.claude-opus-4-20250514-v1:0` | Claude Opus 4 | Deep analysis | $$$$ |
| `anthropic.claude-3-5-haiku-20241022-v1:0` | Claude 3.5 Haiku | Budget, fast | $ |
| `anthropic.claude-3-5-sonnet-20241022-v2:0` | Claude 3.5 Sonnet | Previous gen (legacy) | $$ |
| `meta.llama3-3-70b-instruct-v1:0` | Llama 3.3 70B | Open-source, budget | $ |
| `meta.llama3-1-405b-instruct-v1:0` | Llama 3.1 405B | Large open-source | $$$ |
| `mistral.mistral-large-2402-v1:0` | Mistral Large | European compliance | $$ |
| `cohere.command-r-plus-v1:0` | Command R+ | RAG, grounding | $$ |

## Available Protocols

Bedrock uses the **Converse API** (`bedrock-converse`):

- Unified API across all Bedrock models
- Tool calling with cross-model compatibility
- Guardrails integration
- Prompt caching (Anthropic models)

## Region Configuration

Bedrock models are region-specific. Not all models are available in all regions.

```sh
# Check model availability
aws bedrock list-foundation-models --region us-east-1

# Set region
export AWS_REGION=us-east-1
```

Common regions: `us-east-1`, `us-west-2`, `eu-west-1`, `ap-southeast-1`

## Pricing (as of July 2026)

Bedrock pricing matches the model provider's pricing (e.g., Claude on Bedrock = Claude API pricing). No additional Bedrock markup for most models.

| Model | Input | Output |
|-------|-------|--------|
| Claude Sonnet 4 | $3.00/M | $15.00/M |
| Claude Opus 4 | $15.00/M | $75.00/M |
| Claude 3.5 Haiku | $0.80/M | $4.00/M |
| Llama 3.3 70B | $0.72/M | $0.72/M |

**Note:** On-demand pricing shown. Provisioned throughput and commitment discounts available.

## Troubleshooting

### "No credentials found"

```sh
# Verify AWS credentials
aws sts get-caller-identity

# Set credentials
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...
```

### "Model not enabled"

Bedrock requires you to request model access in the console:

1. Go to **Bedrock** → **Model access**
2. Click **Request model access**
3. Select desired models
4. Wait for approval (usually instant for most models)

### "Access denied"

Ensure your IAM role/user has:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": "arn:aws:bedrock:*::foundation-model/*"
    }
  ]
}
```

### "Region not supported"

Switch to a region with Bedrock availability. `us-east-1` and `us-west-2` have the broadest model selection.

### "ThrottlingException"

Bedrock has per-model concurrency limits. Request quota increases through the AWS Support Center if needed.

## Related

- [[providers-comparison]] — Compare Bedrock with other providers
- [[model-recommendations]] — Which Bedrock model to use for each task
- [[configuration]] — Full config reference
