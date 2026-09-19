# KrishiSetu 2.0 — AWS Cloud Deployment Runbook

This guide details deployment of KrishiSetu 2.0 to AWS infrastructure using containerized microservices.

---

## 1. Deployment Topology Options

### Option A: AWS App Runner (Recommended — Simplest Production Target)
* **Compute**: Fully managed container runner automatically providing TLS termination, autoscaling, and CloudWatch log streaming.
* **Configuration Manifest**: [apprunner.yaml](file:///c:/Users/moomi/OneDrive/Desktop/sites/krishisetu/apprunner.yaml)
* **Container Port**: 3000
* **Health Check Path**: `/health` (Liveness) and `/ready` (Readiness)
* **Instance Sizing**: 1 vCPU, 2 GB Memory

### Option B: Amazon ECS on AWS Fargate
* **Compute**: Serverless container execution within private VPC subnets behind an Application Load Balancer (ALB).
* **Task Definition Manifest**: [aws-ecs-task-definition.json](file:///c:/Users/moomi/OneDrive/Desktop/sites/krishisetu/aws-ecs-task-definition.json)
* **Log Driver**: `awslogs` directing to CloudWatch Log Group `/ecs/krishisetu-backend`

---

## 2. IAM Roles & Least-Privilege Policies

The ECS Task Role or App Runner Instance Role requires permissions for Amazon S3, Amazon Bedrock, and AWS Secrets Manager.

### 2.1 Amazon Bedrock Policy
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BedrockInvokeModelAccess",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": [
        "arn:aws:bedrock:ap-south-1::foundation-model/anthropic.claude-3-5-sonnet-20240620-v1:0",
        "arn:aws:bedrock:ap-south-1::foundation-model/anthropic.claude-3-haiku-20240307-v1:0"
      ]
    }
  ]
}
```

### 2.2 Amazon S3 Media & Quality Evidence Policy
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3PresignedUrlAndReadAccess",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:HeadObject"
      ],
      "Resource": "arn:aws:s3:::krishisetu-media-prod/*"
    }
  ]
}
```

---

## 3. Storage Bucket Configuration (Amazon S3)

1. **Bucket Name**: `krishisetu-media-prod`
2. **Block Public Access**: Enabled on all 4 settings (Private bucket by default).
3. **CORS Configuration**:
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedOrigins": ["https://krishisetu.example.com"],
    "ExposeHeaders": ["ETag"]
  }
]
```

---

## 4. Environment Variables & Secrets Reference

All secrets must be injected from AWS Secrets Manager or AWS Systems Manager Parameter Store.

| Variable Name | Required | Description | Example / Location |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Yes | Runtime environment | `production` |
| `PORT` | Yes | Application listener port | `3000` |
| `DATABASE_URL` | Yes | PostgreSQL connection string with SSL | Secrets Manager: `krishisetu/prod/DATABASE_URL` |
| `JWT_SECRET` | Yes | Secure HMAC JWT signing key ($\ge 16$ chars) | Secrets Manager: `krishisetu/prod/JWT_SECRET` |
| `ADMIN_BOOTSTRAP_KEY` | Yes | Admin creation credential | Secrets Manager: `krishisetu/prod/ADMIN_BOOTSTRAP_KEY` |
| `DATA_GOV_IN_API_KEY` | Yes | Open Government Data API key | Secrets Manager: `krishisetu/prod/DATA_GOV_IN_API_KEY` |
| `STORAGE_PROVIDER` | Yes | Media storage driver | `s3` |
| `AWS_S3_MEDIA_BUCKET`| When S3 | S3 bucket name for uploads | `krishisetu-media-prod` |
| `BEDROCK_PROVIDER` | Yes | AI advisory provider | `aws` |
| `AWS_REGION` | Yes | Primary AWS deployment region | `ap-south-1` |
| `BEDROCK_REGION` | Yes | Amazon Bedrock region | `ap-south-1` |
| `APP_ALLOWED_ORIGINS`| Yes | Allowed web origins | `https://krishisetu.example.com` |

---

## 5. CloudWatch Observability & Monitoring

The Express application automatically outputs structured, sanitized log lines to `stdout`:

- **HTTP Requests**: `[HTTP] GET /api/products 200 4ms [reqId=REQ_1789829103356] [anon]`
- **Server Errors**: `[SERVER ERROR] [reqId=REQ_1789829103451] Error: ...`
- **Security scrubbing**: Passwords, OTP codes, and Bearer tokens are automatically redacted as `****`.

### CloudWatch Metric Filters
1. **Failed Requests (4xx/5xx)**: Filter pattern `[HTTP] * * 5* *`
2. **Dependency Failures**: Filter pattern `[SERVER ERROR] * DB_OPERATION_FAILED`
3. **AI Service Failures**: Filter pattern `[SERVER ERROR] * AI_SERVICE_UNAVAILABLE`

---

## 6. Post-Deployment Verification (Smoke Test)

Run the automated smoke test script against the deployed cloud URL:

```bash
SMOKE_TEST_BASE_URL=https://<APPRUNNER_SERVICE_URL> node scripts/smoke_test.js
```
