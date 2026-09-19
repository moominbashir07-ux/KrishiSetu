/**
 * KrishiSetu 2.0 — Phase 8: AWS Cloud Deployment & Real-Service Integration
 * Automated Test Suite
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const app = require('../server');
const S3StorageProvider = require('../services/storage/s3StorageProvider');
const AwsBedrockProvider = require('../services/ai/awsBedrockProvider');
const DataGovMarketProvider = require('../services/market/dataGovMarketProvider');
const { BedrockAdvisorService } = require('../services/ai/bedrockAdvisorService');

describe('Phase 8: AWS Cloud Deployment & Real-Service Integration Suite', () => {
  let server;
  let baseUrl;
  let originalNodeEnv;

  before(async () => {
    originalNodeEnv = process.env.NODE_ENV;
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    process.env.NODE_ENV = originalNodeEnv;
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // ===========================================================================
  // 1. Containerization & Deployment Manifests Audit
  // ===========================================================================
  describe('1. Containerization & Deployment Manifests', () => {
    test('Dockerfile is Node 22 compliant, enforces non-root user and healthcheck', () => {
      const dockerfilePath = path.join(__dirname, '..', 'Dockerfile');
      assert.ok(fs.existsSync(dockerfilePath), 'Dockerfile must exist');
      const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');

      assert.ok(dockerfile.includes('node:22'), 'Must use Node 22 base image');
      assert.ok(dockerfile.includes('USER node'), 'Must drop privileges to non-root user');
      assert.ok(dockerfile.includes('HEALTHCHECK'), 'Must define native container HEALTHCHECK');
      assert.ok(dockerfile.includes('ENV NODE_ENV=production'), 'Must set NODE_ENV=production');
      assert.ok(dockerfile.includes('EXPOSE 3000'), 'Must expose standard port 3000');
    });

    test('.dockerignore strictly excludes credentials, environment files, and git history', () => {
      const ignorePath = path.join(__dirname, '..', '.dockerignore');
      assert.ok(fs.existsSync(ignorePath), '.dockerignore must exist');
      const ignore = fs.readFileSync(ignorePath, 'utf8');

      assert.ok(ignore.includes('.env'), 'Must ignore .env');
      assert.ok(ignore.includes('.git'), 'Must ignore .git');
      assert.ok(ignore.includes('node_modules'), 'Must ignore local node_modules');
      assert.ok(ignore.includes('scratch'), 'Must ignore scratch directory');
    });

    test('apprunner.yaml specifies nodejs22 runtime and standard port configuration', () => {
      const apprunnerPath = path.join(__dirname, '..', 'apprunner.yaml');
      assert.ok(fs.existsSync(apprunnerPath), 'apprunner.yaml must exist');
      const yaml = fs.readFileSync(apprunnerPath, 'utf8');

      assert.ok(yaml.includes('runtime: nodejs22'));
      assert.ok(yaml.includes('port: 3000'));
      assert.ok(yaml.includes('NODE_ENV'));
    });

    test('aws-ecs-task-definition.json defines Fargate compatibility and Secrets Manager references', () => {
      const ecsPath = path.join(__dirname, '..', 'aws-ecs-task-definition.json');
      assert.ok(fs.existsSync(ecsPath), 'aws-ecs-task-definition.json must exist');
      const json = JSON.parse(fs.readFileSync(ecsPath, 'utf8'));

      assert.ok(json.requiresCompatibilities.includes('FARGATE'));
      assert.strictEqual(json.networkMode, 'awsvpc');
      const container = json.containerDefinitions[0];
      assert.strictEqual(container.portMappings[0].containerPort, 3000);
      assert.ok(container.secrets.some(s => s.name === 'DATABASE_URL'));
      assert.ok(container.secrets.some(s => s.name === 'JWT_SECRET'));
    });
  });

  // ===========================================================================
  // 2. Reverse Proxy & Forwarded Header Trust
  // ===========================================================================
  describe('2. Reverse Proxy & Protocol Forwarding', () => {
    test('trust proxy is enabled for AWS App Runner and ALB single-hop architecture', () => {
      assert.strictEqual(app.get('trust proxy'), 1);
    });

    test('Handles X-Forwarded-Proto header correctly on liveness endpoint', async () => {
      const res = await fetch(`${baseUrl}/health`, {
        headers: {
          'X-Forwarded-Proto': 'https',
          'X-Forwarded-For': '203.0.113.195'
        }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'ok');
    });
  });

  // ===========================================================================
  // 3. Amazon S3 Storage Provider Verification
  // ===========================================================================
  describe('3. Amazon S3 Storage Provider', () => {
    test('Throws actionable error if AWS_S3_MEDIA_BUCKET is missing', () => {
      const originalBucket = process.env.AWS_S3_MEDIA_BUCKET;
      delete process.env.AWS_S3_MEDIA_BUCKET;
      assert.throws(
        () => new S3StorageProvider({ bucket: null }),
        /AWS_S3_MEDIA_BUCKET configuration is required/
      );
      process.env.AWS_S3_MEDIA_BUCKET = originalBucket;
    });

    test('Constructs compliant S3 presigned upload command structure', async () => {
      const provider = new S3StorageProvider({
        bucket: 'krishisetu-test-bucket',
        region: 'ap-south-1',
        credentials: {
          accessKeyId: 'AKIA_MOCK_TEST_ID',
          secretAccessKey: 'mock_test_secret_for_presigning_verification'
        }
      });

      const presigned = await provider.getPresignedUploadUrl({
        key: 'products/P101/batch-harvest-proof.jpg',
        contentType: 'image/jpeg',
        expiresIn: 600
      });

      assert.strictEqual(presigned.provider, 's3');
      assert.strictEqual(presigned.method, 'PUT');
      assert.strictEqual(presigned.headers['Content-Type'], 'image/jpeg');
      assert.strictEqual(presigned.key, 'products/P101/batch-harvest-proof.jpg');
      assert.ok(presigned.uploadUrl.includes('krishisetu-test-bucket'));
    });

    test('Generates public read URL using standard S3 regional URL or CloudFront', () => {
      const provider = new S3StorageProvider({
        bucket: 'krishisetu-media-prod',
        region: 'ap-south-1'
      });

      const readUrl = provider.getReadUrl('verification/7-12-land.pdf');
      assert.strictEqual(readUrl, 'https://krishisetu-media-prod.s3.ap-south-1.amazonaws.com/verification/7-12-land.pdf');
    });
  });

  // ===========================================================================
  // 4. Amazon Bedrock Runtime Provider Verification
  // ===========================================================================
  describe('4. Amazon Bedrock AI Provider', () => {
    test('AwsBedrockProvider recognizes supported Indian and Global Bedrock regions', () => {
      const supported = ['ap-south-1', 'us-east-1', 'us-west-2', 'eu-west-1'];
      for (const region of supported) {
        const provider = new AwsBedrockProvider({ region });
        assert.strictEqual(provider.isAvailable(), true);
      }
    });

    test('AwsBedrockProvider fails fast with 503 when Bedrock is unavailable or unconfigured', async () => {
      const provider = new AwsBedrockProvider({ region: 'invalid-region-xyz' });
      assert.strictEqual(provider.isAvailable(), false);
      await assert.rejects(
        () => provider.invokeModel({ prompt: 'Recommend onion harvest price' }),
        (err) => {
          assert.strictEqual(err.statusCode, 503);
          assert.strictEqual(err.code, 'AI_SERVICE_UNAVAILABLE');
          return true;
        }
      );
    });

    test('BedrockAdvisorService rejects silent mock fallbacks in production', () => {
      process.env.NODE_ENV = 'production';
      const advisorService = new BedrockAdvisorService();
      const status = advisorService.getProviderStatus();
      assert.strictEqual(status.isMock, false);
      process.env.NODE_ENV = 'test';
    });
  });

  // ===========================================================================
  // 5. Official Government Market Data Pipeline (data.gov.in / AGMARKNET)
  // ===========================================================================
  describe('5. Real Market Data Provider (data.gov.in)', () => {
    const provider = new DataGovMarketProvider();

    test('Matches official Ministry of Agriculture resource identifier', () => {
      assert.strictEqual(provider.resourceId, '9ef84268-d588-465a-a308-a864a43d0070');
      assert.strictEqual(provider.sourceMetadata.id, 'SRC_DATAGOVIN_AGMARKNET');
    });

    test('parseDate accurately converts Indian DD/MM/YYYY arrival dates to ISO format', () => {
      assert.strictEqual(provider.parseDate('19/09/2026'), '2026-09-19');
      assert.strictEqual(provider.parseDate('05/04/2026'), '2026-04-05');
      assert.strictEqual(provider.parseDate('2026-09-19'), '2026-09-19');
    });

    test('parsePrice accurately cleanses currency symbols, commas, and invalid values', () => {
      assert.strictEqual(provider.parsePrice('₹ 2,450.00'), 2450);
      assert.strictEqual(provider.parsePrice('3500'), 3500);
      assert.strictEqual(provider.parsePrice(2800), 2800);
      assert.strictEqual(provider.parsePrice('0'), null);
      assert.strictEqual(provider.parsePrice('N/A'), null);
      assert.strictEqual(provider.parsePrice(null), null);
    });

    test('calculateFreshness accurately assigns LIVE for arrivals within 24 hours', () => {
      const now = new Date('2026-09-19T14:00:00Z');
      const todayArrival = '2026-09-19';
      assert.strictEqual(provider.calculateFreshness(todayArrival, now), 'LIVE');

      const yesterdayArrival = '2026-09-18';
      assert.strictEqual(provider.calculateFreshness(yesterdayArrival, now), 'RECENT');

      const oldArrival = '2026-09-15';
      assert.strictEqual(provider.calculateFreshness(oldArrival, now), 'STALE');
    });
  });

  // ===========================================================================
  // 6. Production Deployment Smoke Test Runner
  // ===========================================================================
  describe('6. Automated Deployment Smoke Test', () => {
    test('scripts/smoke_test.js passes 6/6 checks against running server instance', async () => {
      const { runSmokeTest } = require('../scripts/smoke_test');
      assert.strictEqual(typeof runSmokeTest, 'function', 'runSmokeTest must be exported');

      const result = await runSmokeTest(baseUrl);
      assert.strictEqual(result.totalCount, 6, 'Must run 6 smoke test assertions');
      assert.strictEqual(result.passedCount, 6, 'All 6 assertions must pass');
      assert.strictEqual(result.allPassed, true, 'Deployment status must be VERIFIED HEALTHY');
    });
  });
});
