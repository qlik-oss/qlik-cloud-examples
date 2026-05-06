# Qlik API (JavaScript) Platform Operations Examples

Example JavaScript implementations of the [Platform Operations tutorials](https://qlik.dev/manage/platform-operations/) on [qlik.dev](https://qlik.dev), using [`@qlik/api`](https://www.npmjs.com/package/@qlik/api).

## Prerequisites

* Node.js 22 or higher
* An OAuth M2M client with `clientId` and `clientSecret` — see [Authenticate for Platform Operations](https://qlik.dev/manage/platform-operations/authenticate-for-platform-operations)

## Setup

```bash
npm install
```

## Running

Copy `.env.example` to `.env` and fill in your values, or pass flags directly. If a `.env` file exists, args are read from it; otherwise from the command line.

### [Create a tenant](https://qlik.dev/manage/platform-operations/create-a-tenant)

```bash
node runTenantCreate.js \
  --sourceTenantUrl <HOSTNAME> \
  --registrationTenantUrl register.<REGION>.qlikcloud.com \
  --sourceTenantAdminEmail <admin email> \
  --clientId <CLIENT_ID> \
  --clientSecret <CLIENT_SECRET>
```

### [Configure a tenant](https://qlik.dev/manage/platform-operations/configure-a-tenant)

```bash
node runTenantConfigure.js \
  --targetTenantUrl <HOSTNAME> \
  --clientId <CLIENT_ID> \
  --clientSecret <CLIENT_SECRET>
```

### [Deploy a Qlik Sense application to a tenant](https://qlik.dev/manage/platform-operations/deploy-content-to-a-tenant)

```bash
node runTenantDeploy.js \
  --sourceTenantUrl <HOSTNAME> \
  --sourceAppId <APP_ID> \
  --targetTenantUrl <HOSTNAME> \
  --clientId <CLIENT_ID> \
  --clientSecret <CLIENT_SECRET> \
  [--analyticsConsumerGroupId <GROUP_ID>]
```

`--analyticsConsumerGroupId` is optional. When provided (e.g. the value returned by `runTenantConfigure`), the script verifies that a member of that group can access the published app via OAuth impersonation.
