import { getAccessToken } from '@qlik/api/auth';
import { getLicenseOverview } from '@qlik/api/licenses';
import { getMyUser } from '@qlik/api/users';
import { runTenantAddUser } from './tenant_add_user.js';

async function getSignedEntitlementKey(hostConfig) {
  const { data: overview } = await getLicenseOverview({ hostConfig });
  console.info(`Retrieved the signed entitlement key from tenant '${hostConfig.host}'.`);
  return overview.licenseKey;
}

async function createTenant(hostConfig, licenseKey) {
  const token = await getAccessToken({ hostConfig });
  const resp = await fetch(`https://${hostConfig.host}/api/v1/tenants`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ licenseKey }),
  });
  const res = await resp.json();
  console.info(`Created tenant '${res.hostnames[0]}' with ID '${res.id}'.`);
  return {
    tenantId: res.id,
    tenantHostname: res.hostnames[0],
  };
}

async function checkAccessToTenant(hostConfig, tenantId) {
  const { data: me } = await getMyUser({ hostConfig });
  if (me.tenantId !== tenantId) {
    console.error(`The tenant '${hostConfig.host}' does not have the expected ID: '${tenantId}' != '${me.tenantId}'.`);
    return false;
  }
  console.info(`Successfully accessed tenant '${hostConfig.host}'.`);
  return true;
}

export async function runTenantCreate(sourceHostConfig, registrationHostConfig, clientId, clientSecret, sourceTenantAdminEmail) {
  const licenseKey = await getSignedEntitlementKey(sourceHostConfig);
  const { tenantId, tenantHostname } = await createTenant(registrationHostConfig, licenseKey);
  const targetHostConfig = { authType: 'oauth2', host: tenantHostname, clientId, clientSecret };
  if (await checkAccessToTenant(targetHostConfig, tenantId)) {
    await runTenantAddUser(sourceHostConfig, targetHostConfig, sourceTenantAdminEmail);
  }
  console.log(`The tenant '${targetHostConfig.host}' has been created.`);
  return targetHostConfig;
}
