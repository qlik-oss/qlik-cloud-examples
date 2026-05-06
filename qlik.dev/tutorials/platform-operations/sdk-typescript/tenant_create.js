import { getAccessToken } from '@qlik/api/auth';
import { getLicenseOverview } from '@qlik/api/licenses';
import { getMyUser, getUsers, createUser } from '@qlik/api/users';
import { getRoles } from '@qlik/api/roles';
import { ROLE_TENANT_ADMIN } from './constants.js';

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

async function createTenantAdmin(sourceHostConfig, targetHostConfig, tenantAdminMail) {
  const { data: resp } = await getUsers({ filter: `email eq "${tenantAdminMail}"` }, { hostConfig: sourceHostConfig });
  if (!resp.data || resp.data.length === 0) {
    throw Error(`No user with email '${tenantAdminMail}' exists in the tenant '${sourceHostConfig.host}.`);
  }
  const [sourceTenantAdminUser] = resp.data;
  console.info(`Retrieved user for email '${tenantAdminMail}' from tenant '${sourceHostConfig.host}'.`);
  if (!sourceTenantAdminUser.roles.includes(ROLE_TENANT_ADMIN)) {
    throw Error(`The user with email '${tenantAdminMail}' is not a tenant admin in the tenant '${sourceHostConfig.host}.`);
  }
  const { data: targetRolesResp } = await getRoles({ filter: `name eq "${ROLE_TENANT_ADMIN}"` }, { hostConfig: targetHostConfig });
  const targetTenantRoles = targetRolesResp.data ?? [];
  console.info(`Retrieved roles from tenant '${targetHostConfig.host}'.`, targetTenantRoles);

  const targetTenantAdminRole = targetTenantRoles.find((role) => role.name === ROLE_TENANT_ADMIN);
  if (!targetTenantAdminRole) {
    throw new Error(`No role with the name '${ROLE_TENANT_ADMIN}' exists in the tenant '${targetHostConfig.host}'.`);
  }
  const adminConfig = { ...targetHostConfig, scope: 'admin_classic user_default' };
  const { data: user } = await createUser(
    {
      name: sourceTenantAdminUser.name,
      email: sourceTenantAdminUser.email,
      subject: sourceTenantAdminUser.subject,
      assignedRoles: [{ id: targetTenantAdminRole.id }],
    },
    { hostConfig: adminConfig },
  );

  console.info(`Created tenant admin user for email '${tenantAdminMail}' with ID '${user.id}' in tenant '${targetHostConfig.host}'.`);
}

export async function runTenantCreate(sourceHostConfig, registrationHostConfig, clientId, clientSecret, sourceTenantAdminEmail) {
  const licenseKey = await getSignedEntitlementKey(sourceHostConfig);
  const { tenantId, tenantHostname } = await createTenant(registrationHostConfig, licenseKey);
  const targetHostConfig = { authType: 'oauth2', host: tenantHostname, clientId, clientSecret };
  if (await checkAccessToTenant(targetHostConfig, tenantId)) {
    await createTenantAdmin(sourceHostConfig, targetHostConfig, sourceTenantAdminEmail);
  }
  console.log(`The tenant '${targetHostConfig.host}' has been created.`);
  return targetHostConfig;
}
