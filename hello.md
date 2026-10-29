# AWS CloudFront & Backend Integration Guide

This guide provides a verified, step-by-step configuration to connect the Veridian Angular frontend (`dist/veridian/browser`) hosted on AWS CloudFront to your three backend repositories without modifying a single line of frontend or backend code.

---

## 1. Architecture & Verification Summary

### Why No Code Changes Are Required
1. **Relative API Paths Everywhere**:
   - [`src/main.ts`](src/main.ts) sets `BASE_PATH` to `'/api'`.
   - [`AnalyticsApiService`](src/app/core/api/analytics-api.service.ts) and [`PlatformAnalyticsService`](src/app/core/api/auth/api/platform-analytics.service.ts) use `'/analytics-api'`.
   - [`PortfolioValueService`](src/app/core/api/portfolio-value.service.ts) and [`Store`](src/app/core/state/portfolio.store.ts) use `'/api/v1/...'`.
   - Because all backend calls are relative paths, the browser sends every request to your **CloudFront HTTPS domain** (same origin). This eliminates browser **CORS preflight issues** and **HTTPS Mixed-Content blocks** (even if your backend servers only listen on plain `HTTP`).
2. **Hash-Based Routing Enabled**:
   - [`src/main.ts`](src/main.ts) configures `provideRouter(routes, withHashLocation())`. Deep links (e.g., `/#/client/home`, `/#/admin/orders`) always request `/index.html` from S3/CloudFront, so page refreshes work out of the box.

### How `proxy.conf.cjs` Maps to AWS CloudFront
Because [`proxy.conf.cjs`](proxy.conf.cjs) is only used by `ng serve` during local development, CloudFront must replicate its 3 routing rules and 2 `pathRewrite` rules:

| Precedence | CloudFront Path Pattern | Local `proxy.conf.cjs` Target | CloudFront Function Rewrite | Example Browser Request → Rewritten Backend URI | HTTP Methods Used in Codebase |
| :---: | :--- | :--- | :--- | :--- | :--- |
| **0** | `/analytics-api/*` | `http://localhost:5000` (Python FastAPI/Flask) | Strip `/analytics-api` (`^/analytics-api` → `""`) | `/analytics-api/api/analytics/?days=30` → `/api/analytics/?days=30`<br>`/analytics-api/analytics/instruments/` → `/analytics/instruments/`<br>`/analytics-api/stock_statistics/AAPL` → `/stock_statistics/AAPL` | `GET` |
| **1** | `/api/v1/*` | `http://localhost:8085` (Spring Boot Core/Trading) | **None** (keep `/api/v1` intact) | `/api/v1/trading/market-data/tickers` → `/api/v1/trading/market-data/tickers`<br>`/api/v1/orders/buy` → `/api/v1/orders/buy`<br>`/api/v1/clients/profile` → `/api/v1/clients/profile`<br>`/api/v1/employees/admin/update/1` → `/api/v1/employees/admin/update/1` | `GET`, `POST`, `PATCH` |
| **2** | `/api/*` | `http://localhost:3000` (NestJS Auth & Chatbert) | Strip `/api` (`^/api` → `""`) | `/api/auth/login` → `/auth/login`<br>`/api/auth/refresh` → `/auth/refresh`<br>`/api/auth/employees/reporter` → `/auth/employees/reporter`<br>`/api/chat/message` → `/chat/message` | `GET`, `POST` |
| **3** | `Default (*)` | Static files (`ng serve`) | **None** | `/index.html`, `/main.js`, `/styles.css`, `/assets/...` | `GET`, `HEAD` |

---

## 2. Verified AWS CloudFront Mechanics

Before configuring, keep these verified AWS CloudFront rules in mind:

1. **Behavior Matching Happens *Before* Viewer Request Functions**:
   - When a request arrives at CloudFront, CloudFront **first** matches the incoming URI against your ordered **Cache Behaviors** (`0` → `1` → `2` → `Default (*)`).
   - **After** selecting the matching Behavior, CloudFront runs the **Viewer Request CloudFront Function** attached to that Behavior.
   - Rewriting `request.uri` inside the function modifies the path sent to that Behavior's Origin **without** causing CloudFront to switch to a different Behavior.
2. **Custom Ports Are Supported**:
   - CloudFront Custom Origins support ports `80`, `443`, and `1024–65535`. Your backend ports (`3000`, `5000`, `8085`) are all natively supported.
3. **Origin Domain Name Must Be a DNS Hostname (Not a Raw IP)**:
   - CloudFront rejects raw IPv4 addresses (like `54.12.34.56`) in the **Origin domain** field.
   - If your backends run on EC2, copy the **Public IPv4 DNS** hostname from the EC2 console (e.g., `ec2-54-12-34-56.compute-1.amazonaws.com`), or use an Application Load Balancer (ALB) / App Runner / API Gateway DNS name.
4. **Forwarding `Authorization: Bearer <token>` on `GET` Requests**:
   - CloudFront strips the `Authorization` header on `GET` requests by default unless caching is disabled and the origin request policy forwards viewer headers.
   - Pairing **Cache Policy: `CachingDisabled`** with **Origin Request Policy: `AllViewerExceptHostHeader`** guarantees that `Authorization: Bearer <token>` (attached by [`auth.interceptor.ts`](src/app/core/auth/auth.interceptor.ts)), `Content-Type`, cookies, and all query parameters (`?days=30`, `?from=...&to=...`, `?amount=...`, `?ticker=...`) are forwarded on every request without caching user data across sessions.

---

## 3. Step-by-Step AWS Setup Guide

### Step 0: Verify S3 Static File Layout (`dist/veridian/browser`)

Angular's `@angular/build:application` builder outputs the production web files inside `dist/veridian/browser/`:
```text
dist/veridian/browser/
├── assets/
├── chunk-*.js
├── index.html
├── main.js
└── styles.css
```
- **Check 1**: In your CloudFront Distribution → **General** → **Settings**, verify **Default root object** is set to `index.html` (without a leading slash).
- **Check 2**:
  - If you uploaded the *contents* of `dist/veridian/browser/` directly to the root of your S3 bucket, leave **Origin path** on your S3 Origin blank.
  - If you uploaded the `browser` folder itself (so `index.html` is at `s3://your-bucket/browser/index.html` or `s3://your-bucket/veridian/browser/index.html`), set **Origin path** on your S3 Origin to `/browser` (or `/veridian/browser`).

---

### Step 1: Configure Backend Security Groups

On the EC2 instances or Application Load Balancers running your three backend services:
1. Open **EC2 → Security Groups** → select your backend security group(s) → **Edit inbound rules**.
2. Add inbound `Custom TCP` rules for your backend ports (`5000`, `8085`, `3000` — or `80`/`443` if behind an ALB).
3. Set the **Source** to the AWS-managed CloudFront prefix list (`com.amazonaws.global.cloudfront.origin-facing`) or `0.0.0.0/0` (note: if using the CloudFront prefix list on EC2 security groups, ensure your account's security group quota supports the prefix list weight, otherwise use your ALB or `0.0.0.0/0`).

---

### Step 2: Create the 3 Backend Origins in CloudFront

Go to **CloudFront → Distributions → [Your Distribution] → Origins → Create origin** and create three Custom Origins:

#### Origin A: Python Analytics (`port 5000`)
- **Origin domain**: Your Python backend DNS name (e.g., `ec2-xx-xx-xx-xx.compute-1.amazonaws.com` or ALB DNS)
- **Protocol**: `HTTP only` *(or `HTTPS only` if your backend has TLS/SSL configured)*
- **HTTP port**: `5000` *(or `80` if behind an HTTP ALB)*
- **Origin path**: *(Leave blank)*
- **Name**: `analytics-backend-origin`
- **Response timeout**: `30` seconds (matches the 20s timeout in [`AnalyticsApiService`](src/app/core/api/analytics-api.service.ts))

#### Origin B: Spring Boot Core/Trading (`port 8085`)
- **Origin domain**: Your Spring Boot backend DNS name
- **Protocol**: `HTTP only` *(or `HTTPS only` if TLS is configured)*
- **HTTP port**: `8085` *(or `80` if behind an HTTP ALB)*
- **Origin path**: *(Leave blank)*
- **Name**: `springboot-backend-origin`
- **Response timeout**: `30` seconds

#### Origin C: NestJS Auth & Chatbert (`port 3000`)
- **Origin domain**: Your Auth/Chatbert backend DNS name
- **Protocol**: `HTTP only` *(or `HTTPS only` if TLS is configured)*
- **HTTP port**: `3000` *(or `80` if behind an HTTP ALB)*
- **Origin path**: *(Leave blank)*
- **Name**: `auth-chat-backend-origin`
- **Response timeout**: `30` seconds

*(Note: If all 3 services run on the **same** EC2 instance on ports `5000`, `8085`, and `3000`, you still create 3 separate Origins in CloudFront — each using the same EC2 Public IPv4 DNS name, but with different `Name` and `HTTP port` values).*

---

### Step 3: Create the CloudFront Function for `pathRewrite`

CloudFront must strip `/analytics-api` before forwarding to Python (`:5000`) and strip `/api` before forwarding to NestJS (`:3000`), just like `pathRewrite` in [`proxy.conf.cjs`](proxy.conf.cjs).

1. In the left sidebar of the CloudFront console, go to **Functions → Create function**.
2. **Name**: `veridian-api-path-rewrite`
3. **Runtime**: `cloudfront-js-2.0`
4. Click **Create function**, then paste the following into the **Function code** editor:

```javascript
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // 1. Python Analytics rewrite: "^/analytics-api" -> ""
  if (uri === '/analytics-api') {
    request.uri = '/';
  } else if (uri.startsWith('/analytics-api/')) {
    request.uri = uri.replace(/^\/analytics-api/, '');
  }
  // 2. NestJS Auth & Chat rewrite: "^/api" -> "" (excluding /api/v1/*)
  else if (uri === '/api') {
    request.uri = '/';
  } else if (uri.startsWith('/api/') && !uri.startsWith('/api/v1/')) {
    request.uri = uri.replace(/^\/api/, '');
  }

  return request;
}
```

5. Click **Save changes**.
6. Go to the **Publish** tab and click **Publish function** *(a CloudFront Function must be published before it takes effect)*.

---

### Step 4: Create the 3 Cache Behaviors (Exact Order Required)

Go to **CloudFront → Distributions → [Your Distribution] → Behaviors → Create behavior**.

Create the following three behaviors using the **Shared Settings** below:

#### Shared Settings for All 3 Backend Behaviors
- **Viewer protocol policy**: `Redirect HTTP to HTTPS`
- **Allowed HTTP methods**: `GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE`
- **Cache key and origin requests**: Select `Cache policy and origin request policy (recommended)`
  - **Cache policy**: `CachingDisabled` *(AWS Managed: `4135ea2d-6df8-44a3-9df3-4b5a84be39ad`)*
  - **Origin request policy**: `AllViewerExceptHostHeader` *(AWS Managed: `b689b0a8-53d0-40ab-baf2-68738e2966ac`)*

#### Individual Behavior Settings

| Precedence | Path Pattern | Origin | Function Associations → **Viewer request** |
| :---: | :--- | :--- | :--- |
| **0** | `/analytics-api/*` | `analytics-backend-origin` (`:5000`) |Function type: `CloudFront Functions`<br>Function ARN/Name: `veridian-api-path-rewrite` |
| **1** | `/api/v1/*` | `springboot-backend-origin` (`:8085`) | `No association` *(Spring Boot expects `/api/v1/...`)* |
| **2** | `/api/*` | `auth-chat-backend-origin` (`:3000`) | Function type: `CloudFront Functions`<br>Function ARN/Name: `veridian-api-path-rewrite` |
| **3** | `Default (*)` | Your S3 Bucket Origin | `No association` |

> **IMPORTANT**: In the **Behaviors** tab, verify that `/api/v1/*` (Precedence 1) is listed **above** `/api/*` (Precedence 2). If `/api/*` is above `/api/v1/*`, use **Move up** on `/api/v1/*` and click **Save changes**.

---

## 4. End-to-End Verification Checklist

Once your CloudFront distribution status changes from `Deploying` to **`Enabled`**:

1. **Test Static Frontend**:
   - Open `https://<your-cloudfront-domain>.cloudfront.net` in your browser.
   - Verify it redirects to `https://<your-cloudfront-domain>.cloudfront.net/#/login` and loads styles and ticker logos.

2. **Test Auth & Chatbert Backend (`/api/*` → `:3000`)**:
   - Try signing in on `/#/login` or asking Chatbert a question.
   - In browser DevTools (**Network** tab), confirm `POST /api/auth/login` (or `POST /api/chat/message`) returns `200`/`201`.

3. **Test Spring Boot Backend (`/api/v1/*` → `:8085`)**:
   - After signing in, check the Network tab for:
     - `GET /api/v1/trading/market-data/tickers`
     - `GET /api/v1/holdings`
     - `GET /api/v1/clients/profile`
     - `GET /api/v1/news?limit=25&page=1&language=en`
   - Confirm each request returns `200 OK` (and `x-cache: Miss from cloudfront` in response headers, confirming `CachingDisabled` is active).

4. **Test Python Analytics Backend (`/analytics-api/*` → `:5000`)**:
   - Navigate to the **Analytics** tab (`/#/client/analytics`, `/#/reporter/analytics`, or `/#/admin/analytics`).
   - Confirm requests such as `GET /analytics-api/api/analytics/order-status?days=30...` return `200 OK` with JSON/PNG payloads.

---

## 5. Troubleshooting Common Issues

| Symptom | Cause | Fix |
| :--- | :--- | :--- |
| **`403 Forbidden` or `405 Method Not Allowed` on Login (`POST /api/auth/login`)** | Behavior didn't match `/api/*` (went to S3 Default behavior instead), or `Allowed HTTP methods` is set to `GET, HEAD`. | Ensure `/api/*` behavior exists and **Allowed HTTP methods** is set to `GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE`. |
| **`404 Not Found` from Auth (`:3000`) or Analytics (`:5000`)** | `/api` or `/analytics-api` prefix was not stripped before hitting the backend. | Make sure `veridian-api-path-rewrite` is **Published** (not just Saved in Development stage) and associated with **Viewer request** on `/analytics-api/*` and `/api/*`. |
| **`404 Not Found` on `/api/v1/...` from NestJS (`:3000`)** | `/api/*` behavior is above `/api/v1/*` in the CloudFront Behaviors list. | In CloudFront → **Behaviors**, move `/api/v1/*` **above** `/api/*`. |
| **`401 Unauthorized` on authenticated `GET` requests after logging in** | CloudFront stripped the `Authorization` header because caching is enabled or Origin Request Policy is missing. | Set **Cache policy** to `CachingDisabled` and **Origin request policy** to `AllViewerExceptHostHeader` on all 3 API behaviors. |
| **`502 Bad Gateway` or `504 Gateway Timeout` from CloudFront** | CloudFront cannot reach the backend port, or Origin Protocol is set to `HTTPS` when the backend only speaks `HTTP`. | 1. Set Origin **Protocol** to `HTTP only` if your backend has no SSL cert.<br>2. Verify the EC2/ALB Security Group allows inbound traffic on ports `3000`, `5000`, and `8085`. |